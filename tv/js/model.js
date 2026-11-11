.pragma library
// Layout, icons, state text and detail-panel rows. ES5 only (Freebox Player JS engine).

function pad2(n) { return n < 10 ? "0" + n : "" + n; }
// dd/MM hh:mm without Qt, so the same file runs in a browser.
function fmtDate(dt, withA) {
    return pad2(dt.getDate()) + "/" + pad2(dt.getMonth() + 1) + (withA ? " à " : " ") + pad2(dt.getHours()) + ":" + pad2(dt.getMinutes());
}

// ---- layout: keep in sync with ha/custom_components/domus_tv/frontend/layout.js
var SCREEN = { width: 1280, height: 720, top: 84, side: 40, bottom: 28, gap: 14, header: 46 };

function cellSize(columns) {
    var w = (SCREEN.width - 2 * SCREEN.side - SCREEN.gap * (columns - 1)) / columns;
    var h = Math.round(w * (columns <= 4 ? 0.62 : 0.72));
    return { w: w, h: h };
}

// Rows holding only section titles are short; every other row is one cell high.
function rowMetrics(tiles, columns) {
    var cell = cellSize(columns), rows = 0, i, r;
    for (i = 0; i < tiles.length; i++) rows = Math.max(rows, tiles[i].y + tiles[i].h);
    var heights = [], offsets = [], y = 0;
    for (r = 0; r < rows; r++) {
        var content = false, header = false;
        for (i = 0; i < tiles.length; i++) {
            var t = tiles[i];
            if (r < t.y || r >= t.y + t.h) continue;
            if (effectiveType(t) === "header") header = true; else content = true;
        }
        heights[r] = header && !content ? SCREEN.header : cell.h;
        offsets[r] = y;
        y += heights[r] + SCREEN.gap;
    }
    return { heights: heights, offsets: offsets, total: Math.max(0, y - SCREEN.gap) };
}

function tileRect(tile, columns, metrics) {
    var c = cellSize(columns), h = 0;
    for (var r = tile.y; r < tile.y + tile.h; r++) h += (metrics.heights[r] || c.h) + (r > tile.y ? SCREEN.gap : 0);
    return {
        x: SCREEN.side + tile.x * (c.w + SCREEN.gap),
        y: metrics.offsets[tile.y] || 0,
        w: tile.w * c.w + (tile.w - 1) * SCREEN.gap,
        h: h
    };
}

function domainOf(entityId) { return (entityId || "").split(".")[0]; }

function defaultType(entityId) {
    switch (domainOf(entityId)) {
    case "light": return "light";
    case "switch": case "input_boolean": case "fan": case "automation": case "siren":
    case "humidifier": case "group": return "toggle";
    case "scene": case "script": case "button": case "input_button": return "button";
    case "cover": return "cover";
    case "climate": case "water_heater": return "climate";
    case "camera": return "camera";
    case "lock": return "lock";
    case "media_player": return "media";
    default: return "sensor";
    }
}

function effectiveType(tile) {
    return tile.type && tile.type !== "auto" ? tile.type : defaultType(tile.entity);
}

// Spatial navigation between tiles (grid cells). Headers are not focusable.
function neighbour(tiles, index, dir) {
    var cur = tiles[index];
    if (!cur) return firstFocusable(tiles);
    var best = -1, bestScore = 1e9;
    var cx = cur.x + cur.w / 2, cy = cur.y + cur.h / 2;
    for (var i = 0; i < tiles.length; i++) {
        var t = tiles[i];
        if (i === index || effectiveType(t) === "header") continue;
        var tx = t.x + t.w / 2, ty = t.y + t.h / 2;
        var primary, secondary, overlap;
        if (dir === "right") { if (t.x < cur.x + cur.w) continue; primary = t.x - (cur.x + cur.w); overlap = t.y < cur.y + cur.h && cur.y < t.y + t.h; secondary = Math.abs(ty - cy); }
        else if (dir === "left") { if (t.x + t.w > cur.x) continue; primary = cur.x - (t.x + t.w); overlap = t.y < cur.y + cur.h && cur.y < t.y + t.h; secondary = Math.abs(ty - cy); }
        else if (dir === "down") { if (t.y < cur.y + cur.h) continue; primary = t.y - (cur.y + cur.h); overlap = t.x < cur.x + cur.w && cur.x < t.x + t.w; secondary = Math.abs(tx - cx); }
        else { if (t.y + t.h > cur.y) continue; primary = cur.y - (t.y + t.h); overlap = t.x < cur.x + cur.w && cur.x < t.x + t.w; secondary = Math.abs(tx - cx); }
        var score = primary * 100 + (overlap ? 0 : 50) + secondary;
        if (score < bestScore) { bestScore = score; best = i; }
    }
    return best;
}

