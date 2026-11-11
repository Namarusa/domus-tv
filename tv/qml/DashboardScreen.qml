import QtQuick 2.4
import "../js/theme.js" as Theme
import "../js/model.js" as Model

FocusScope {
    id: root
    property int dashIndex: 0
    property var dashboards: app.layout ? app.layout.dashboards : []
    property var dash: dashboards.length ? dashboards[Math.min(dashIndex, dashboards.length - 1)] : null
    property var tiles: dash ? dash.tiles : []
    property int columns: dash ? dash.columns : 6
    property int focusIndex: -1
    property var metrics: Model.rowMetrics(tiles, columns)
    readonly property int topPad: 16           // space for the focused tile's zoom and ring
    property string busyEntity: ""
    property string confirmEntity: ""
    property bool exitArmed: false

    onTilesChanged: {
        if (focusIndex < 0 || focusIndex >= tiles.length || Model.effectiveType(tiles[focusIndex]) === "header")
            focusIndex = Model.firstFocusable(tiles);
        ensureVisible();
    }
    onFocusIndexChanged: { confirmEntity = ""; ensureVisible(); }

    function switchDash(i) {
        if (!dashboards.length) return;
        dashIndex = (i + dashboards.length) % dashboards.length;
        focusIndex = Model.firstFocusable(tiles);
        flick.contentY = 0;
    }

    function ensureVisible() {
        var t = tiles[focusIndex];
        if (!t) return;
        var r = Model.tileRect(t, columns, metrics);
        var margin = 16;
        r = { x: r.x, y: r.y + topPad, w: r.w, h: r.h };
        if (r.y - margin < flick.contentY) flick.contentY = Math.max(0, r.y - margin);
        else if (r.y + r.h + margin > flick.contentY + flick.height)
            flick.contentY = Math.min(Math.max(0, flick.contentHeight - flick.height), r.y + r.h + margin - flick.height);
    }

    function cameraTiles() {
        var out = [];
        for (var i = 0; i < tiles.length; i++) if (Model.effectiveType(tiles[i]) === "camera") out.push(tiles[i]);
        return out;
    }

    function activate() {
        var t = tiles[focusIndex];
        if (!t) return;
        var p = Model.primary(t, app.states[t.entity]);
        if (p.ui === "camera") { camera.open(cameraTiles(), t.entity); return; }
        if (p.ui === "details") { details.open(t); return; }
        if (p.ui === "confirm" && confirmEntity !== t.entity) {
            confirmEntity = t.entity;
            confirmTimer.restart();
            var locked = app.states[t.entity] && app.states[t.entity].s === "locked";
            toast.show("Appuyez encore sur OK pour " + (locked ? "déverrouiller" : "verrouiller") + " « " + Model.name(t, app.states[t.entity]) + " »");
            return;
        }
        confirmEntity = "";
        busyEntity = t.entity;
        app.runAction(t.entity, p.action, p.value, function() { root.busyEntity = ""; });
    }
    Timer { id: confirmTimer; interval: 4000; onTriggered: root.confirmEntity = "" }
    Timer { id: exitTimer; interval: 2500; onTriggered: root.exitArmed = false }

    Keys.onPressed: {
        var k = event.key;
        event.accepted = true;
        var dir = k === Qt.Key_Left ? "left" : k === Qt.Key_Right ? "right" : k === Qt.Key_Up ? "up" : k === Qt.Key_Down ? "down" : "";
        if (dir) {
            var n = Model.neighbour(tiles, focusIndex, dir);
            if (n >= 0) focusIndex = n;
            else if (dir === "up") flick.contentY = 0;
            return;
        }
        if (k === Qt.Key_Return || k === Qt.Key_Enter || k === Qt.Key_Select) { activate(); return; }
        if (k === Qt.Key_Info) { if (tiles[focusIndex]) details.open(tiles[focusIndex]); return; }
        if (k === Qt.Key_Menu || k === Qt.Key_Search) { menu.open(); return; }
        if (k === Qt.Key_PageUp || k === Qt.Key_ChannelUp || k === Qt.Key_MediaNext) { switchDash(dashIndex + 1); return; }
        if (k === Qt.Key_PageDown || k === Qt.Key_ChannelDown || k === Qt.Key_MediaPrevious) { switchDash(dashIndex - 1); return; }
        if (k >= Qt.Key_1 && k <= Qt.Key_9) { var i = k - Qt.Key_1; if (i < dashboards.length) switchDash(i); return; }
        if (k === Qt.Key_Back || k === Qt.Key_Escape) {
            if (exitArmed) Qt.quit();
            exitArmed = true; exitTimer.restart();
            toast.show("Appuyez encore sur Retour pour quitter");
            return;
        }
        event.accepted = false;
    }

    // ---------------------------------------------------------------- top bar
    Item {
        id: bar
        x: Model.SCREEN.side; width: parent.width - 2 * Model.SCREEN.side
        y: 0; height: Model.SCREEN.top - 14

        Row {
            anchors.left: parent.left; anchors.verticalCenter: parent.verticalCenter
            spacing: 14
            Icon {
                name: root.dash && root.dash.icon ? root.dash.icon : "home-automation"
                size: 36; color: root.dash && root.dash.icon ? Theme.text : Theme.accent
                anchors.verticalCenter: parent.verticalCenter
            }
            Text {
                text: root.dash ? root.dash.title : ""
                color: Theme.text; font.pixelSize: 32; font.weight: Font.DemiBold
                anchors.verticalCenter: parent.verticalCenter
            }
            Row {
                spacing: 8
                visible: root.dashboards.length > 1
                anchors.verticalCenter: parent.verticalCenter
                Repeater {
                    model: root.dashboards.length
                    Rectangle { width: 10; height: 10; radius: 5; color: index === root.dashIndex ? Theme.text : Theme.line }
                }
            }
        }

        Row {
            anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter
            spacing: 20
            Rectangle {
                visible: !app.online
                height: 34; width: offText.implicitWidth + 50; radius: 17; color: Theme.error
                anchors.verticalCenter: parent.verticalCenter
                Icon { name: "lan-disconnect"; size: 20; color: "white"; anchors.left: parent.left; anchors.leftMargin: 12; anchors.verticalCenter: parent.verticalCenter }
                Text { id: offText; text: "Home Assistant injoignable"; color: "white"; font.pixelSize: 17; anchors.right: parent.right; anchors.rightMargin: 14; anchors.verticalCenter: parent.verticalCenter }
            }
            Text {
                id: clock
                color: Theme.text; font.pixelSize: 30
                anchors.verticalCenter: parent.verticalCenter
                text: Qt.formatTime(new Date(), "hh:mm")
                Timer { interval: 10000; running: true; repeat: true; onTriggered: clock.text = Qt.formatTime(new Date(), "hh:mm") }
            }
        }
    }

    // ---------------------------------------------------------------- tiles
    Flickable {
        id: flick
        anchors.left: parent.left; anchors.right: parent.right
        y: Model.SCREEN.top
        height: parent.height - Model.SCREEN.top
        interactive: false
        clip: true
        contentWidth: width
        contentHeight: root.metrics.total + Model.SCREEN.bottom + 2 * root.topPad
        Behavior on contentY { NumberAnimation { duration: 180; easing.type: Easing.OutCubic } }

        Item {
            width: flick.width; height: flick.contentHeight
            // room for the focus ring / zoom at the top edge
            y: root.topPad
            Repeater {
                model: root.tiles
                Tile {
                    tile: modelData
                    columns: root.columns
                    metrics: root.metrics
                    selected: index === root.focusIndex && root.activeFocus
                    busy: root.busyEntity !== "" && root.busyEntity === modelData.entity
                    revision: app.statesRevision
                }
            }
        }
    }

    Column {
        visible: app.layout !== null && root.tiles.length === 0
        anchors.centerIn: parent
        spacing: 12
        Text { anchors.horizontalCenter: parent.horizontalCenter; text: "Ce dashboard est vide"; color: Theme.text; font.pixelSize: 30 }
        Text { anchors.horizontalCenter: parent.horizontalCenter; text: "Ajoutez des tuiles dans Home Assistant → Domus TV. Elles apparaîtront ici toutes seules."; color: Theme.text2; font.pixelSize: 20 }
    }
    Text {
        visible: app.layout === null
        anchors.centerIn: parent
        text: app.online ? "Chargement…" : "Connexion à Home Assistant…"
        color: Theme.text2; font.pixelSize: 26
    }

    // ---------------------------------------------------------------- overlays
    DetailPanel {
        id: details
        revision: app.statesRevision
        onClosed: root.forceActiveFocus()
        onOpenCamera: camera.open(root.cameraTiles(), entity)
    }
    CameraView { id: camera; onClosed: root.forceActiveFocus() }
    MenuPanel {
        id: menu
        dashboards: root.dashboards
        currentDash: root.dashIndex
        onPick: root.switchDash(index)
        onClosed: if (app.screen === "dash") root.forceActiveFocus()
    }
}
