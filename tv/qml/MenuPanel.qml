import QtQuick 2.4
import "../js/theme.js" as Theme
import "../js/config.js" as Config
import "../js/i18n.js" as I18n

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
        out.push({ label: app.tr("menu.language"), icon: "translate", cmd: "lang" });
        out.push({ label: app.tr("menu.reload"), icon: "refresh", cmd: "reload" });
        out.push({ label: app.tr("menu.server"), icon: "server-network", cmd: "server" });
        out.push({ label: app.tr(confirmForget ? "menu.forgetConfirm" : "menu.forget", app.tr("this.player")), icon: "link-off", cmd: "forget" });
        out.push({ label: app.tr("menu.quit"), icon: "exit-to-app", cmd: "quit" });
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
            else if (e.cmd === "lang") app.setLanguage(I18n.nextLang());   // menu stays open, relabelled
            else if (e.cmd === "quit") Qt.quit();
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
            id: head
            anchors.left: parent.left; anchors.right: parent.right; anchors.top: parent.top; anchors.margins: 28
            spacing: 10
            Text { text: app.layout && app.layout.home ? app.layout.home : "Domus"; color: Theme.text; font.pixelSize: 30; font.weight: Font.DemiBold }
            Text { text: settings.haUrl; color: Theme.text3; font.pixelSize: 16; width: parent.width; elide: Text.ElideMiddle }
        }
        // Entries scroll when there are many dashboards, keeping the selection in view.
        Flickable {
            id: list
            anchors.left: parent.left; anchors.right: parent.right; anchors.top: head.bottom; anchors.bottom: parent.bottom
            anchors.leftMargin: 28; anchors.rightMargin: 28; anchors.topMargin: 20; anchors.bottomMargin: 52
            clip: true; interactive: false
            contentHeight: rows.height
            property real rowH: 60
            contentY: Math.max(0, Math.min(rows.height - height, (root.current + 1) * rowH - height + 8))
            Behavior on contentY { NumberAnimation { duration: 120 } }
          Column {
            id: rows
            width: parent.width
            spacing: 6
            Repeater {
                model: root.entries
                Rectangle {
                    width: parent.width; height: 54; radius: 10
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
        }
        Text {
            anchors.bottom: parent.bottom; anchors.bottomMargin: 20; anchors.left: parent.left; anchors.leftMargin: 28
            text: "Domus " + Config.VERSION + " · " + app.tr("menu.footer")
            color: Theme.text3; font.pixelSize: 14
        }
    }
}