function firstFocusable(tiles) {
    var best = -1;
    for (var i = 0; i < tiles.length; i++) {
        if (effectiveType(tiles[i]) === "header") continue;
        if (best < 0 || tiles[i].y < tiles[best].y || (tiles[i].y === tiles[best].y && tiles[i].x < tiles[best].x)) best = i;
    }
    return best;
}

// ---- state helpers
var ON_STATES = { on: 1, open: 1, opening: 1, unlocked: 1, playing: 1, heat: 1, cool: 1, auto: 1, heat_cool: 1, dry: 1, fan_only: 1, home: 1 };

function isOn(st) { return !!(st && ON_STATES[st.s]); }
// Scenes, scripts and buttons have no meaningful state ("unknown" until first used).
var STATELESS = { scene: 1, script: 1, button: 1, input_button: 1 };

function isUnavailable(st, entityId) {
    if (!st) return true;
    if (entityId && STATELESS[domainOf(entityId)]) return st.s === "unavailable";
    return st.s === "unavailable" || st.s === "unknown";
}

function name(tile, st) {
    if (tile.name) return tile.name;
    if (st && st.a && st.a.friendly_name) return st.a.friendly_name;
    return tile.entity || "";
}

var LABELS = {
    on: "Allumé", off: "Éteint", open: "Ouvert", closed: "Fermé", opening: "Ouverture…", closing: "Fermeture…",
    locked: "Verrouillé", unlocked: "Déverrouillé", locking: "Verrouillage…", unlocking: "Déverrouillage…", jammed: "Bloqué",
    heating: "Chauffe", cooling: "Refroidit", drying: "Déshumidifie", fan: "Ventile", preheating: "Préchauffe", defrosting: "Dégivrage",
    playing: "Lecture", paused: "Pause", idle: "Inactif", standby: "Veille", buffering: "Chargement",
    unavailable: "Indisponible", unknown: "Inconnu", home: "Présent", not_home: "Absent",
    heat: "Chauffage", cool: "Climatisation", auto: "Auto", heat_cool: "Auto", dry: "Déshumidification", fan_only: "Ventilation",
    armed_away: "Alarme absente", armed_home: "Alarme présence", armed_night: "Alarme nuit", disarmed: "Désarmée", triggered: "Déclenchée",
    sunny: "Ensoleillé", cloudy: "Nuageux", partlycloudy: "Éclaircies", rainy: "Pluie", pouring: "Averses", snowy: "Neige",
    fog: "Brouillard", "clear-night": "Nuit claire", windy: "Venteux", lightning: "Orage", "lightning-rainy": "Orage", hail: "Grêle",
    streaming: "En direct", recording: "Enregistrement"
};

var BINARY = {
    door: ["Ouverte", "Fermée"], garage_door: ["Ouverte", "Fermée"], window: ["Ouverte", "Fermée"], opening: ["Ouvert", "Fermé"],
    motion: ["Mouvement", "Calme"], occupancy: ["Occupé", "Libre"], presence: ["Présent", "Absent"],
    moisture: ["Humide", "Sec"], smoke: ["Fumée !", "OK"], gas: ["Gaz !", "OK"], problem: ["Problème", "OK"],
    battery: ["Faible", "OK"], connectivity: ["Connecté", "Déconnecté"], plug: ["Branché", "Débranché"],
    lock: ["Déverrouillé", "Verrouillé"], running: ["En marche", "Arrêté"], vibration: ["Vibration", "Calme"],
    power: ["Sous tension", "Hors tension"], light: ["Lumière", "Sombre"], heat: ["Chaud", "Normal"], cold: ["Froid", "Normal"],
    sound: ["Son détecté", "Calme"], safety: ["Danger", "OK"], tamper: ["Sabotage", "OK"], update: ["Mise à jour", "À jour"],
    carbon_monoxide: ["CO !", "OK"], moving: ["En mouvement", "Immobile"], garage_door_opening: ["Ouvert", "Fermé"]
};

