.pragma library
// Translations shared by the Freebox app (QML) and the web client (LG, wall screens).
// ES5 only. To add a language: copy the "en" block, translate the values, add it to STRINGS.
// Missing keys fall back to English, then to the key itself.

var LANG = "en";

var STRINGS = {
en: {
    decimal: ".",
    days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    daysShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    monthsShort: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    q: "“{0}”",
    "date.at": "at",

    // setup / pairing
    "setup.title": "Your Home Assistant address",
    "setup.hint.ip": "Digits: type · Left/Right: change box · Up/Down: adjust · OK: continue",
    "setup.hint.host": "OK to continue · type a digit to enter an IP address",
    "setup.err.byte": "Number {0} must be between 0 and 255",
    "setup.err.port": "Invalid port",
    "this.player": "this Player", "this.tv": "this TV", "this.screen": "this screen",
    "device.wall": "Wall screen", "device.browser": "Browser",
    "pair.title": "Pair {0}",
    "pair.titleHome": "Pair {0} with “{1}”",
    "pair.instructions": "In Home Assistant, open <b>Domus TV</b>, second tab (<b>Screens</b>), and enter this code.",
    "pair.waiting": "Waiting… code valid for {0} min {1} s",
    "pair.connecting": "Connecting to {0}…",
    "pair.hint": "Back: change address · OK: new code",
    "pair.hint.touch": "Tap the screen for a new code",
    "pair.err.noanswer": "Home Assistant does not answer at {0}. Check the address and that this device is on the same network.",
    "pair.err.noint": "Home Assistant answers, but the Domus TV integration is not installed (Settings → Devices & services → Add integration → Domus TV).",
    "pair.err.busy": "Too many pending requests. Retrying in a few seconds…",
    "pair.err.other": "Error {0} while contacting Home Assistant.",
    "notice.revoked": "Home Assistant refused access (screen removed?). Pair it again.",

    // dashboard
    "dash.loading": "Loading…",
    "dash.connecting": "Connecting to Home Assistant…",
    "dash.offline": "Home Assistant unreachable",
    "dash.offlineHint": "OK: change address or retry",
    "dash.empty": "This dashboard is empty",
    "dash.emptyHint": "Add tiles in Home Assistant → Domus TV. They will appear here automatically.",
    "dash.exit": "Press Back again to exit · Menu: settings",
    "dash.exitRed": "Press Back again to exit · Red: menu",
    "confirm.lock": "Press OK again to lock “{0}”",
    "confirm.unlock": "Press OK again to unlock “{0}”",
    "confirm.ok": "OK to confirm",
    "action.failed": "Action failed ({0})",
    "toast.state": "“{0}”: {1}",

    // details panel
    "details.linked": "Linked actions",
    "details.last24": "Last 24 h",
    "details.minmax": "min {0} · max {1}",
    "details.noRecorder": "History is disabled in Home Assistant",
    "details.noHistory": "No history yet",
    "details.hint": "Up/Down: choose · OK or Left/Right: act · Back: close",
    "details.hintClose": "Back to close",
    "details.hintTouch": "Tap a row to act",

    // camera
    "camera.loading": "Loading picture…",
    "camera.hintActions": "Left/Right: choose · OK: act",
    "camera.hintOther": " · Up/Down: other camera",
    "camera.hintSwitch": "Left/Right: other camera · ",
    "camera.hintClose": "Back: close",
    "camera.useInfo": "Use the dashboard's Info panel to adjust “{0}”",

    // menu
    "menu.reload": "Reload",
    "menu.server": "Change address",
    "menu.forget": "Forget {0}",
    "menu.forgetConfirm": "Confirm: forget {0}",
    "menu.quit": "Quit Domus",
    "menu.language": "Language: English",
    "menu.footer": "“Forget” does not revoke access in HA",

    // state text
    "state.lightOn": "On · {0} %",
    "state.off": "Off",
    "state.view": "View",
    "state.running": "Running…",
    "binary.on": "Active", "binary.off": "Inactive",

    // detail rows
    "row.turnOff": "Turn off", "row.turnOn": "Turn on", "row.brightness": "Brightness", "row.run": "Run",
    "row.open": "Open", "row.stop": "Stop", "row.close": "Close", "row.position": "Position",
    "row.target": "Target", "row.mode": "Mode", "row.lock": "Lock", "row.unlock": "Unlock",
    "row.pause": "Pause", "row.play": "Play", "row.next": "Next", "row.prev": "Previous", "row.volume": "Volume",
    "row.unmute": "Unmute", "row.mute": "Mute", "row.fullscreen": "Full screen",
    "info.temperature": "Temperature", "info.activity": "Activity", "info.humidity": "Humidity",
    "info.source": "Source", "info.since": "Since", "info.entity": "Entity",

    states: {
        on: "On", off: "Off", open: "Open", closed: "Closed", opening: "Opening…", closing: "Closing…",
        locked: "Locked", unlocked: "Unlocked", locking: "Locking…", unlocking: "Unlocking…", jammed: "Jammed",
        heating: "Heating", cooling: "Cooling", drying: "Drying", fan: "Fan", preheating: "Preheating", defrosting: "Defrosting",
        playing: "Playing", paused: "Paused", idle: "Idle", standby: "Standby", buffering: "Buffering",
        unavailable: "Unavailable", unknown: "Unknown", home: "Home", not_home: "Away",
        heat: "Heat", cool: "Cool", auto: "Auto", heat_cool: "Auto", dry: "Dry", fan_only: "Fan only",
        armed_away: "Armed away", armed_home: "Armed home", armed_night: "Armed night", disarmed: "Disarmed", triggered: "Triggered",
        sunny: "Sunny", cloudy: "Cloudy", partlycloudy: "Partly cloudy", rainy: "Rainy", pouring: "Pouring", snowy: "Snowy",
        fog: "Fog", "clear-night": "Clear night", windy: "Windy", lightning: "Lightning", "lightning-rainy": "Thunderstorm", hail: "Hail",
        streaming: "Live", recording: "Recording"
    },
    binary: {
        door: ["Open", "Closed"], garage_door: ["Open", "Closed"], window: ["Open", "Closed"], opening: ["Open", "Closed"],
        motion: ["Motion", "Clear"], occupancy: ["Occupied", "Clear"], presence: ["Home", "Away"],
        moisture: ["Wet", "Dry"], smoke: ["Smoke!", "OK"], gas: ["Gas!", "OK"], problem: ["Problem", "OK"],
        battery: ["Low", "OK"], connectivity: ["Connected", "Disconnected"], plug: ["Plugged in", "Unplugged"],
        lock: ["Unlocked", "Locked"], running: ["Running", "Stopped"], vibration: ["Vibration", "Clear"],
        power: ["Power", "No power"], light: ["Light", "Dark"], heat: ["Hot", "Normal"], cold: ["Cold", "Normal"],
        sound: ["Sound", "Clear"], safety: ["Unsafe", "Safe"], tamper: ["Tampering", "OK"], update: ["Update available", "Up to date"],
        carbon_monoxide: ["CO!", "OK"], moving: ["Moving", "Still"], garage_door_opening: ["Open", "Closed"]
    }
},

fr: {
    decimal: ",",
    days: ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"],
    daysShort: ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."],
    months: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
    monthsShort: ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."],
    q: "« {0} »",
    "date.at": "à",

    "setup.title": "Adresse de votre Home Assistant",
    "setup.hint.ip": "Chiffres : saisir · Gauche/Droite : changer de case · Haut/Bas : ajuster · OK : continuer",
    "setup.hint.host": "OK pour continuer · tapez un chiffre pour saisir une adresse IP",
    "setup.err.byte": "Le nombre {0} doit être entre 0 et 255",
    "setup.err.port": "Port invalide",
    "this.player": "ce Player", "this.tv": "cette TV", "this.screen": "cet écran",
    "device.wall": "Écran mural", "device.browser": "Navigateur",
    "pair.title": "Associer {0}",
    "pair.titleHome": "Associer {0} à « {1} »",
    "pair.instructions": "Dans Home Assistant, ouvrez <b>Domus TV</b>, 2e onglet (<b>Écrans</b>), et saisissez ce code.",
    "pair.waiting": "En attente… code valable encore {0} min {1} s",
    "pair.connecting": "Connexion à {0}…",
    "pair.hint": "Retour : changer l'adresse · OK : nouveau code",
    "pair.hint.touch": "Touchez l'écran pour un nouveau code",
    "pair.err.noanswer": "Home Assistant ne répond pas à {0}. Vérifiez l'adresse et que cet appareil est sur le même réseau.",
    "pair.err.noint": "Home Assistant répond, mais l'intégration Domus TV n'est pas installée (Paramètres → Appareils et services → Ajouter → Domus TV).",
    "pair.err.busy": "Trop de demandes en attente. Nouvel essai dans quelques secondes…",
    "pair.err.other": "Erreur {0} en contactant Home Assistant.",
    "notice.revoked": "Home Assistant a refusé l'accès (écran retiré ?). Associez-le à nouveau.",

    "dash.loading": "Chargement…",
    "dash.connecting": "Connexion à Home Assistant…",
    "dash.offline": "Home Assistant injoignable",
    "dash.offlineHint": "OK : changer d'adresse ou réessayer",
    "dash.empty": "Ce dashboard est vide",
    "dash.emptyHint": "Ajoutez des tuiles dans Home Assistant → Domus TV. Elles apparaîtront ici toutes seules.",
    "dash.exit": "Appuyez encore sur Retour pour quitter · Menu : réglages",
    "dash.exitRed": "Appuyez encore sur Retour pour quitter · Rouge : menu",
    "confirm.lock": "Appuyez encore sur OK pour verrouiller « {0} »",
    "confirm.unlock": "Appuyez encore sur OK pour déverrouiller « {0} »",
    "confirm.ok": "OK pour confirmer",
    "action.failed": "Action impossible ({0})",
    "toast.state": "« {0} » : {1}",

    "details.linked": "Actions liées",
    "details.last24": "Dernières 24 h",
    "details.minmax": "min {0} · max {1}",
    "details.noRecorder": "Historique désactivé dans Home Assistant",
    "details.noHistory": "Pas encore d'historique",
    "details.hint": "Haut/Bas : choisir · OK ou Gauche/Droite : agir · Retour : fermer",
    "details.hintClose": "Retour pour fermer",
    "details.hintTouch": "Touchez une ligne pour agir",

    "camera.loading": "Chargement de l'image…",
    "camera.hintActions": "Gauche/Droite : choisir · OK : agir",
    "camera.hintOther": " · Haut/Bas : autre caméra",
    "camera.hintSwitch": "Gauche/Droite : autre caméra · ",
    "camera.hintClose": "Retour : fermer",
    "camera.useInfo": "Utilisez le panneau Info du dashboard pour régler « {0} »",

    "menu.reload": "Recharger",
    "menu.server": "Changer d'adresse",
    "menu.forget": "Oublier {0}",
    "menu.forgetConfirm": "Confirmer : oublier {0}",
    "menu.quit": "Quitter Domus",
    "menu.language": "Langue : Français",
    "menu.footer": "« Oublier » ne retire pas l'accès dans HA",

    "state.lightOn": "Allumé · {0} %",
    "state.off": "Arrêt",
    "state.view": "Voir",
    "state.running": "En cours…",
    "binary.on": "Actif", "binary.off": "Inactif",

    "row.turnOff": "Éteindre", "row.turnOn": "Allumer", "row.brightness": "Luminosité", "row.run": "Lancer",
    "row.open": "Ouvrir", "row.stop": "Stop", "row.close": "Fermer", "row.position": "Position",
    "row.target": "Consigne", "row.mode": "Mode", "row.lock": "Verrouiller", "row.unlock": "Déverrouiller",
    "row.pause": "Pause", "row.play": "Lecture", "row.next": "Suivant", "row.prev": "Précédent", "row.volume": "Volume",
    "row.unmute": "Rétablir le son", "row.mute": "Couper le son", "row.fullscreen": "Plein écran",
    "info.temperature": "Température", "info.activity": "Activité", "info.humidity": "Humidité",
    "info.source": "Source", "info.since": "Depuis", "info.entity": "Entité",

    states: {
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
    },
    binary: {
        door: ["Ouverte", "Fermée"], garage_door: ["Ouverte", "Fermée"], window: ["Ouverte", "Fermée"], opening: ["Ouvert", "Fermé"],
        motion: ["Mouvement", "Calme"], occupancy: ["Occupé", "Libre"], presence: ["Présent", "Absent"],
        moisture: ["Humide", "Sec"], smoke: ["Fumée !", "OK"], gas: ["Gaz !", "OK"], problem: ["Problème", "OK"],
        battery: ["Faible", "OK"], connectivity: ["Connecté", "Déconnecté"], plug: ["Branché", "Débranché"],
        lock: ["Déverrouillé", "Verrouillé"], running: ["En marche", "Arrêté"], vibration: ["Vibration", "Calme"],
        power: ["Sous tension", "Hors tension"], light: ["Lumière", "Sombre"], heat: ["Chaud", "Normal"], cold: ["Froid", "Normal"],
        sound: ["Son détecté", "Calme"], safety: ["Danger", "OK"], tamper: ["Sabotage", "OK"], update: ["Mise à jour", "À jour"],
        carbon_monoxide: ["CO !", "OK"], moving: ["En mouvement", "Immobile"], garage_door_opening: ["Ouvert", "Fermé"]
    }
}
};

