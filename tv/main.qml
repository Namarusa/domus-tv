import QtQuick 2.4
import fbx.application 1.0
import "qml"
import "js/config.js" as Config
import "js/theme.js" as Theme

Application {
    id: app

    // ------------------------------------------------------------------ state
    property string screen: "boot"          // boot | setup | pair | dash
    property var layout: null               // {version, dashboards, home}
    property var states: ({})               // entity_id -> {s, a, c}
    property int statesRevision: 0          // bumps when states change (bindings)
    property bool online: true
    property int failures: 0
    property string notice: ""
    property var pending: []                // in-flight requests (for timeouts)

    FontLoader { id: mdiFont; source: "fonts/materialdesignicons-webfont.ttf" }
    property string iconFont: mdiFont.name

    Settings {
        id: settings
        property string haUrl: ""
        property string token: ""
        property string tvId: ""
        property int dashIndex: 0
        onReady: app.boot()
    }

    // Some emulators never send Settings.ready
    Timer { interval: 1500; running: app.screen === "boot"; onTriggered: app.boot() }

    function boot() {
        if (screen !== "boot") return;
        if (!settings.haUrl) settings.haUrl = Config.DEFAULT_URL;
        screen = settings.token ? "dash" : "setup";
        if (screen === "dash") loadLayout();
    }

    // Called by the Player's launcher ("run" at start-up, or a URL handed to the app).
    function handleUrl(action, url, mediaType) {
        console.log("handleUrl", action, url, mediaType);
    }

    // ------------------------------------------------------------------ HTTP
    function request(method, path, body, auth, callback) {
        var xhr = new XMLHttpRequest();
        var entry = { xhr: xhr, started: Date.now(), done: false };
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE || entry.done) return;
            entry.done = true;
            var data = null;
            try { data = JSON.parse(xhr.responseText); } catch (e) {}
            if (auth && xhr.status === 401) { tokenRejected(); return; }
            if (callback) callback(xhr.status, data);
        };
        xhr.open(method, settings.haUrl.replace(/\/+$/, "") + path);
        if (auth) xhr.setRequestHeader("Authorization", "Bearer " + settings.token);
        if (body !== null && body !== undefined) xhr.setRequestHeader("Content-Type", "application/json");
        pending.push(entry);
        xhr.send(body !== null && body !== undefined ? JSON.stringify(body) : null);
    }

    Timer {   // request timeouts
        interval: 1000; running: true; repeat: true
        onTriggered: {
            var now = Date.now(), keep = [];
            for (var i = 0; i < app.pending.length; i++) {
                var e = app.pending[i];
                if (e.done) continue;
                if (now - e.started > Config.REQUEST_TIMEOUT_MS) { e.xhr.abort(); } else keep.push(e);
            }
            app.pending = keep;
        }
    }

    function tokenRejected() {
        settings.token = "";
        layout = null;
        notice = "Home Assistant a refusé l'accès (Player retiré ?). Associez-le à nouveau.";
        screen = "pair";
    }

    // ------------------------------------------------------------------ data
    function loadLayout() {
        request("GET", "/api/domus_tv/layout", null, true, function(status, data) {
            if (status === 200 && data) {
                layout = data;
                if (settings.dashIndex >= data.dashboards.length) settings.dashIndex = 0;
                online = true; failures = 0;
                pollStates();
            } else {
                online = false;
                retryLayout.start();
            }
        });
    }
    Timer { id: retryLayout; interval: 5000; onTriggered: app.loadLayout() }

    function pollStates() {
        if (screen !== "dash" || !layout) return;
        request("GET", "/api/domus_tv/states", null, true, function(status, data) {
            if (status === 200 && data) {
                online = true; failures = 0;
                states = data.states;
                statesRevision++;
                if (data.v !== layout.version) loadLayout();
            } else {
                failures++;
                if (failures >= 2) online = false;
            }
        });
    }
    Timer {
        interval: Config.STATE_POLL_MS; repeat: true
        running: app.screen === "dash" && app.layout !== null
        onTriggered: app.pollStates()
    }

    function runAction(entity, action, value, onDone) {
        var body = { entity: entity, action: action };
        if (value !== undefined) body.value = value;
        request("POST", "/api/domus_tv/action", body, true, function(status, data) {
            if (status === 200 && data && data.state) {
                var copy = {};
                for (var k in states) copy[k] = states[k];
                copy[entity] = data.state;
                states = copy;
                statesRevision++;
            } else if (status !== 200) {
                toast.show(data && data.message ? data.message : "Action impossible (" + status + ")", true);
            }
            if (onDone) onDone(status === 200);
        });
    }

    // Down-sampled history for graphs, cached 5 min per entity+window.
    property var historyCache: ({})
    function fetchHistory(entity, hours, callback) {
        var key = entity + "|" + hours, hit = historyCache[key];
        if (hit && Date.now() - hit.t < 300000) { callback(hit.data); return; }
        request("GET", "/api/domus_tv/history?entity=" + encodeURIComponent(entity) + "&hours=" + hours, null, true,
            function(status, data) {
                if (status === 200 && data) { historyCache[key] = { t: Date.now(), data: data }; callback(data); }
            });
    }

    function cameraUrl(entity, stamp) {
        var st = states[entity];
        if (!st || !st.a || !st.a.entity_picture) return "";
        var pic = st.a.entity_picture;
        return settings.haUrl.replace(/\/+$/, "") + pic + (pic.indexOf("?") >= 0 ? "&" : "?") + "_=" + stamp;
    }

    function resetServer() {
        settings.token = "";
        layout = null;
        states = {};
        screen = "setup";
    }

    // ------------------------------------------------------------------ UI
    Rectangle {
        anchors.fill: parent
        gradient: Gradient {
            GradientStop { position: 0; color: Theme.bg2 }
            GradientStop { position: 0.6; color: Theme.bg }
        }
    }

    SetupScreen {
        id: setup
        anchors.fill: parent
        visible: app.screen === "setup"
        focus: visible
        url: settings.haUrl
        onSubmitted: { settings.haUrl = newUrl; app.notice = ""; app.screen = "pair"; }
    }

    PairScreen {
        anchors.fill: parent
        visible: app.screen === "pair"
        focus: visible
        active: visible
        onPaired: {
            settings.token = token;
            settings.tvId = tvId;
            app.notice = "";
            app.screen = "dash";
            app.loadLayout();
        }
        onBack: app.screen = "setup"
    }

    DashboardScreen {
        id: dash
        anchors.fill: parent
        visible: app.screen === "dash"
        focus: visible
        dashIndex: settings.dashIndex
        onDashIndexChanged: settings.dashIndex = dashIndex
    }

    Text {
        anchors.centerIn: parent
        visible: app.screen === "boot"
        text: "Domus"
        color: Theme.text2
        font.pixelSize: 40
    }

    Toast { id: toast }
}