function fmtNumber(v) {
    var n = parseFloat(v);
    if (isNaN(n) || String(v).match(/[^0-9.\-e+]/)) return null;
    var s = Math.abs(n) >= 100 ? Math.round(n).toString() : (Math.round(n * 10) / 10).toString();
    return s.replace(".", ",");
}

function isNumeric(st) { return !!st && fmtNumber(st.s) !== null; }

function stateText(tile, st) {
    if (!st) return "…";
    var d = domainOf(tile.entity), a = st.a || {};
    if (isUnavailable(st, tile.entity)) return LABELS[st.s];
    if (d === "binary_sensor") {
        var pair = BINARY[a.device_class];
        return pair ? (st.s === "on" ? pair[0] : pair[1]) : (st.s === "on" ? "Actif" : "Inactif");
    }
    if (d === "light" && st.s === "on" && a.brightness)
        return "Allumé · " + Math.round(a.brightness / 2.55) + " %";
    if (d === "cover" && a.current_position !== undefined && a.current_position !== null && st.s !== "closed")
        return (LABELS[st.s] || st.s) + " · " + a.current_position + " %";
    if (d === "climate") {
        var cur = a.current_temperature !== undefined && a.current_temperature !== null ? fmtNumber(a.current_temperature) + "°" : "";
        var target = a.temperature !== undefined && a.temperature !== null ? " → " + fmtNumber(a.temperature) + "°" : "";
        return st.s === "off" ? (cur ? cur + " · Arrêt" : "Arrêt") : cur + target;
    }
    if (d === "media_player" && (st.s === "playing" || st.s === "paused") && a.media_title)
        return a.media_title + (a.media_artist ? " · " + a.media_artist : "");
    if (d === "weather" && a.temperature !== undefined)
        return fmtNumber(a.temperature) + "° · " + (LABELS[st.s] || st.s);
    if (d === "camera") return "Voir";
    if (d === "scene" || d === "script" || d === "button" || d === "input_button") return d === "script" && st.s === "on" ? "En cours…" : "";
    if (d === "sensor" && a.device_class === "timestamp") {
        var dt = new Date(st.s);
        return isNaN(dt.getTime()) ? st.s : fmtDate(dt, false);
    }
    var num = fmtNumber(st.s);
    if (num !== null) return num + (a.unit_of_measurement ? " " + a.unit_of_measurement : "");
    return LABELS[st.s] || st.s;
}