// "fr-FR", "fr_FR", "FR" → "fr"; unknown languages → English.
function normalize(lang) {
    var l = String(lang || "").toLowerCase().split(/[-_]/)[0];
    return STRINGS[l] ? l : "en";
}
function setLang(lang) { LANG = normalize(lang); return LANG; }
// Languages offered in the screens' menu, and the one after the current (menu toggles through them).
var LANGUAGES = ["en", "fr"];
function nextLang() { var i = LANGUAGES.indexOf(LANG); return LANGUAGES[(i + 1) % LANGUAGES.length]; }
function lang() { return LANG; }

function table() { return STRINGS[LANG] || STRINGS.en; }

// t("pair.titleHome", "this screen", "Home") → "Pair this screen with “Home”"
function t(key, a, b) {
    var s = table()[key];
    if (s === undefined) s = STRINGS.en[key];
    if (s === undefined) s = key;
    if (a !== undefined) s = s.replace("{0}", a);
    if (b !== undefined) s = s.replace("{1}", b);
    return s;
}
function q(text) { return t("q", text); }
function stateLabel(s) { var m = table().states; return (m && m[s]) || STRINGS.en.states[s] || s; }
function binaryPair(deviceClass) { var m = table().binary; return (m && m[deviceClass]) || STRINGS.en.binary[deviceClass] || null; }
function decimal() { return table().decimal || "."; }

// ---- top bar clock and date
function pad2(n) { return n < 10 ? "0" + n : "" + n; }
// format "24" → 14:05, "12" → 2:05 PM
function clock(dt, format) {
    var h = dt.getHours(), m = pad2(dt.getMinutes());
    if (format !== "12") return pad2(h) + ":" + m;
    return ((h % 12) || 12) + ":" + m + (h < 12 ? " AM" : " PM");
}
// mode "short" → "Sun 22 Nov" / "dim. 22 nov."; "long" → "Sunday 22 November" / "dimanche 22 novembre"
function headerDate(dt, mode) {
    var tb = table(), en = STRINGS.en, long = mode === "long";
    var days = (long ? tb.days : tb.daysShort) || (long ? en.days : en.daysShort);
    var months = (long ? tb.months : tb.monthsShort) || (long ? en.months : en.monthsShort);
    return days[dt.getDay()] + " " + dt.getDate() + " " + months[dt.getMonth()];
}
