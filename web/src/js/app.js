/* Domus web client (LG webOS, Samsung Tizen, Android TV WebView, desktop browser).
   Same behaviour as the Freebox QML app; shares Model/Mdi/Theme from tv/js (see shared.js).
   ES5 only: old LG TVs run Chromium 38. */
(function () {
"use strict";

// ====================================================================== helpers
function $(id) { return document.getElementById(id); }
function esc(s) {
    return String(s === undefined || s === null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function icon(name, extra) { return '<i class="mdi' + (extra ? " " + extra : "") + '">' + Mdi.glyph(name) + "</i>"; }
function pad2(n) { return n < 10 ? "0" + n : "" + n; }
function now() { return new Date().getTime(); }

// Shrink an element's font until its text fits its box (QML fontSizeMode).
function fit(el, max, min, both) {
    var size = max;
    el.style.fontSize = size + "px";
    while (size > min && (el.scrollWidth > el.clientWidth + 1 || (both && el.scrollHeight > el.clientHeight + 1))) {
        size -= 1;
        el.style.fontSize = size + "px";
    }
}

// ====================================================================== storage
var store = {
    get: function (k, d) {
        try { var v = window.localStorage.getItem("domus." + k); return v === null ? d : JSON.parse(v); }
        catch (e) { return d; }
    },
    set: function (k, v) { try { window.localStorage.setItem("domus." + k, JSON.stringify(v)); } catch (e) {} }
};

// ====================================================================== platform
var platform = (function () {
    var ua = navigator.userAgent || "";
    if (window.PalmSystem || window.webOS || /Web0S|webOS/i.test(ua)) return "webos";
    if (window.tizen || /Tizen/i.test(ua)) return "tizen";
    if (/Android/i.test(ua)) return "android";
    return "browser";
})();
// Served by Home Assistant at /domus_tv/screen (wall screens, browsers): no address to type.
var HOSTED = !!window.DOMUS_HOSTED;
// Pointer devices (touch screens, mouse, LG Magic Remote) get on-screen buttons.
var POINTER = HOSTED || platform === "browser" || platform === "webos";
function param(name) {
    var m = new RegExp("[?&]" + name + "=([^&]*)").exec(window.location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : "";
}
// Display language: English by default, changed in the menu (remembered on this screen).
I18n.setLang(store.get("lang", "") || "en");
function setLanguage(l) {
    var before = I18n.lang(), n = I18n.setLang(l);
    store.set("lang", n);
    if (n !== before) relabel();
}
function thisScreen() { return I18n.t(HOSTED || platform === "browser" ? "this.screen" : "this.tv"); }
function deviceName() {
    return param("name") || (HOSTED ? I18n.t("device.wall")
        : { webos: "TV LG", tizen: "TV Samsung", android: "Android TV", browser: I18n.t("device.browser") }[platform]);
}
if (POINTER) document.documentElement.className += " pointer";

if (platform === "tizen") {
    try {
        var keysToRegister = ["ColorF0Red", "ColorF1Green", "ChannelUp", "ChannelDown", "Info", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
        for (var i = 0; i < keysToRegister.length; i++) tizen.tvinputdevice.registerKey(keysToRegister[i]);
    } catch (e) {}
}

function exitApp() {
    try {
        if (window.webOS && webOS.platformBack) { webOS.platformBack(); return; }
        if (window.PalmSystem && PalmSystem.platformBack) { PalmSystem.platformBack(); return; }
        if (window.tizen) { tizen.application.getCurrentApplication().exit(); return; }
    } catch (e) {}
    window.close();
}

// Remote keys → names.
function keyOf(e) {
    var c = e.keyCode;
    if (c === 37) return "left";
    if (c === 38) return "up";
    if (c === 39) return "right";
    if (c === 40) return "down";
    if (c === 13 || c === 32) return "ok";
    if (c === 461 || c === 10009 || c === 27 || c === 8) return "back";
    if (c === 457 || c === 404 || c === 73) return "info";          // Info, green, I
    if (c === 403 || c === 77 || c === 93 || c === 18) return "menu"; // red, M, context menu
    if (c === 33 || c === 427) return "chup";
    if (c === 34 || c === 428) return "chdown";
    if (c >= 48 && c <= 57) return "d" + (c - 48);
    if (c >= 96 && c <= 105) return "d" + (c - 96);
    return "";
}

// ====================================================================== state
var app = {
    screen: "boot",
    layout: null,
    states: {},
    online: true,
    failures: 0,
    notice: "",
    haUrl: HOSTED ? window.location.protocol + "//" + window.location.host : (store.get("haUrl", "") || Config.DEFAULT_URL),
    token: store.get("token", ""),
    tvId: store.get("tvId", ""),
    dashIndex: store.get("dashIndex", 0),
    historyCache: {}
};
function base() { return app.haUrl.replace(/\/+$/, ""); }

// ====================================================================== HTTP
function request(method, path, body, auth, cb) {
    var xhr = new XMLHttpRequest(), done = false;
    function finish(status, data) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (auth && status === 401) { tokenRejected(); return; }
        if (cb) cb(status, data);
    }
    var timer = setTimeout(function () { try { xhr.abort(); } catch (e) {} finish(0, null); }, Config.REQUEST_TIMEOUT_MS);
    xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        var data = null;
        try { data = JSON.parse(xhr.responseText); } catch (e) {}
        finish(xhr.status, data);
    };
    try {
        xhr.open(method, base() + path, true);
        if (auth) xhr.setRequestHeader("Authorization", "Bearer " + app.token);
        if (body !== null && body !== undefined) xhr.setRequestHeader("Content-Type", "application/json");
        xhr.send(body !== null && body !== undefined ? JSON.stringify(body) : null);
    } catch (e) { finish(0, null); }
}

function tokenRejected() {
    app.token = ""; store.set("token", "");
    app.layout = null;
    app.notice = I18n.t("notice.revoked");
    show("pair");
}

// ====================================================================== data
var retryLayoutTimer = null, pollTimer = null;
function loadLayout() {
    clearTimeout(retryLayoutTimer);
    request("GET", "/api/domus_tv/layout", null, true, function (status, data) {
        if (status === 200 && data) {
            app.layout = data;
            if (app.dashIndex >= data.dashboards.length) setDash(0);
            app.online = true; app.failures = 0;
            Dash.build();
            pollStates();
        } else {
            app.online = false;
            Dash.bar();
            retryLayoutTimer = setTimeout(loadLayout, 5000);
        }
    });
}

function pollStates() {
    if (app.screen !== "dash" || !app.layout) return;
    request("GET", "/api/domus_tv/states", null, true, function (status, data) {
        if (status === 200 && data) {
            app.online = true; app.failures = 0;
            app.states = data.states || {};
            if (data.v !== app.layout.version) loadLayout();
            else statesChanged();
        } else {
            app.failures++;
            if (app.failures >= 2) app.online = false;
            Dash.bar();
        }
    });
}
function startPolling() {
    clearInterval(pollTimer);
    pollTimer = setInterval(pollStates, Config.STATE_POLL_MS);
}

function statesChanged() {
    Dash.update();
    Details.update();
    Camera.update();
}

function runAction(entity, action, value, onDone) {
    var body = { entity: entity, action: action };
    if (value !== undefined) body.value = value;
    request("POST", "/api/domus_tv/action", body, true, function (status, data) {
        if (status === 200 && data && data.state) {
            app.states[entity] = data.state;
            statesChanged();
        } else if (status !== 200) {
            Toast.show(data && data.message ? data.message : I18n.t("action.failed", status), true);
        }
        if (onDone) onDone(status === 200);
    });
}

function fetchHistory(entity, hours, cb) {
    var key = entity + "|" + hours, hit = app.historyCache[key];
    if (hit && now() - hit.t < 300000) { cb(hit.data); return; }
    request("GET", "/api/domus_tv/history?entity=" + encodeURIComponent(entity) + "&hours=" + hours, null, true,
        function (status, data) {
            if (status === 200 && data) { app.historyCache[key] = { t: now(), data: data }; cb(data); }
        });
}

function cameraUrl(entity) {
    var st = app.states[entity];
    if (!st || !st.a || !st.a.entity_picture) return "";
    var pic = st.a.entity_picture;
    return base() + pic + (pic.indexOf("?") >= 0 ? "&" : "?") + "_=" + now();
}

function setDash(i) { app.dashIndex = i; store.set("dashIndex", i); }

function resetServer() {
    app.token = ""; store.set("token", "");
    app.layout = null; app.states = {};
    show(HOSTED ? "pair" : "setup");
}

// ====================================================================== graph
function drawGraph(canvas, points, color, lineWidth, fillOpacity) {
    var w = canvas.clientWidth, h = canvas.clientHeight, scale = stageScale * (window.devicePixelRatio || 1);
    if (!w || !h) return;
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var pts = points || [], n = pts.length, lo = 1e12, hi = -1e12, first = -1, valid = 0, i;
    for (i = 0; i < n; i++) {
        if (pts[i] === null || pts[i] === undefined) continue;
        valid++;
        if (first < 0) first = i;
        if (pts[i] < lo) lo = pts[i];
        if (pts[i] > hi) hi = pts[i];
    }
    if (first < 0 || n < 2 || valid < 4) return;
    if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
    var padTop = 4, padBottom = 2, gh = h - padTop - padBottom;
    function X(k) { return k * w / (n - 1); }
    function Y(v) { return padTop + (hi - v) / (hi - lo) * gh; }
    ctx.beginPath();
    ctx.moveTo(X(first), Y(pts[first]));
    for (i = first + 1; i < n; i++) if (pts[i] !== null && pts[i] !== undefined) ctx.lineTo(X(i), Y(pts[i]));
    ctx.lineWidth = lineWidth; ctx.lineJoin = "round"; ctx.strokeStyle = color;
    ctx.stroke();
    ctx.lineTo(X(n - 1), h); ctx.lineTo(X(first), h); ctx.closePath();
    ctx.globalAlpha = fillOpacity; ctx.fillStyle = color; ctx.fill(); ctx.globalAlpha = 1;
}

// ====================================================================== live camera image
// Two <img> buffers: the next picture loads behind the current one, so it never flashes.
function LiveImage(container, fitMode) {
    this.el = container;
    container.className = "cam" + (fitMode ? " fit" : "");
    container.innerHTML = "<img><img>";
    this.imgs = container.getElementsByTagName("img");
    this.front = -1; this.loading = false; this.timer = null; this.entity = ""; this.onready = null;
    var self = this;
    for (var i = 0; i < 2; i++) (function (k) {
        self.imgs[k].onload = function () {
            self.loading = false;
            self.imgs[k].className = "front";
            self.imgs[1 - k].className = "";
            self.front = k;
            if (self.onready) self.onready();
        };
        self.imgs[k].onerror = function () { self.loading = false; };
    })(i);
}
LiveImage.prototype.start = function (entity, interval) {
    this.stop();
    if (entity !== this.entity) { this.front = -1; this.imgs[0].className = ""; this.imgs[1].className = ""; }
    this.entity = entity;
    var self = this;
    this.refresh();
    this.timer = setInterval(function () { self.refresh(); }, interval);
};
LiveImage.prototype.stop = function () { clearInterval(this.timer); this.timer = null; };
LiveImage.prototype.refresh = function () {
    if (this.loading) return;
    var url = cameraUrl(this.entity);
    if (!url) return;
    this.loading = true;
    this.imgs[this.front === 0 ? 1 : 0].src = url;
};
LiveImage.prototype.ready = function () { return this.front >= 0; };

// ====================================================================== toast
var Toast = {
    timer: null,
    show: function (msg, isError) {
        var el = $("toast");
        el.textContent = msg;
        el.className = "show" + (isError ? " error" : "");
        clearTimeout(this.timer);
        this.timer = setTimeout(function () { el.className = isError ? "error" : ""; }, 3500);
    }
};

// ====================================================================== setup screen
var Setup = {
    https: false, parts: ["192", "168", "1", "10", "8123"], seg: 1, fresh: true, hostUrl: "", ipMode: true, error: "",

    parse: function (u) {
        var m = /^(https?):\/\/([^\/:]+)(?::(\d+))?/.exec(u || "");
        if (!m) return;
        this.https = m[1] === "https";
        var ip = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(m[2]);
        if (ip) { this.parts = [ip[1], ip[2], ip[3], ip[4], m[3] || (this.https ? "443" : "8123")]; this.ipMode = true; }
        else { this.hostUrl = u.replace(/\/+$/, ""); this.ipMode = false; }
    },
    build: function () {
        if (!this.ipMode) return this.hostUrl;
        for (var i = 0; i < 4; i++) {
            var n = parseInt(this.parts[i], 10);
            if (isNaN(n) || n > 255) { this.error = I18n.t("setup.err.byte", i + 1); return ""; }
        }
        var port = parseInt(this.parts[4], 10);
        if (isNaN(port) || port < 1 || port > 65535) { this.error = I18n.t("setup.err.port"); return ""; }
        return (this.https ? "https" : "http") + "://" + this.parts.slice(0, 4).join(".") + ":" + port;
    },
    move: function (d) { this.seg = Math.max(0, Math.min(5, this.seg + d)); this.fresh = true; },
    open: function () { this.parse(app.haUrl); this.seg = 1; this.fresh = true; this.error = ""; this.render(); },
    submit: function (u) { app.haUrl = u; store.set("haUrl", u); app.notice = ""; show("pair"); },

    key: function (k) {
        this.error = "";
        if (!this.ipMode) {
            if (k === "ok") this.submit(this.hostUrl);
            else if (k.charAt(0) === "d" && k.length === 2) { this.ipMode = true; this.seg = 1; }
            else if (k === "back") exitApp();
            this.render();
            return;
        }
        if (k.charAt(0) === "d" && k.length === 2) {
            if (this.seg === 0) return;
            var d = k.charAt(1), i = this.seg - 1, max = this.seg === 5 ? 5 : 3;
            var v = this.fresh ? d : this.parts[i] + d;
            this.fresh = false;
            if (v.length > max) v = d;
            this.parts[i] = v;
            if (this.seg < 5 && (v === "0" || v.length === 3 || parseInt(v + "0", 10) > 255)) this.move(1);
        } else if (k === "left") this.move(-1);
        else if (k === "right") this.move(1);
        else if (k === "up" || k === "down") {
            if (this.seg === 0) {
                this.https = !this.https;
                if (this.parts[4] === "8123" && this.https) this.parts[4] = "443";
                else if (this.parts[4] === "443" && !this.https) this.parts[4] = "8123";
            } else {
                var hi = this.seg === 5 ? 65535 : 255;
                var n = (parseInt(this.parts[this.seg - 1], 10) || 0) + (k === "up" ? 1 : -1);
                this.parts[this.seg - 1] = String(Math.max(0, Math.min(hi, n)));
                this.fresh = true;
            }
        } else if (k === "back") {
            var p = this.parts[this.seg - 1];
            if (this.seg > 0 && p.length > 0 && !this.fresh) this.parts[this.seg - 1] = p.slice(0, -1);
            else if (this.seg > 0) this.move(-1);
            else exitApp();
        } else if (k === "ok") {
            var u = this.build();
            if (u) { this.submit(u); return; }
        } else return;
        this.render();
    },
    click: function (seg) {
        if (seg === "go") { var u = this.build(); if (u) this.submit(u); else this.render(); return; }
        this.seg = seg; this.fresh = true;
        if (seg === 0) this.key("up"); else this.render();
    },

    render: function () {
        var h = '<div class="col" style="width:900px">';
        h += '<div class="brand">' + icon("home-automation") + "<span>Domus</span></div>";
        h += '<div class="sub">Adresse de votre Home Assistant</div>';
        if (this.ipMode) {
            h += '<div class="ip">';
            for (var i = 0; i < 6; i++) {
                if (i === 1) h += '<span class="sep">://</span>';
                else if (i > 1 && i < 5) h += '<span class="sep">.</span>';
                else if (i === 5) h += '<span class="sep">:</span>';
                var txt = i === 0 ? (this.https ? "https" : "http") : this.parts[i - 1];
                h += '<span class="fld' + (i === 0 || i === 5 ? " wide" : "") + (this.seg === i ? " sel" : "") + '" data-seg="' + i + '">' + esc(txt) + "</span>";
            }
            h += "</div>";
        } else {
            h += '<div class="host" data-seg="go">' + esc(this.hostUrl) + "</div>";
        }
        h += '<div class="hint' + (this.error ? " err" : "") + '">' + esc(this.error ? this.error
            : I18n.t(this.ipMode ? "setup.hint.ip" : "setup.hint.host")) + "</div>";
        h += "</div>";
        $("setup").innerHTML = h;
    }
};

// ====================================================================== pairing screen
var Pair = {
    active: false, code: "", pollId: "", home: "", status: "connecting", message: "", remaining: 0,
    pollTimer: null, countTimer: null, retryTimer: null,

    stop: function () {
        clearInterval(this.pollTimer); clearInterval(this.countTimer); clearTimeout(this.retryTimer);
        this.code = ""; this.pollId = "";
    },
    open: function () { this.active = true; this.start(); },
    close: function () { this.active = false; this.stop(); },
    start: function () {
        var self = this;
        this.stop();
        this.status = "connecting"; this.message = "";
        this.render();
        request("POST", "/api/domus_tv/pair/start", { name: deviceName() }, false, function (st, data) {
            if (!self.active) return;
            if (st === 200 && data && data.code) {
                self.code = data.code; self.pollId = data.poll_id; self.home = data.home || "";
                self.remaining = data.expires_in || 600;
                self.status = "waiting";
                self.pollTimer = setInterval(function () { self.poll(); }, 2000);
                self.countTimer = setInterval(function () { if (self.remaining > 0) self.remaining--; self.renderCount(); }, 1000);
            } else {
                self.status = "error";
                if (st === 0) self.message = I18n.t("pair.err.noanswer", app.haUrl);
                else if (st === 404) self.message = I18n.t("pair.err.noint");
                else if (st === 429) self.message = I18n.t("pair.err.busy");
                else self.message = I18n.t("pair.err.other", st);
                self.retryTimer = setTimeout(function () { self.start(); }, 6000);
            }
            self.render();
        });
    },
    poll: function () {
        var self = this;
        request("GET", "/api/domus_tv/pair/poll/" + this.pollId, null, false, function (st, data) {
            if (!self.active) return;
            if (st === 200 && data && data.token) {
                self.stop();
                app.token = data.token; store.set("token", data.token);
                app.tvId = data.tv_id; store.set("tvId", data.tv_id);
                app.notice = "";
                show("dash");
            } else if (st === 404) self.start();
        });
    },
    key: function (k) {
        if ((k === "back" || k === "left") && !HOSTED) show("setup");
        else if (k === "ok") this.start();
    },
    countText: function () {
        var r = this.remaining;
        return I18n.t("pair.waiting", Math.floor(r / 60), pad2(r % 60));
    },
    renderCount: function () { var el = $("pair-count"); if (el) el.textContent = this.countText(); },
    render: function () {
        var h = '<div class="col w1000">';
        h += '<div class="pair-title">' + esc(this.home ? I18n.t("pair.titleHome", thisScreen(), this.home) : I18n.t("pair.title", thisScreen())) + "</div>";
        if (app.notice) h += '<div class="sub warn w1000">' + esc(app.notice) + "</div>";
        if (this.status === "waiting") {
            h += '<div class="digits">';
            for (var i = 0; i < this.code.length; i++) h += '<span class="digit">' + esc(this.code.charAt(i)) + "</span>";
            h += "</div>";
            h += '<div class="sub w1000">' + I18n.t("pair.instructions") + "</div>";
            h += '<div class="hint" id="pair-count">' + esc(this.countText()) + "</div>";
        } else if (this.status === "connecting") {
            h += '<div class="sub">' + esc(I18n.t("pair.connecting", app.haUrl)) + "</div>";
        } else {
            h += '<div class="sub err w1000">' + esc(this.message) + "</div>";
        }
        h += '<div class="hint" style="font-size:18px">' + esc(I18n.t(HOSTED ? "pair.hint.touch" : "pair.hint")) + "</div>";
        h += "</div>";
        $("pair").innerHTML = h;
    }
};

// ====================================================================== dashboard
var TOP_PAD = 16;
var Dash = {
    focusIndex: -1, contentY: 0, busyEntity: "", confirmEntity: "", exitArmed: false,
    tiles: [], columns: 6, metrics: null, els: [], cache: [], clockTimer: null, histTimer: null,

    dashboards: function () { return app.layout ? app.layout.dashboards : []; },
    dash: function () { var d = this.dashboards(); return d.length ? d[Math.min(app.dashIndex, d.length - 1)] : null; },

    open: function () {
        var self = this;
        if (!this.clockTimer) this.clockTimer = setInterval(function () { self.bar(); }, 10000);
        this.render();
        if (app.layout) { this.build(); startPolling(); pollStates(); }
        else { loadLayout(); startPolling(); }
    },
    close: function () { clearInterval(pollTimer); this.stopCameras(); },

    render: function () {
        $("dash").innerHTML = '<div id="bar"></div><div id="viewport"><div id="grid"></div></div><div id="dashmsg"></div>';
        this.bar();
    },

    bar: function () {
        var el = $("bar");
        if (!el) return;
        var d = this.dash(), ds = this.dashboards(), hd = Model.header(d), t = new Date();
        var clockPx = Model.clockPx(hd.clock_size);
        var clock = hd.clock === "off" ? "" : '<span class="clockbox">'
            + (hd.date !== "off" ? '<span class="date" style="font-size:' + Math.max(16, Math.round(clockPx * 0.62)) + 'px">' + esc(I18n.headerDate(t, hd.date)) + "</span>" : "")
            + '<span class="clock" style="font-size:' + clockPx + 'px">' + esc(I18n.clock(t, hd.clock_format)) + "</span></span>";
        // left: icon, title, dots (and the clock when placed left)
        var h = '<div class="left">';
        if (hd.clock === "left") h += clock;
        if (hd.title) {
            h += icon(d && d.icon ? d.icon : "home-automation").replace('class="mdi"', 'class="mdi" style="font-size:36px;color:' + (d && d.icon ? Theme.text : Theme.accent) + '"');
            h += '<span class="title">' + esc(d ? d.title : "") + "</span>";
        }
        if (hd.dots && ds.length > 1) {
            h += "<span>";
            for (var i = 0; i < ds.length; i++) h += '<span class="dot' + (i === app.dashIndex ? " on" : "") + '" data-dash="' + i + '"></span>';
            h += "</span>";
        }
        h += "</div>";
        if (hd.clock === "center") h += '<div class="center">' + clock + "</div>";
        // right: status chips, weather, offline warning, clock, menu button
        h += '<div class="right">';
        for (var c = 0; c < hd.chips.length; c++) {
            var cid = hd.chips[c], cst = app.states[cid], ct = { entity: cid };
            var on = Model.isOn(cst);
            h += '<span class="chip' + (on ? " on" : "") + '" data-chip="' + esc(cid) + '">' + icon(Model.icon(ct, cst))
                + '<span class="ct">' + esc(Model.stateText(ct, cst)) + "</span></span>";
        }
        if (hd.weather) {
            var wst = app.states[hd.weather];
            h += '<span class="wx" data-chip="' + esc(hd.weather) + '">' + icon(Model.weatherIcon(wst ? wst.s : ""))
                + '<span class="ct">' + esc(Model.weatherText(wst)) + "</span></span>";
        }
        if (!app.online) h += '<span class="offline">' + icon("lan-disconnect") + esc(I18n.t("dash.offline")) + "</span>";
        if (hd.clock === "right") h += clock;
        if (POINTER) h += '<span class="menubtn" data-cmd="menu">' + icon("menu") + "</span>";
        h += "</div>";
        el.innerHTML = h;
        var msg = $("dashmsg");
        if (msg) {
            if (!app.layout) msg.innerHTML = '<div class="empty"><div style="font-size:26px;color:#9aa5b5">' + esc(I18n.t(app.online ? "dash.loading" : "dash.connecting")) + "</div>"
                + (app.online ? "" : '<div style="font-size:20px;color:#6b7585;margin-top:14px">' + esc(app.haUrl) + '</div><div style="font-size:20px;margin-top:14px">' + esc(I18n.t("dash.offlineHint")) + '</div>') + "</div>";
            else if (!this.tiles.length) msg.innerHTML = '<div class="empty"><div style="font-size:30px">' + esc(I18n.t("dash.empty")) + '</div><div style="font-size:20px;color:#9aa5b5;margin-top:12px">' + esc(I18n.t("dash.emptyHint")) + "</div></div>";
            else msg.innerHTML = "";
        }
    },

    // (Re)create tile elements for the current dashboard.
    build: function () {
        if (app.screen !== "dash") return;
        this.stopCameras();
        var d = this.dash();
        this.tiles = d ? d.tiles : [];
        this.columns = d ? d.columns : 6;
        this.metrics = Model.rowMetrics(this.tiles, this.columns);
        if (this.focusIndex < 0 || this.focusIndex >= this.tiles.length || Model.effectiveType(this.tiles[this.focusIndex]) === "header")
            this.focusIndex = Model.firstFocusable(this.tiles);
        var grid = $("grid");
        if (!grid) { this.render(); grid = $("grid"); }
        grid.innerHTML = "";
        this.els = []; this.cache = [];
        var k = Math.max(0.65, Math.min(1.35, Model.cellSize(this.columns).h / 136));
        for (var i = 0; i < this.tiles.length; i++) {
            var el = this.makeTile(this.tiles[i], i, k);
            grid.appendChild(el);
            this.els.push(el);
            this.cache.push({});
        }
        grid.style.height = (this.metrics.total + Model.SCREEN.bottom + 2 * TOP_PAD) + "px";
        this.contentY = 0;
        this.bar();
        this.update();
        this.focus(this.focusIndex);
        this.loadGraphs();
        var self = this;
        clearInterval(this.histTimer);
        this.histTimer = setInterval(function () { self.loadGraphs(); }, 300000);
    },

    makeTile: function (t, i, k) {
        var type = Model.effectiveType(t), r = Model.tileRect(t, this.columns, this.metrics);
        var el = document.createElement("div");
        el.className = "tile";
        el.style.cssText = "left:" + r.x + "px;top:" + (r.y + TOP_PAD) + "px;width:" + r.w + "px;height:" + r.h + "px";
        el.setAttribute("data-i", i);
        var info = { type: type, k: k, w: r.w, h: r.h };
        el._info = info;
        if (type === "header") {
            el.innerHTML = '<div class="hdr"><div>' + esc(t.name || "") + "</div></div>";
            return el;
        }
        var pad = 14 * k, iconSize = (t.h > 1 ? 50 : 34) * k, accent = t.color || Theme.accent;
        info.pad = pad; info.iconSize = iconSize; info.accent = accent;
        var h = '<div class="card"><div class="tint" style="background:' + esc(accent) + '"></div>';
        if (type === "camera") {
            h += '<div class="camholder"></div>';
            h += '<div class="camlabel" style="height:' + (44 * k) + 'px"><div class="nowrap" style="left:' + pad + "px;right:" + pad + "px;font-size:" + (18 * k) + 'px"></div></div>';
        } else {
            h += '<i class="mdi ico" style="left:' + pad + "px;top:" + (pad * 0.9) + "px;font-size:" + iconSize + 'px"></i>';
            h += '<div class="big" style="right:' + pad + "px;top:" + (pad * 0.6) + "px;width:" + (r.w - 2 * pad - iconSize - 8 * k) + "px;height:" + (iconSize + 6 * k) + "px;line-height:" + (iconSize + 6 * k) + 'px"></div>';
            h += '<canvas></canvas>';
            h += '<div class="nm"></div>';
            h += '<div class="st" style="left:' + pad + "px;right:" + pad + "px;bottom:" + pad + "px;height:" + (26 * k) + "px;line-height:" + (26 * k) + 'px"></div>';
        }
        h += '<div class="busy" style="right:' + (12 * k) + "px;top:" + (12 * k) + "px;width:" + (14 * k) + "px;height:" + (14 * k) + "px;background:" + esc(accent) + '"></div>';
        h += '</div><div class="ring"></div>';
        el.innerHTML = h;
        if (type === "camera") {
            var holder = el.querySelector(".camholder");
            holder.style.cssText = "position:absolute;left:0;top:0;right:0;bottom:0";
            info.live = new LiveImage(holder, false);
            info.live.start(t.entity, Config.CAMERA_TILE_MS);
        }
        return el;
    },

    // Refresh tile contents from app.states (only what changed).
    update: function () {
        if (app.screen !== "dash") return;
        for (var i = 0; i < this.tiles.length; i++) this.updateTile(i);
        this.bar();
    },

    updateTile: function (i) {
        var t = this.tiles[i], el = this.els[i], info = el._info, c = this.cache[i];
        if (info.type === "header") return;
        var st = app.states[t.entity];
        var on = Model.isOn(st), unavail = t.entity !== "" && st !== undefined && Model.isUnavailable(st, t.entity);
        var bigValue = info.type === "climate" || (info.type === "sensor" && Model.isNumeric(st));
        var cls = "tile" + (i === this.focusIndex ? " sel" : "") + (on && info.type !== "camera" && !bigValue ? " on" : "")
            + (unavail ? " unavail" : "") + (this.busyEntity && this.busyEntity === t.entity ? " busyon" : "");
        if (el.className !== cls) el.className = cls;
        var name = Model.name(t, st);
        if (info.type === "camera") {
            if (c.name !== name) { el.querySelector(".camlabel div").textContent = name; c.name = name; }
            return;
        }
        var k = info.k, pad = info.pad, text = Model.stateText(t, st), ic = Model.icon(t, st);
        var color = on ? info.accent : Theme.text2;
        var ico = el.querySelector(".ico");
        if (c.icon !== ic) { ico.textContent = Mdi.glyph(ic); c.icon = ic; }
        if (c.color !== color) { ico.style.color = color; c.color = color; }

        var big = el.querySelector(".big"), stl = el.querySelector(".st"), nm = el.querySelector(".nm");
        var showState = !bigValue && text !== "";
        if (c.bigValue !== bigValue || c.text !== text) {
            big.style.display = bigValue ? "block" : "none";
            stl.style.display = showState ? "block" : "none";
            if (bigValue) { big.textContent = text; fit(big, (t.w > 1 || t.h > 1 ? 36 : 28) * k, 11, true); }
            else { stl.textContent = text; fit(stl, 21 * k, 12, false); }
        }
        if (c.name !== name || c.showState !== showState) {
            var nh = (t.h > 1 ? 44 : 22) * k;
            var bottom = showState ? pad + 26 * k + 2 * k : pad;
            nm.style.cssText = "left:" + pad + "px;right:" + pad + "px;bottom:" + bottom + "px;height:" + nh + "px;line-height:" + (22 * k) + "px;"
                + (t.h > 1 ? "display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;" : "white-space:nowrap;text-overflow:ellipsis;");
            nm.textContent = name;
            if (t.h <= 1) fit(nm, 18 * k, 12, false); else nm.style.fontSize = (18 * k) + "px";
            // graph between the icon and the name
            var cv = el.querySelector("canvas");
            var top = pad * 0.9 + info.iconSize + 4 * k, gb = bottom + nh + 2 * k;
            cv.style.cssText = "left:" + pad + "px;right:" + pad + "px;top:" + top + "px;height:" + Math.max(0, info.h - top - gb) + "px;width:" + (info.w - 2 * pad) + "px";
            c.graphDirty = true;
        }
        c.bigValue = bigValue; c.text = text; c.name = name; c.showState = showState;
        if (c.graphDirty && c.points) { drawGraph(el.querySelector("canvas"), c.points, info.accent, 2, 0.14); c.graphDirty = false; }
    },

    loadGraphs: function () {
        var self = this;
        for (var i = 0; i < this.tiles.length; i++) (function (i) {
            var t = self.tiles[i];
            if (self.els[i]._info.type !== "sensor" || !(t.graph > 0)) return;
            fetchHistory(t.entity, t.graph, function (d) {
                if (self.tiles[i] !== t) return;
                self.cache[i].points = d.points || [];
                drawGraph(self.els[i].querySelector("canvas"), self.cache[i].points, self.els[i]._info.accent, 2, 0.14);
                self.cache[i].graphDirty = false;
            });
        })(i);
    },

    stopCameras: function () {
        for (var i = 0; i < this.els.length; i++) if (this.els[i]._info.live) this.els[i]._info.live.stop();
        clearInterval(this.histTimer);
    },
    pauseCameras: function (paused) {
        for (var i = 0; i < this.els.length; i++) {
            var live = this.els[i]._info.live;
            if (!live) continue;
            if (paused) live.stop(); else live.start(this.tiles[i].entity, Config.CAMERA_TILE_MS);
        }
    },

    focus: function (i) {
        var prev = this.focusIndex;
        this.focusIndex = i;
        if (prev !== i) this.confirmEntity = "";
        if (this.els[prev]) this.updateTile(prev);
        if (this.els[i]) {
            this.updateTile(i);
            var info = this.els[i]._info;
            var s = 1 + Math.min(0.05, 16 / Math.max(info.w, info.h));
            for (var j = 0; j < this.els.length; j++) {
                var card = this.els[j].querySelector(".card"), ring = this.els[j].querySelector(".ring");
                if (!card) continue;
                var tr = j === i ? "scale(" + s + ")" : "";
                card.style.webkitTransform = tr; card.style.transform = tr;
                ring.style.webkitTransform = tr; ring.style.transform = tr;
            }
        }
        this.ensureVisible();
    },

    ensureVisible: function () {
        var t = this.tiles[this.focusIndex];
        if (!t) return;
        var r = Model.tileRect(t, this.columns, this.metrics), margin = 16;
        var y = r.y + TOP_PAD, viewH = 720 - Model.SCREEN.top;
        var contentH = this.metrics.total + Model.SCREEN.bottom + 2 * TOP_PAD;
        if (y - margin < this.contentY) this.contentY = Math.max(0, y - margin);
        else if (y + r.h + margin > this.contentY + viewH)
            this.contentY = Math.min(Math.max(0, contentH - viewH), y + r.h + margin - viewH);
        this.place(0, true);
    },

    scrollBy: function (dy) {
        if (!this.metrics) return;
        var viewH = 720 - Model.SCREEN.top, contentH = this.metrics.total + Model.SCREEN.bottom + 2 * TOP_PAD;
        this.contentY = Math.max(0, Math.min(Math.max(0, contentH - viewH), this.contentY + dy));
        this.place(0, true);
    },

    // Position the grid: x = horizontal offset (swipe), y = scroll. animate=false while a finger drags.
    place: function (x, animate) {
        var g = $("grid");
        if (!g) return;
        var tr = "translate(" + Math.round(x) + "px," + Math.round(-this.contentY) + "px)";
        var tn = animate ? "-webkit-transform 0.22s ease-out" : "none";
        g.style.webkitTransition = tn; g.style.transition = animate ? "transform 0.22s ease-out" : "none";
        g.style.webkitTransform = tr; g.style.transform = tr;
    },

    // dir: +1 = next (slides in from the right), -1 = previous, 0/undefined = no animation.
    switchDash: function (i, dir) {
        var ds = this.dashboards();
        if (!ds.length) return;
        if (ds.length < 2 && dir) { this.place(0, true); return; }
        setDash((i + ds.length) % ds.length);
        this.focusIndex = -1;
        this.build();
        if (dir) {
            var self = this;
            this.place(dir * 1280, false);
            var g = $("grid");
            if (g) void g.offsetWidth;   // apply the start position before animating
            setTimeout(function () { self.place(0, true); }, 16);
        }
    },

    cameraTiles: function () {
        var out = [];
        for (var i = 0; i < this.tiles.length; i++) if (Model.effectiveType(this.tiles[i]) === "camera") out.push(this.tiles[i]);
        return out;
    },

    activate: function () {
        var t = this.tiles[this.focusIndex], self = this;
        if (!t) return;
        var p = Model.primary(t, app.states[t.entity]);
        if (p.ui === "camera") { Camera.open(this.cameraTiles(), t.entity); return; }
        if (p.ui === "details") { Details.open(t); return; }
        if (p.ui === "confirm" && this.confirmEntity !== t.entity) {
            this.confirmEntity = t.entity;
            clearTimeout(this.confirmTimer);
            this.confirmTimer = setTimeout(function () { self.confirmEntity = ""; }, 4000);
            var locked = app.states[t.entity] && app.states[t.entity].s === "locked";
            Toast.show(I18n.t(locked ? "confirm.unlock" : "confirm.lock", Model.name(t, app.states[t.entity])));
            return;
        }
        this.confirmEntity = "";
        this.busyEntity = t.entity;
        this.updateTile(this.focusIndex);
        runAction(t.entity, p.action, p.value, function () { self.busyEntity = ""; self.update(); });
    },

    key: function (k) {
        var self = this;
        if (k === "left" || k === "right" || k === "up" || k === "down") {
            var n = Model.neighbour(this.tiles, this.focusIndex, k);
            if (n >= 0) this.focus(n);
            else if (k === "up") { this.contentY = 0; this.place(0, true); }
            return;
        }
        if (k === "ok" && !app.layout) { Menu.open(); return; }
        if (k === "ok") { this.activate(); return; }
        if (k === "info") { if (this.tiles[this.focusIndex]) Details.open(this.tiles[this.focusIndex]); return; }
        if (k === "menu") { Menu.open(); return; }
        if (k === "chup") { this.switchDash(app.dashIndex + 1, 1); return; }
        if (k === "chdown") { this.switchDash(app.dashIndex - 1, -1); return; }
        if (k.charAt(0) === "d" && k !== "d0") { var i = +k.charAt(1) - 1; if (i < this.dashboards().length) this.switchDash(i); return; }
        if (k === "back") {
            if (!app.online || !app.layout) { Menu.open(); return; }
            if (this.exitArmed) { exitApp(); return; }
            this.exitArmed = true;
            setTimeout(function () { self.exitArmed = false; }, 2500);
            Toast.show(I18n.t("dash.exitRed"));
        }
    }
};

// ====================================================================== detail panel
var Details = {
    tile: null, current: 0, confirmEntity: "", hist: null, rows: [], scrollY: 0,

    open: function (t) {
        var self = this;
        this.tile = t; this.current = 0; this.hist = null; this.scrollY = 0; this.confirmEntity = "";
        overlay(this);
        this.render();
        if (Model.isNumeric(app.states[t.entity]))
            fetchHistory(t.entity, 24, function (d) { if (self.tile === t) { self.hist = d; self.render(); } });
    },
    close: function () { this.tile = null; closeOverlay(this); },
    update: function () { if (this.tile) this.render(); },

    runLink: function (id) {
        var lst = app.states[id], p = Model.linkPrimary(id, lst);
        if (p.ui === "camera") { this.close(); Camera.open(Dash.cameraTiles(), id); return; }
        if (p.ui === "details") { this.open({ entity: id, type: "auto", name: "", icon: "", color: "", links: [] }); return; }
        if (p.ui === "confirm" && this.confirmEntity !== id) {
            this.confirmEntity = id;
            Toast.show(I18n.t(lst && lst.s === "locked" ? "confirm.unlock" : "confirm.lock", Model.name({ entity: id }, lst)));
            return;
        }
        this.confirmEntity = "";
        runAction(id, p.action, p.value);
    },

    key: function (k) {
        if (k === "back" || k === "info" || k === "menu") { this.close(); return; }
        if (k === "up") { if (this.current > 0) this.current--; this.confirmEntity = ""; this.render(); return; }
        if (k === "down") { if (this.current < this.rows.length - 1) this.current++; this.confirmEntity = ""; this.render(); return; }
        this.act(k);
    },
    act: function (k) {
        var row = this.rows[this.current];
        if (!row) return;
        if ((k === "left" || k === "right") && row.kind === "stepper") {
            var a = Model.stepAction(row, k === "right" ? 1 : -1);
            runAction(this.tile.entity, a.action, a.value);
            return;
        }
        if (k !== "ok") return;
        if (row.kind === "link") { this.runLink(row.entity); return; }
        if (row.ui === "camera") { var e = this.tile.entity; this.close(); Camera.open(Dash.cameraTiles(), e); return; }
        if (row.kind === "button") runAction(this.tile.entity, row.action);
    },

    render: function () {
        var t = this.tile, st = app.states[t.entity];
        this.rows = Model.detailRows(t, st).concat(Model.linkRows(t));
        if (this.current >= this.rows.length) this.current = Math.max(0, this.rows.length - 1);
        var color = Model.isOn(st) ? (t.color || Theme.accent) : Theme.text2;
        var h = '<div class="dim"></div><div class="side r">' + (POINTER ? '<span class="closebtn" data-close="1">' + icon("close") + "</span>" : "") + '<div class="scroller"><div class="content">';
        h += '<div class="dhead"><i class="mdi" style="color:' + esc(color) + '">' + Mdi.glyph(Model.icon(t, st)) + "</i>";
        h += '<div class="t nowrap">' + esc(Model.name(t, st)) + '</div><div class="s nowrap">' + esc(Model.stateText(t, st)) + "</div></div>";
        for (var i = 0; i < this.rows.length; i++) {
            var r = this.rows[i], sel = i === this.current ? " sel" : "";
            if (r.kind === "link") {
                if (i === 0 || this.rows[i - 1].kind !== "link") h += '<div class="sect">' + esc(I18n.t("details.linked")) + "</div>";
                var lst = app.states[r.entity], ln = { entity: r.entity };
                h += '<div class="row' + sel + '" data-row="' + i + '"><i class="mdi" style="color:' + (Model.isOn(lst) ? Theme.accent : Theme.text2) + '">' + Mdi.glyph(Model.icon(ln, lst)) + "</i>";
                h += '<div class="lbl nowrap" style="width:210px">' + esc(Model.name(ln, lst)) + "</div>";
                h += '<div class="val nowrap" style="width:120px">' + esc(this.confirmEntity === r.entity ? I18n.t("confirm.ok") : Model.stateText(ln, lst)) + "</div></div>";
            } else {
                h += '<div class="row' + sel + '" data-row="' + i + '">' + icon(r.icon || "") + '<div class="lbl nowrap" style="width:220px">' + esc(r.label) + "</div>";
                if (r.kind === "stepper") h += '<div class="step"><span class="hit" data-step="-1">' + icon("chevron-left") + "</span><span>" + esc(r.value || "") + '</span><span class="hit" data-step="1">' + icon("chevron-right") + "</span></div>";
                h += "</div>";
            }
        }
        var numeric = Model.isNumeric(st) && Model.effectiveType(t) === "sensor";
        if (numeric) {
            var hs = this.hist;
            h += '<div class="hhead"><span style="float:left">' + esc(I18n.t("details.last24")) + '</span><span style="float:right">'
                + (hs && hs.min !== null && hs.min !== undefined ? I18n.t("details.minmax", Model.fmtNumber(hs.min), Model.fmtNumber(hs.max)) : "") + "</span></div>";
            h += '<div class="histbox"><canvas id="dhist" style="position:absolute;left:10px;top:10px;width:376px;height:130px"></canvas>';
            if (!hs || !hs.points || !hs.points.length)
                h += '<div class="msg">' + esc(I18n.t(hs && hs.recorder === false ? "details.noRecorder" : hs ? "details.noHistory" : "dash.loading")) + "</div>";
            h += "</div>";
        }
        var info = Model.infoLines(t, st);
        for (var j = 0; j < info.length; j++)
            h += '<div class="info"><span class="k">' + esc(info[j][0]) + '</span><span class="v">' + esc(info[j][1]) + "</span></div>";
        h += '</div></div><div class="keyhint">' + esc(I18n.t(HOSTED ? "details.hintTouch" : this.rows.length ? "details.hint" : "details.hintClose")) + "</div></div>";
        var el = $("details");
        el.innerHTML = h;
        if (numeric && this.hist) drawGraph($("dhist"), this.hist.points, t.color || Theme.accent, 2.5, 0.18);
        // keep the selected row in view
        var sc = el.querySelector(".scroller"), content = el.querySelector(".content"), rowEl = el.querySelector(".row.sel");
        if (rowEl) {
            var y = rowEl.offsetTop, hgt = rowEl.offsetHeight, viewH = sc.clientHeight;
            if (this.current === 0) this.scrollY = 0;
            else if (y + hgt > this.scrollY + viewH) this.scrollY = Math.min(content.offsetHeight - viewH, y + hgt - viewH + 8);
            else if (y < this.scrollY) this.scrollY = Math.max(0, y - 8);
        }
        content.style.webkitTransform = "translateY(" + (-this.scrollY) + "px)";
        content.style.transform = "translateY(" + (-this.scrollY) + "px)";
    }
};

// ====================================================================== camera view
var Camera = {
    cameras: [], index: 0, action: 0, confirmEntity: "", live: null, hintTimer: null, isOpen: false,

    links: function () { var t = this.cameras[this.index]; return t && t.links ? t.links.filter(function (e) { return !!e; }) : []; },
    open: function (list, entity) {
        var found = -1;
        for (var i = 0; i < list.length; i++) if (list[i].entity === entity) found = i;
        if (found < 0) { list = [{ entity: entity, type: "camera", name: "", links: [] }]; found = 0; }
        this.cameras = list; this.index = found; this.action = 0; this.confirmEntity = "";
        this.isOpen = true;
        overlay(this);
        Dash.pauseCameras(true);
        var el = $("camera");
        el.innerHTML = '<div class="cam"></div><div class="loading">Chargement de l\'image…</div><div class="camhint"><div class="n"></div><div class="h"></div></div><div class="actbar"></div>';
        var self = this;
        this.live = new LiveImage(el.querySelector(".cam"), true);
        this.live.onready = function () { el.querySelector(".loading").style.display = "none"; };
        this.startLive();
        this.render();
    },
    startLive: function () {
        $("camera").querySelector(".loading").style.display = "block";
        this.live.start(this.cameras[this.index].entity, Config.CAMERA_FULL_MS);
    },
    close: function () {
        this.isOpen = false;
        if (this.live) this.live.stop();
        closeOverlay(this);
        Dash.pauseCameras(false);
    },
    update: function () { if (this.isOpen) this.render(); },
    setIndex: function (i) { this.index = i; this.action = 0; this.confirmEntity = ""; this.startLive(); },

    runAction: function (id) {
        var st = app.states[id], p = Model.linkPrimary(id, st), self = this;
        if (p.ui === "camera") { this.close(); this.open(this.cameras, id); return; }
        if (p.ui === "details") { Toast.show(I18n.t("camera.useInfo", Model.name({ entity: id }, st))); return; }
        if (p.ui === "confirm" && this.confirmEntity !== id) {
            this.confirmEntity = id;
            Toast.show(I18n.t(st && st.s === "locked" ? "confirm.unlock" : "confirm.lock", Model.name({ entity: id }, st)));
            this.render();
            return;
        }
        this.confirmEntity = "";
        runAction(id, p.action, p.value, function (ok) {
            if (ok) Toast.show(I18n.t("toast.state", Model.name({ entity: id }, app.states[id]), Model.stateText({ entity: id }, app.states[id])));
        });
    },

    key: function (k) {
        var links = this.links(), n = this.cameras.length;
        if (k === "back") { this.close(); return; }
        if (links.length) {
            if (k === "right") { this.action = Math.min(links.length - 1, this.action + 1); this.confirmEntity = ""; }
            else if (k === "left") { this.action = Math.max(0, this.action - 1); this.confirmEntity = ""; }
            else if (k === "ok") this.runAction(links[this.action]);
            else if ((k === "down" || k === "chdown") && n > 1) this.setIndex((this.index + 1) % n);
            else if ((k === "up" || k === "chup") && n > 1) this.setIndex((this.index + n - 1) % n);
        }
        else if (k === "ok") { this.close(); return; }
        else if (k === "right" && n > 1) this.setIndex((this.index + 1) % n);
        else if (k === "left" && n > 1) this.setIndex((this.index + n - 1) % n);
        this.render();
    },

    render: function () {
        var el = $("camera"), links = this.links(), n = this.cameras.length, cam = this.cameras[this.index];
        el.querySelector(".n").textContent = Model.name(cam, app.states[cam.entity]);
        el.querySelector(".h").textContent = links.length
            ? I18n.t("camera.hintActions") + (n > 1 ? I18n.t("camera.hintOther") : "") + " · " + I18n.t("camera.hintClose")
            : (n > 1 ? (this.index + 1) + "/" + n + " · " + I18n.t("camera.hintSwitch") : "") + I18n.t("camera.hintClose");
        var hint = el.querySelector(".camhint");
        hint.style.opacity = 1;
        clearTimeout(this.hintTimer);
        this.hintTimer = setTimeout(function () { hint.style.opacity = 0; }, 4000);
        var h = "";
        for (var i = 0; i < links.length; i++) {
            var id = links[i], st = app.states[id], ln = { entity: id }, conf = this.confirmEntity === id;
            h += '<div class="act' + (i === this.action ? " sel" : "") + (Model.isOn(st) ? " on" : "") + '" data-act="' + i + '">' + icon(Model.icon(ln, st));
            h += '<div class="a1 nowrap">' + esc(Model.name(ln, st)) + '</div><div class="a2 nowrap' + (conf ? " warn" : "") + '">'
                + esc(conf ? I18n.t("confirm.ok") : Model.stateText(ln, st)) + "</div></div>";
        }
        el.querySelector(".actbar").innerHTML = h;
    }
};

// ====================================================================== menu
var Menu = {
    current: 0, confirmForget: false, entries: [],
    open: function () { this.current = app.dashIndex; this.confirmForget = false; overlay(this); this.render(); },
    close: function () { closeOverlay(this); },
    build: function () {
        var out = [], ds = Dash.dashboards();
        for (var i = 0; i < ds.length; i++)
            out.push({ label: (i + 1) + ". " + ds[i].title, icon: ds[i].icon ? ds[i].icon.replace("mdi:", "") : "view-dashboard", dash: i });
        out.push({ label: I18n.t("menu.language"), icon: "translate", cmd: "lang" });
        out.push({ label: I18n.t("menu.reload"), icon: "refresh", cmd: "reload" });
        if (!HOSTED) out.push({ label: I18n.t("menu.server"), icon: "server-network", cmd: "server" });
        out.push({ label: I18n.t(this.confirmForget ? "menu.forgetConfirm" : "menu.forget", thisScreen()), icon: "link-off", cmd: "forget" });
        if (!HOSTED && platform !== "browser") out.push({ label: I18n.t("menu.quit"), icon: "exit-to-app", cmd: "quit" });
        return out;
    },
    key: function (k) {
        if (k === "back" || k === "menu" || k === "left") { this.close(); return; }
        if (k === "up") { if (this.current > 0) this.current--; this.confirmForget = false; }
        else if (k === "down") { if (this.current < this.entries.length - 1) this.current++; this.confirmForget = false; }
        else if (k === "ok") { this.pick(this.current); return; }
        this.render();
    },
    pick: function (i) {
        var e = this.entries[i];
        if (!e) return;
        if (e.dash !== undefined) { this.close(); Dash.switchDash(e.dash); }
        else if (e.cmd === "reload") { this.close(); app.historyCache = {}; loadLayout(); }
        else if (e.cmd === "server") { this.close(); resetServer(); }
        else if (e.cmd === "lang") { this.current = i; setLanguage(I18n.nextLang()); }
        else if (e.cmd === "quit") exitApp();
        else if (e.cmd === "forget") {
            if (!this.confirmForget) { this.current = i; this.confirmForget = true; this.render(); return; }
            this.close(); resetServer();
        }
    },
    render: function () {
        this.entries = this.build();
        var h = '<div class="dim"></div><div class="side l"><div style="position:absolute;left:28px;right:28px;top:28px">';
        h += '<div class="menuhead nowrap">' + esc(app.layout && app.layout.home ? app.layout.home : "Domus") + "</div>";
        h += '<div class="menuurl nowrap">' + esc(app.haUrl) + "</div></div>";
        // entries scroll when there are many dashboards
        var rowH = 60, listH = 720 - 140 - 52, total = this.entries.length * rowH;
        var y = Math.max(0, Math.min(total - listH, (this.current + 1) * rowH - listH + 8));
        h += '<div style="position:absolute;left:28px;right:28px;top:140px;height:' + listH + 'px;overflow:hidden">'
            + '<div style="-webkit-transform:translateY(' + (-y) + 'px);transform:translateY(' + (-y) + 'px)">';
        for (var i = 0; i < this.entries.length; i++) {
            var e = this.entries[i];
            h += '<div class="mrow' + (i === this.current ? " sel" : "") + (e.dash === app.dashIndex ? " cur" : "")
                + (e.cmd === "forget" && this.confirmForget ? " danger" : "") + '" data-m="' + i + '">' + icon(e.icon)
                + '<div class="lbl nowrap">' + esc(e.label) + "</div></div>";
        }
        h += '</div></div><div class="menufoot">Domus ' + esc(Config.VERSION) + " · " + esc(I18n.t("menu.footer")) + "</div></div>";
        $("menu").innerHTML = h;
    }
};

// Language changed: redraw what is on screen.
function relabel() {
    if (app.screen === "setup") Setup.render();
    else if (app.screen === "pair") Pair.render();
    else if (app.screen === "dash") { Dash.cache = []; for (var i = 0; i < Dash.els.length; i++) Dash.cache.push({}); Dash.update(); Dash.loadGraphs(); }
    for (var j = 0; j < stack.length; j++) if (stack[j].render) stack[j].render();
}

// ====================================================================== screens & overlays
var SCREENS = { setup: Setup, pair: Pair, dash: Dash };
var OVERLAY_EL = [[Details, "details"], [Camera, "camera"], [Menu, "menu"]];
var stack = [];   // open overlays, top last

function elOf(o) { for (var i = 0; i < OVERLAY_EL.length; i++) if (OVERLAY_EL[i][0] === o) return $(OVERLAY_EL[i][1]); return null; }
function overlay(o) {
    for (var i = 0; i < stack.length; i++) if (stack[i] === o) { stack.splice(i, 1); break; }
    stack.push(o);
    elOf(o).className = "overlay";
}
function closeOverlay(o) {
    for (var i = 0; i < stack.length; i++) if (stack[i] === o) { stack.splice(i, 1); break; }
    elOf(o).className = "overlay hidden";
}

function show(name) {
    var prev = SCREENS[app.screen];
    if (prev && prev.close) prev.close();
    while (stack.length) { var o = stack[stack.length - 1]; if (o.close) o.close(); else stack.pop(); }
    app.screen = name;
    var ids = ["boot", "setup", "pair", "dash"];
    for (var i = 0; i < ids.length; i++) $(ids[i]).className = "screen" + (ids[i] === name ? "" : " hidden") + (ids[i] === "boot" ? " center" : "");
    if (SCREENS[name].open) SCREENS[name].open();
}

document.addEventListener("keydown", function (e) {
    var k = keyOf(e);
    if (!k) return;
    e.preventDefault();
    if (stack.length) { stack[stack.length - 1].key(k); return; }
    var s = SCREENS[app.screen];
    if (s && s.key) s.key(k);
}, true);

// Pointer (LG Magic Remote, mouse, touch): hover selects, click acts.
function closest(el, attr) {
    while (el && el !== document) { if (el.getAttribute && el.getAttribute(attr) !== null) return el; el = el.parentNode; }
    return null;
}
document.addEventListener("mouseover", function (e) {
    var t;
    if (stack.length) {
        var top = stack[stack.length - 1];
        if (top === Details && (t = closest(e.target, "data-row"))) { var r = +t.getAttribute("data-row"); if (r !== Details.current) { Details.current = r; Details.render(); } }
        else if (top === Menu && (t = closest(e.target, "data-m"))) { var m = +t.getAttribute("data-m"); if (m !== Menu.current) { Menu.current = m; Menu.render(); } }
        else if (top === Camera && (t = closest(e.target, "data-act"))) { var a = +t.getAttribute("data-act"); if (a !== Camera.action) { Camera.action = a; Camera.render(); } }
        return;
    }
    if (app.screen === "dash" && (t = closest(e.target, "data-i"))) {
        var i = +t.getAttribute("data-i");
        if (i !== Dash.focusIndex && Model.effectiveType(Dash.tiles[i]) !== "header") Dash.focus(i);
    }
});
// Touch: a long press on a tile opens its details; dragging up/down scrolls the dashboard,
// swiping left/right changes dashboard (the grid follows the finger).
var press = { timer: null, x: 0, y: 0, lastY: 0, dx: 0, axis: "", moved: false, long: false, down: false };
function pressStart(x, y, target) {
    press.x = x; press.y = press.lastY = y; press.dx = 0; press.axis = ""; press.moved = false; press.long = false; press.down = true;
    clearTimeout(press.timer);
    if (stack.length || app.screen !== "dash") return;
    var t = closest(target, "data-i");
    if (!t) return;
    press.timer = setTimeout(function () {
        if (press.moved) return;
        var i = +t.getAttribute("data-i");
        if (Model.effectiveType(Dash.tiles[i]) === "header") return;
        press.long = true;
        Dash.focus(i);
        Details.open(Dash.tiles[i]);
    }, 550);
}
function pressMove(x, y) {
    if (!press.down) return;
    var dx = x - press.x, dy = y - press.y;
    if (!press.moved && (Math.abs(dx) > 12 || Math.abs(dy) > 12)) {
        press.moved = true; clearTimeout(press.timer);
        press.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (press.moved && !stack.length && app.screen === "dash") {
        if (press.axis === "y") Dash.scrollBy((press.lastY - y) / stageScale);
        else if (Dash.dashboards().length > 1) { press.dx = dx / stageScale; Dash.place(press.dx, false); }
    }
    press.lastY = y;
}
function pressEnd() {
    clearTimeout(press.timer);
    if (!press.down) return;
    press.down = false;
    if (press.axis !== "x" || stack.length || app.screen !== "dash") return;
    if (press.dx < -110) Dash.switchDash(app.dashIndex + 1, 1);
    else if (press.dx > 110) Dash.switchDash(app.dashIndex - 1, -1);
    else Dash.place(0, true);
}

var lastTouch = 0;
document.addEventListener("touchstart", function (e) { lastTouch = now(); pressStart(e.touches[0].clientX, e.touches[0].clientY, e.target); }, { passive: true });
document.addEventListener("touchmove", function (e) { pressMove(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
document.addEventListener("touchend", function () { lastTouch = now(); pressEnd(); });
var mouseDown = false;
document.addEventListener("mousedown", function (e) { if (now() - lastTouch < 1000) return; mouseDown = true; pressStart(e.clientX, e.clientY, e.target); });
document.addEventListener("mousemove", function (e) { if (mouseDown) pressMove(e.clientX, e.clientY); });
document.addEventListener("mouseup", function () { if (!mouseDown) return; mouseDown = false; pressEnd(); });
document.addEventListener("wheel", function (e) { if (!stack.length && app.screen === "dash") Dash.scrollBy(e.deltaY); });
document.addEventListener("contextmenu", function (e) { e.preventDefault(); });

document.addEventListener("click", function (e) {
    var t;
    if (press.long || press.moved) { if (now() - lastTouch > 1000) { press.long = false; press.moved = false; } return; }
    if (stack.length) {
        var top = stack[stack.length - 1];
        if (top === Details) {
            if ((t = closest(e.target, "data-step"))) {
                var row = closest(t, "data-row");
                Details.current = +row.getAttribute("data-row");
                Details.act(+t.getAttribute("data-step") > 0 ? "right" : "left");
            }
            else if ((t = closest(e.target, "data-row"))) { Details.current = +t.getAttribute("data-row"); Details.act("ok"); }
            else if (e.target.className === "dim" || closest(e.target, "data-close")) Details.close();
        }
        else if (top === Menu) { if ((t = closest(e.target, "data-m"))) Menu.pick(+t.getAttribute("data-m")); else if (e.target.className === "dim") Menu.close(); }
        else if (top === Camera) { if ((t = closest(e.target, "data-act"))) { Camera.action = +t.getAttribute("data-act"); Camera.key("ok"); } else Camera.close(); }
        return;
    }
    if (app.screen === "dash") {
        if (closest(e.target, "data-cmd")) { Menu.open(); return; }
        if ((t = closest(e.target, "data-chip"))) { Details.open({ entity: t.getAttribute("data-chip"), type: "auto", name: "", icon: "", color: "", links: [] }); return; }
        if ((t = closest(e.target, "data-dash"))) { Dash.switchDash(+t.getAttribute("data-dash")); return; }
        if ((t = closest(e.target, "data-i"))) {
            var i = +t.getAttribute("data-i");
            if (Model.effectiveType(Dash.tiles[i]) === "header") return;
            Dash.focus(i); Dash.activate();
        }
    } else if (app.screen === "setup" && (t = closest(e.target, "data-seg"))) {
        var sg = t.getAttribute("data-seg");
        Setup.click(sg === "go" ? "go" : +sg);
    } else if (app.screen === "pair") Pair.start();
});

// Back from the webOS cursor's on-screen arrow.
window.addEventListener("popstate", function () { var s = SCREENS[app.screen]; if (stack.length) stack[stack.length - 1].key("back"); else if (s && s.key) s.key("back"); });

// ====================================================================== scale & boot
var stageScale = 1;
function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    stageScale = Math.min(w / 1280, h / 720);
    var st = $("stage");
    var tr = "translate(" + Math.round((w - 1280 * stageScale) / 2) + "px," + Math.round((h - 720 * stageScale) / 2) + "px) scale(" + stageScale + ")";
    st.style.webkitTransform = tr; st.style.transform = tr;
}
window.addEventListener("resize", function () { resize(); if (app.screen === "dash") Dash.loadGraphs(); });

// Keep the app alive on webOS when it comes back to the foreground.
document.addEventListener("visibilitychange", function () {
    if (document.hidden) { clearInterval(pollTimer); Dash.pauseCameras(true); }
    else if (app.screen === "dash") { startPolling(); pollStates(); if (!stack.length || stack[stack.length - 1] !== Camera) Dash.pauseCameras(false); }
});

resize();
if (param("dash")) { var dn = parseInt(param("dash"), 10); if (dn > 0) setDash(dn - 1); }
show(app.token ? "dash" : (HOSTED ? "pair" : "setup"));

// test hook
window.DomusDebug = { app: app, show: show, Dash: Dash, Details: Details, Camera: Camera, Menu: Menu };
})();
