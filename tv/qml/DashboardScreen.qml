import QtQuick 2.4
import "../js/theme.js" as Theme
import "../js/model.js" as Model
import "../js/i18n.js" as I18n

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
            toast.show(app.tr(locked ? "confirm.unlock" : "confirm.lock", Model.name(t, app.states[t.entity])));
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
        // No dashboard yet (Home Assistant unreachable): OK opens the menu to change the address or retry.
        if ((k === Qt.Key_Return || k === Qt.Key_Enter || k === Qt.Key_Select) && app.layout === null) { menu.open(); return; }
        if (k === Qt.Key_Return || k === Qt.Key_Enter || k === Qt.Key_Select) { activate(); return; }
        if (k === Qt.Key_Info) { if (tiles[focusIndex]) details.open(tiles[focusIndex]); return; }
        if (k === Qt.Key_Menu || k === Qt.Key_Search) { menu.open(); return; }
        if (k === Qt.Key_PageUp || k === Qt.Key_ChannelUp || k === Qt.Key_MediaNext) { switchDash(dashIndex + 1); return; }
        if (k === Qt.Key_PageDown || k === Qt.Key_ChannelDown || k === Qt.Key_MediaPrevious) { switchDash(dashIndex - 1); return; }
        if (k >= Qt.Key_1 && k <= Qt.Key_9) { var i = k - Qt.Key_1; if (i < dashboards.length) switchDash(i); return; }
        if (k === Qt.Key_Back || k === Qt.Key_Escape) {
            // While Home Assistant is unreachable, Back opens the menu (address, retry, quit).
            if (!app.online || app.layout === null) { menu.open(); return; }
            if (exitArmed) Qt.quit();
            exitArmed = true; exitTimer.restart();
            toast.show(app.tr("dash.exit"));
            return;
        }
        event.accepted = false;
    }

    // ---------------------------------------------------------------- top bar
    // Settings per dashboard (Home Assistant → Domus TV → dashboard → Top bar).
    property var hd: Model.header(dash)
    property var now: new Date()
    Timer { interval: 10000; running: true; repeat: true; onTriggered: root.now = new Date() }

    Item {
        id: bar
        x: Model.SCREEN.side; width: parent.width - 2 * Model.SCREEN.side
        y: 0; height: Model.SCREEN.top - 14

        // clock (+ date): left, centre or right
        Row {
            id: clockBox
            visible: root.hd.clock !== "off"
            spacing: 12
            anchors.verticalCenter: parent.verticalCenter
            x: root.hd.clock === "left" ? 0 : root.hd.clock === "center" ? (bar.width - width) / 2 : bar.width - width
            Text {
                visible: root.hd.date !== "off"
                text: app.lang ? I18n.headerDate(root.now, root.hd.date) : ""
                color: Theme.text2; font.pixelSize: Math.max(16, Math.round(Model.clockPx(root.hd.clock_size) * 0.62))
                anchors.verticalCenter: parent.verticalCenter
            }
            Text {
                text: I18n.clock(root.now, root.hd.clock_format)
                color: Theme.text; font.pixelSize: Model.clockPx(root.hd.clock_size); font.weight: Font.Medium
                anchors.verticalCenter: parent.verticalCenter
            }
        }

        Row {
            anchors.verticalCenter: parent.verticalCenter
            x: root.hd.clock === "left" && clockBox.visible ? clockBox.width + 22 : 0
            spacing: 14
            Icon {
                visible: root.hd.title
                name: root.dash && root.dash.icon ? root.dash.icon : "home-automation"
                size: 36; color: root.dash && root.dash.icon ? Theme.text : Theme.accent
                anchors.verticalCenter: parent.verticalCenter
            }
            Text {
                visible: root.hd.title
                text: root.dash ? root.dash.title : ""
                color: Theme.text; font.pixelSize: 32; font.weight: Font.DemiBold
                anchors.verticalCenter: parent.verticalCenter
            }
            Row {
                spacing: 8
                visible: root.hd.dots && root.dashboards.length > 1
                anchors.verticalCenter: parent.verticalCenter
                Repeater {
                    model: root.dashboards.length
                    Rectangle { width: 10; height: 10; radius: 5; color: index === root.dashIndex ? Theme.text : Theme.line }
                }
            }
        }

        // status chips, weather, offline warning
        Row {
            anchors.right: parent.right
            anchors.rightMargin: root.hd.clock === "right" && clockBox.visible ? clockBox.width + 18 : 0
            anchors.verticalCenter: parent.verticalCenter
            spacing: 10
            Repeater {
                model: root.hd.chips
                Rectangle {
                    property var st: (app.statesRevision, app.states[modelData])
                    property bool on: Model.isOn(st)
                    height: 40; radius: 20; color: Theme.tile
                    width: chipRow.width + 24
                    anchors.verticalCenter: parent.verticalCenter
                    Row {
                        id: chipRow
                        x: 10; anchors.verticalCenter: parent.verticalCenter; spacing: 6
                        Icon { name: Model.icon({ entity: modelData }, parent.parent.st); size: 24; color: parent.parent.on ? Theme.accent : Theme.text2; anchors.verticalCenter: parent.verticalCenter }
                        Text { text: Model.stateText({ entity: modelData }, parent.parent.st); color: parent.parent.on ? Theme.text : Theme.text2; font.pixelSize: 18; anchors.verticalCenter: parent.verticalCenter }
                    }
                }
            }
            Row {
                visible: root.hd.weather !== ""
                property var st: (app.statesRevision, app.states[root.hd.weather])
                spacing: 6
                anchors.verticalCenter: parent.verticalCenter
                Icon { name: Model.weatherIcon(parent.st ? parent.st.s : ""); size: 30; color: Theme.accent; anchors.verticalCenter: parent.verticalCenter }
                Text { text: Model.weatherText(parent.st); color: Theme.text; font.pixelSize: 24; anchors.verticalCenter: parent.verticalCenter }
            }
            Rectangle {
                visible: !app.online
                height: 34; width: offText.implicitWidth + 50; radius: 17; color: Theme.error
                anchors.verticalCenter: parent.verticalCenter
                Icon { name: "lan-disconnect"; size: 20; color: "white"; anchors.left: parent.left; anchors.leftMargin: 12; anchors.verticalCenter: parent.verticalCenter }
                Text { id: offText; text: app.tr("dash.offline"); color: "white"; font.pixelSize: 17; anchors.right: parent.right; anchors.rightMargin: 14; anchors.verticalCenter: parent.verticalCenter }
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
        Text { anchors.horizontalCenter: parent.horizontalCenter; text: app.tr("dash.empty"); color: Theme.text; font.pixelSize: 30 }
        Text { anchors.horizontalCenter: parent.horizontalCenter; text: app.tr("dash.emptyHint"); color: Theme.text2; font.pixelSize: 20 }
    }
    Column {
        visible: app.layout === null
        anchors.centerIn: parent
        spacing: 14
        Text { anchors.horizontalCenter: parent.horizontalCenter; text: app.tr(app.online ? "dash.loading" : "dash.connecting"); color: Theme.text2; font.pixelSize: 26 }
        Text { anchors.horizontalCenter: parent.horizontalCenter; visible: !app.online; text: settings.haUrl; color: Theme.text3; font.pixelSize: 20 }
        Text { anchors.horizontalCenter: parent.horizontalCenter; visible: !app.online; text: app.tr("dash.offlineHint"); color: Theme.text; font.pixelSize: 20 }
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
