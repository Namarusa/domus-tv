import QtQuick 2.4
import "../js/theme.js" as Theme
import "../js/config.js" as Config

// Menu key: pick a dashboard, reload, change server, forget this Player.
FocusScope {
    id: root
    property var dashboards: []
    property int currentDash: 0
    property int current: 0
    property bool confirmForget: false
    signal pick(int index)
    signal closed()

    property var entries: {
        var out = [];
        for (var i = 0; i < dashboards.length; i++)
            out.push({ label: (i + 1) + ". " + dashboards[i].title, icon: dashboards[i].icon ? dashboards[i].icon.replace("mdi:", "") : "view-dashboard", dash: i });
        out.push({ label: "Recharger", icon: "refresh", cmd: "reload" });
        out.push({ label: "Changer d'adresse", icon: "server-network", cmd: "server" });
        out.push({ label: confirmForget ? "Confirmer : oublier ce Player" : "Oublier ce Player", icon: "link-off", cmd: "forget" });
        return out;
    }

    function open() { current = currentDash; confirmForget = false; visible = true; forceActiveFocus(); }
    function close() { focus = false; visible = false; closed(); }

    visible: false
    anchors.fill: parent

    Keys.onPressed: {
        var k = event.key;
        event.accepted = true;
        if (k === Qt.Key_Back || k === Qt.Key_Escape || k === Qt.Key_Menu || k === Qt.Key_Left) { close(); return; }
        if (k === Qt.Key_Up) { if (current > 0) current--; confirmForget = false; return; }
        if (k === Qt.Key_Down) { if (current < entries.length - 1) current++; confirmForget = false; return; }
        if (k === Qt.Key_Return || k === Qt.Key_Enter || k === Qt.Key_Select) {
            var e = entries[current];
            if (e.dash !== undefined) { close(); pick(e.dash); }
            else if (e.cmd === "reload") { close(); app.loadLayout(); }
            else if (e.cmd === "server") { close(); app.resetServer(); }
            else if (e.cmd === "forget") {
                if (!confirmForget) { confirmForget = true; return; }
                close(); app.resetServer();
            }
            return;
        }
        event.accepted = false;
    }

    Rectangle { anchors.fill: parent; color: "#99000000" }

    Rectangle {
        anchors.left: parent.left; anchors.top: parent.top; anchors.bottom: parent.bottom
        width: 420
        color: Theme.bg2
        Rectangle { anchors.right: parent.right; anchors.top: parent.top; anchors.bottom: parent.bottom; width: 1; color: Theme.line }

        Column {
            anchors.fill: parent; anchors.margins: 28
            spacing: 10
            Text { text: app.layout && app.layout.home ? app.layout.home : "Domus"; color: Theme.text; font.pixelSize: 30; font.weight: Font.DemiBold }
            Text { text: settings.haUrl; color: Theme.text3; font.pixelSize: 16; width: parent.width; elide: Text.ElideMiddle }
            Item { width: 1; height: 12 }
            Repeater {
                model: root.entries
                Rectangle {
                    width: parent.width; height: 56; radius: 10
                    color: index === root.current ? Theme.tileFocus : "transparent"
                    border.width: index === root.current ? 3 : 0; border.color: Theme.focus
                    Icon {
                        name: modelData.icon; size: 26
                        color: modelData.dash === root.currentDash ? Theme.accent : (modelData.cmd === "forget" && root.confirmForget ? Theme.error : Theme.text2)
                        anchors.left: parent.left; anchors.leftMargin: 14; anchors.verticalCenter: parent.verticalCenter
                    }
                    Text {
                        anchors.left: parent.left; anchors.leftMargin: 54; anchors.right: parent.right; anchors.rightMargin: 10
                        anchors.verticalCenter: parent.verticalCenter
                        text: modelData.label; elide: Text.ElideRight
                        color: modelData.cmd === "forget" && root.confirmForget ? Theme.error : Theme.text
                        font.pixelSize: 21; font.weight: modelData.dash === root.currentDash ? Font.DemiBold : Font.Normal
                    }
                }
            }
        }
        Text {
            anchors.bottom: parent.bottom; anchors.bottomMargin: 20; anchors.left: parent.left; anchors.leftMargin: 28
            text: "Domus " + Config.VERSION + " · « Oublier » ne retire pas l'accès dans HA"
            color: Theme.text3; font.pixelSize: 14
        }
    }
}