// Default Material Design icon names (without "mdi:")
function icon(tile, st) {
    if (tile.icon) return tile.icon;
    if (st && st.a && st.a.icon) return st.a.icon;
    var d = domainOf(tile.entity), dc = st && st.a ? st.a.device_class : "", on = isOn(st);
    switch (d) {
    case "light": return on ? "lightbulb-on" : "lightbulb-outline";
    case "switch": return on ? "toggle-switch" : "toggle-switch-off-outline";
    case "input_boolean": return on ? "check-circle" : "circle-outline";
    case "fan": return on ? "fan" : "fan-off";
    case "automation": return on ? "robot" : "robot-off";
    case "scene": return "palette";
    case "script": return "script-text-play";
    case "button": case "input_button": return "gesture-tap-button";
    case "cover":
        if (dc === "garage") return on ? "garage-open" : "garage";
        if (dc === "gate") return on ? "gate-open" : "gate";
        if (dc === "door") return on ? "door-open" : "door-closed";
        if (dc === "blind" || dc === "shade") return on ? "blinds-open" : "blinds";
        return on ? "window-shutter-open" : "window-shutter";
    case "climate": return "thermostat";
    case "water_heater": return "water-boiler";
    case "camera": return "cctv";
    case "lock": return st && st.s === "unlocked" ? "lock-open-variant" : "lock";
    case "media_player": return st && st.s === "playing" ? "speaker-play" : "speaker";
    case "weather": return "weather-partly-cloudy";
    case "person": case "device_tracker": return st && st.s === "home" ? "home-account" : "account-arrow-right";
    case "alarm_control_panel": return st && st.s === "disarmed" ? "shield-off" : "shield-lock";
    case "vacuum": return "robot-vacuum";
    case "binary_sensor":
        switch (dc) {
        case "door": return on ? "door-open" : "door-closed";
        case "garage_door": return on ? "garage-open" : "garage";
        case "window": return on ? "window-open" : "window-closed";
        case "motion": return on ? "motion-sensor" : "motion-sensor-off";
        case "occupancy": case "presence": return on ? "home-account" : "home-outline";
        case "moisture": return on ? "water-alert" : "water-off";
        case "smoke": return on ? "smoke-detector-alert" : "smoke-detector";
        case "battery": return on ? "battery-alert" : "battery";
        case "connectivity": return on ? "lan-connect" : "lan-disconnect";
        case "plug": return on ? "power-plug" : "power-plug-off";
        case "power": return on ? "flash" : "flash-off";
        case "light": return on ? "brightness-7" : "brightness-5";
        case "heat": return on ? "fire" : "thermometer";
        case "cold": return on ? "snowflake" : "thermometer";
        case "sound": return on ? "music-note" : "music-note-off";
        case "safety": case "tamper": return on ? "shield-alert" : "shield-check";
        case "update": return on ? "package-up" : "package";
        case "running": return on ? "play" : "stop";
        case "vibration": return on ? "vibrate" : "crop-portrait";
        case "carbon_monoxide": case "gas": return on ? "alert" : "check-circle";
        case "lock": return on ? "lock-open-variant" : "lock";
        default: return on ? "checkbox-marked-circle" : "checkbox-blank-circle-outline";
        }
    case "sensor":
        switch (dc) {
        case "temperature": return "thermometer";
        case "humidity": return "water-percent";
        case "power": return "flash";
        case "energy": return "lightning-bolt";
        case "battery": return "battery";
        case "illuminance": return "brightness-5";
        case "pressure": return "gauge";
        case "carbon_dioxide": return "molecule-co2";
        case "pm25": case "pm10": return "air-filter";
        case "voltage": return "sine-wave";
        case "current": return "current-ac";
        case "monetary": return "cash";
        case "timestamp": return "clock-outline";
        default: return "eye";
        }
    default: return "shape";
    }
}

// What OK does on a tile. Returns {action, value} for the server, or a UI verb.
function primary(tile, st) {
    var type = effectiveType(tile);
    switch (type) {
    case "light": case "toggle": return { action: "toggle" };
    case "button": return { action: "press" };
    case "cover": return { action: "toggle" };
    case "lock": return { ui: "confirm", action: "toggle" };
    case "media": return { action: "media_play_pause" };
    case "camera": return { ui: "camera" };
    default: return { ui: "details" };
    }
}

