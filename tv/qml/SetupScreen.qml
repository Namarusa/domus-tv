import QtQuick 2.4
import "../js/theme.js" as Theme

// Home Assistant address, typed with the remote: http(s) · 4 IP numbers · port.
FocusScope {
    id: root
    property string url: ""
    signal submitted(string newUrl)

    property bool https: false
    property var parts: ["192", "168", "1", "10", "8123"]   // 4 octets + port
    property int seg: 1                                       // 0 = protocol, 1..4 octets, 5 port
    property bool fresh: true                                 // next digit replaces the field
    property string hostUrl: ""                               // non-IP URL from config.js
    property bool ipMode: true
    property string error: ""

    onUrlChanged: parse(url)
    Component.onCompleted: parse(url)

    function parse(u) {
        var m = /^(https?):\/\/([^\/:]+)(?::(\d+))?/.exec(u || "");
        if (!m) return;
        https = m[1] === "https";
        var ip = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(m[2]);
        if (ip) {
            parts = [ip[1], ip[2], ip[3], ip[4], m[3] || (https ? "443" : "8123")];
            ipMode = true;
        } else {
            hostUrl = u.replace(/\/+$/, "");
            ipMode = false;
        }
    }

    function build() {
        if (!ipMode) return hostUrl;
        for (var i = 0; i < 4; i++) {
            var n = parseInt(parts[i], 10);
            if (isNaN(n) || n > 255) { error = "Le nombre " + (i + 1) + " doit être entre 0 et 255"; return ""; }
        }
        var port = parseInt(parts[4], 10);
        if (isNaN(port) || port < 1 || port > 65535) { error = "Port invalide"; return ""; }
        return (https ? "https" : "http") + "://" + parts.slice(0, 4).join(".") + ":" + port;
    }

    function setPart(i, v) {
        var p = parts.slice();
        p[i] = v;
        parts = p;
    }

    function move(d) {
        seg = Math.max(0, Math.min(5, seg + d));
        fresh = true;
    }

    Keys.onPressed: {
        error = "";
        var k = event.key;
        event.accepted = true;
        if (!ipMode) {
            if (k === Qt.Key_Return || k === Qt.Key_Enter || k === Qt.Key_Select) submitted(hostUrl);
            else if (k >= Qt.Key_0 && k <= Qt.Key_9) { ipMode = true; seg = 1; }
            else if (k === Qt.Key_Back || k === Qt.Key_Escape) Qt.quit();
            return;
        }
        if (k >= Qt.Key_0 && k <= Qt.Key_9) {
            if (seg === 0) return;
            var d = String(k - Qt.Key_0);
            var i = seg - 1;
            var max = seg === 5 ? 5 : 3;
            var v = fresh ? d : parts[i] + d;
            fresh = false;
            if (v.length > max) v = d;
            setPart(i, v);
            if (seg < 5 && (v === "0" || v.length === 3 || parseInt(v + "0", 10) > 255)) move(1);
        } else if (k === Qt.Key_Left) move(-1);
        else if (k === Qt.Key_Right) move(1);
        else if (k === Qt.Key_Up || k === Qt.Key_Down) {
            if (seg === 0) { https = !https; if (parts[4] === "8123" && https) setPart(4, "443"); else if (parts[4] === "443" && !https) setPart(4, "8123"); }
            else {
                var n = (parseInt(parts[seg - 1], 10) || 0) + (k === Qt.Key_Up ? 1 : -1);
                var hi = seg === 5 ? 65535 : 255;
                setPart(seg - 1, String(Math.max(0, Math.min(hi, n))));
                fresh = true;
            }
        } else if (k === Qt.Key_Back || k === Qt.Key_Escape || k === Qt.Key_Backspace) {
            if (seg > 0 && parts[seg - 1].length > 0 && !fresh) setPart(seg - 1, parts[seg - 1].slice(0, -1));
            else if (seg > 0) move(-1);
            else Qt.quit();
        } else if (k === Qt.Key_Return || k === Qt.Key_Enter || k === Qt.Key_Select) {
            var u = build();
            if (u) submitted(u);
        } else event.accepted = false;
    }

    Column {
        anchors.centerIn: parent
        spacing: 28
        width: 900

        Row {
            spacing: 16
            anchors.horizontalCenter: parent.horizontalCenter
            Icon { name: "home-automation"; size: 64; color: Theme.accent; anchors.verticalCenter: parent.verticalCenter }
            Text { text: "Domus"; color: Theme.text; font.pixelSize: 54; font.weight: Font.DemiBold; anchors.verticalCenter: parent.verticalCenter }
        }
        Text {
            width: parent.width
            horizontalAlignment: Text.AlignHCenter
            wrapMode: Text.WordWrap
            color: Theme.text2
            font.pixelSize: 24
            text: "Adresse de votre Home Assistant"
        }

        // IP editor
        Row {
            visible: root.ipMode
            anchors.horizontalCenter: parent.horizontalCenter
            spacing: 6
            Repeater {
                model: 6
                Row {
                    spacing: 6
                    Text {
                        visible: index === 5 || (index > 1 && index < 5)
                        text: index === 5 ? ":" : "."
                        color: Theme.text2; font.pixelSize: 44
                        anchors.verticalCenter: parent.verticalCenter
                    }
                    Text {
                        visible: index === 1
                        text: "://"
                        color: Theme.text2; font.pixelSize: 44
                        anchors.verticalCenter: parent.verticalCenter
                    }
                    Rectangle {
                        width: index === 0 ? 150 : (index === 5 ? 150 : 110)
                        height: 76
                        radius: 10
                        color: root.seg === index ? Theme.tileFocus : Theme.tile
                        border.width: root.seg === index ? 3 : 0
                        border.color: Theme.focus
                        Text {
                            anchors.centerIn: parent
                            color: Theme.text
                            font.pixelSize: 40
                            text: index === 0 ? (root.https ? "https" : "http") : root.parts[index - 1]
                        }
                    }
                }
            }
        }

        // Pre-configured host name (config.js)
        Rectangle {
            visible: !root.ipMode
            anchors.horizontalCenter: parent.horizontalCenter
            width: hostText.implicitWidth + 60; height: 76; radius: 10
            color: Theme.tileFocus; border.width: 3; border.color: Theme.focus
            Text { id: hostText; anchors.centerIn: parent; color: Theme.text; font.pixelSize: 34; text: root.hostUrl }
        }

        Text {
            width: parent.width
            horizontalAlignment: Text.AlignHCenter
            wrapMode: Text.WordWrap
            color: root.error ? Theme.error : Theme.text3
            font.pixelSize: 20
            text: root.error ? root.error
                : root.ipMode ? "Chiffres : saisir · Gauche/Droite : changer de case · Haut/Bas : ajuster · OK : continuer"
                : "OK pour continuer · tapez un chiffre pour saisir une adresse IP"
        }
    }
}