// Rows of the detail panel (ⓘ). kind: "button" (OK) or "stepper" (◀ ▶).
function detailRows(tile, st) {
    var type = effectiveType(tile), a = (st && st.a) || {}, rows = [];
    var feat = a.supported_features || 0;
    if (type === "light") {
        rows.push({ kind: "button", label: isOn(st) ? "Éteindre" : "Allumer", action: "toggle", icon: "power" });
        if (a.supported_color_modes && !(a.supported_color_modes.length === 1 && a.supported_color_modes[0] === "onoff"))
            rows.push({ kind: "stepper", label: "Luminosité", value: a.brightness ? Math.round(a.brightness / 2.55) + " %" : "0 %",
                        action: "brightness_step", step: 10, icon: "brightness-6" });
    } else if (type === "toggle") {
        rows.push({ kind: "button", label: isOn(st) ? "Éteindre" : "Allumer", action: "toggle", icon: "power" });
    } else if (type === "button") {
        rows.push({ kind: "button", label: "Lancer", action: "press", icon: "play" });
    } else if (type === "cover") {
        rows.push({ kind: "button", label: "Ouvrir", action: "open", icon: "arrow-up-bold" });
        rows.push({ kind: "button", label: "Stop", action: "stop", icon: "stop" });
        rows.push({ kind: "button", label: "Fermer", action: "close", icon: "arrow-down-bold" });
        if (feat & 4)
            rows.push({ kind: "stepper", label: "Position", value: (a.current_position !== undefined ? a.current_position : 0) + " %",
                        action: "position", absolute: a.current_position || 0, step: 10, icon: "arrow-expand-vertical" });
    } else if (type === "climate") {
        if (a.temperature !== undefined && a.temperature !== null)
            rows.push({ kind: "stepper", label: "Consigne", value: fmtNumber(a.temperature) + " °", action: "temp_step", step: 1, icon: "thermometer" });
        if (a.hvac_modes && a.hvac_modes.length)
            rows.push({ kind: "stepper", label: "Mode", value: LABELS[st.s] || st.s, action: "hvac_mode", modes: a.hvac_modes, icon: "tune" });
    } else if (type === "lock") {
        rows.push({ kind: "button", label: "Verrouiller", action: "lock", icon: "lock" });
        rows.push({ kind: "button", label: "Déverrouiller", action: "unlock", icon: "lock-open-variant" });
    } else if (type === "media") {
        rows.push({ kind: "button", label: st && st.s === "playing" ? "Pause" : "Lecture", action: "media_play_pause", icon: "play-pause" });
        rows.push({ kind: "button", label: "Suivant", action: "media_next_track", icon: "skip-next" });
        rows.push({ kind: "button", label: "Précédent", action: "media_previous_track", icon: "skip-previous" });
        rows.push({ kind: "stepper", label: "Volume", value: a.volume_level !== undefined ? Math.round(a.volume_level * 100) + " %" : "",
                    action: "volume", icon: "volume-high" });
        rows.push({ kind: "button", label: a.is_volume_muted ? "Rétablir le son" : "Couper le son", action: "volume_mute", icon: "volume-off" });
    } else if (type === "camera") {
        rows.push({ kind: "button", label: "Plein écran", ui: "camera", icon: "fullscreen" });
    }
    return rows;
}

// Linked entities of a tile, as panel rows (rendered with live state by the panel).
function linkRows(tile) {
    var out = [], links = tile.links || [];
    for (var i = 0; i < links.length; i++) if (links[i]) out.push({ kind: "link", entity: links[i] });
    return out;
}

// What OK does on a linked entity (same rules as a tile of that entity).
function linkPrimary(entityId, st) { return primary({ entity: entityId, type: "auto" }, st); }

// Translate a ◀ ▶ press on a stepper row into a server action.
function stepAction(row, dir) {
    if (row.action === "hvac_mode") {
        var modes = row.modes, i = -1;
        for (var k = 0; k < modes.length; k++) if ((LABELS[modes[k]] || modes[k]) === row.value) i = k;
        i = (i + dir + modes.length) % modes.length;
        return { action: "hvac_mode", value: modes[i] };
    }
    if (row.action === "position")
        return { action: "position", value: Math.max(0, Math.min(100, row.absolute + dir * row.step)) };
    if (row.action === "volume") return { action: dir > 0 ? "volume_up" : "volume_down" };
    if (row.action === "temp_step") return { action: "temp_step", value: dir };
    return { action: row.action, value: dir * (row.step || 1) };
}

function infoLines(tile, st) {
    var out = [];
    if (!st) return out;
    var a = st.a || {};
    if (a.current_temperature !== undefined && a.current_temperature !== null) out.push(["Température", fmtNumber(a.current_temperature) + " °"]);
    if (a.hvac_action) out.push(["Activité", LABELS[a.hvac_action] || a.hvac_action]);
    if (a.humidity !== undefined) out.push(["Humidité", a.humidity + " %"]);
    if (a.source) out.push(["Source", a.source]);
    if (st.c) out.push(["Depuis", fmtDate(new Date(st.c * 1000), true)]);
    out.push(["Entité", tile.entity]);
    return out;
}
