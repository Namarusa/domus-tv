import QtQuick 2.4
import "../js/theme.js" as Theme
import "../js/model.js" as Model

Item {
    id: root
    property var tile
    property int columns: 6
    property var metrics: ({ heights: [], offsets: [] })
    property bool selected: false
    property bool busy: false
    property int revision: 0          // app.statesRevision, forces re-evaluation
    property var st: { revision; return app.states[tile.entity]; }

    readonly property string type: Model.effectiveType(tile)
    readonly property bool on: { revision; return Model.isOn(st); }
    readonly property bool unavailable: { revision; return tile.entity !== "" && st !== undefined && Model.isUnavailable(st, tile.entity); }
    readonly property color accent: tile.color ? tile.color : Theme.accent
    readonly property var rect: Model.tileRect(tile, columns, metrics)
    readonly property bool hasGraph: type === "sensor" && (tile.graph || 0) > 0
    property var history: []

    function loadHistory() {
        if (!hasGraph) return;
        app.fetchHistory(tile.entity, tile.graph, function(d) { root.history = d.points || []; });
    }
    Timer {
        interval: 300000; repeat: true; triggeredOnStart: true
        running: root.hasGraph && app.screen === "dash" && app.layout !== null
        onTriggered: root.loadHistory()
    }

    x: rect.x; y: rect.y; width: rect.w; height: rect.h
    z: selected ? 2 : 1

    // ---------------------------------------------------------------- header
    Item {
        visible: root.type === "header"
        anchors.fill: parent
        Text {
            anchors.left: parent.left; anchors.right: parent.right; anchors.bottom: parent.bottom
            anchors.bottomMargin: 12
            text: root.tile.name || ""
            color: Theme.text; font.pixelSize: 26; font.weight: Font.DemiBold
            elide: Text.ElideRight
        }
        Rectangle { anchors.left: parent.left; anchors.right: parent.right; anchors.bottom: parent.bottom; height: 1; color: Theme.line }
    }

    // ---------------------------------------------------------------- card
    Rectangle {
        id: card
        visible: root.type !== "header"
        anchors.fill: parent
        radius: Theme.radius
        color: root.selected ? Theme.tileFocus : Theme.tile
        clip: true
        // grow by a fixed ~8 px whatever the tile size (5% of a big camera tile was too much)
        scale: root.selected ? 1 + Math.min(0.05, 16 / Math.max(width, height)) : 1.0
        opacity: root.unavailable ? 0.55 : 1
        Behavior on scale { NumberAnimation { duration: 120 } }

        // tint when active
        Rectangle {
            anchors.fill: parent; radius: parent.radius
            color: root.accent
            opacity: root.on && root.type !== "camera" && root.type !== "sensor" ? 0.14 : 0
            Behavior on opacity { NumberAnimation { duration: 200 } }
        }

        // history curve behind the value
        Graph {
            visible: root.hasGraph
            anchors.left: parent.left; anchors.right: parent.right
            anchors.leftMargin: 16; anchors.rightMargin: 16
            anchors.top: parent.top; anchors.topMargin: parent.height * 0.40
            anchors.bottom: parent.bottom; anchors.bottomMargin: parent.height * 0.38
            points: root.history
            lineColor: root.accent
            lineWidth: 2
            fillOpacity: 0.14
        }

        // camera picture
        LiveImage {
            visible: root.type === "camera"
            anchors.fill: parent
            entity: root.type === "camera" ? root.tile.entity : ""
            interval: 3000
            running: root.type === "camera" && app.screen === "dash"
        }
        Rectangle {
            visible: root.type === "camera"
            anchors.left: parent.left; anchors.right: parent.right; anchors.bottom: parent.bottom
            height: 44
            gradient: Gradient { GradientStop { position: 0; color: "#00000000" } GradientStop { position: 1; color: "#cc000000" } }
            Text {
                anchors.left: parent.left; anchors.leftMargin: 14; anchors.verticalCenter: parent.verticalCenter
                text: Model.name(root.tile, root.st); color: "white"; font.pixelSize: 18
            }
        }

        // icon + texts
        Icon {
            visible: root.type !== "camera"
            x: 16; y: 14
            name: { root.revision; return Model.icon(root.tile, root.st); }
            size: root.tile.h > 1 ? 52 : 38
            color: root.on ? root.accent : Theme.text2
            Behavior on color { ColorAnimation { duration: 200 } }
        }
        Text {   // big value for sensors / climate on wide tiles
            visible: root.type === "sensor" || root.type === "climate"
            anchors.right: parent.right; anchors.rightMargin: 16
            anchors.top: parent.top; anchors.topMargin: 10
            width: parent.width - 80
            horizontalAlignment: Text.AlignRight
            text: { root.revision; return Model.stateText(root.tile, root.st); }
            color: Theme.text
            font.pixelSize: root.tile.w > 1 || root.tile.h > 1 ? 36 : 26
            font.weight: Font.DemiBold
            elide: Text.ElideRight
        }
        Column {
            visible: root.type !== "camera"
            anchors.left: parent.left; anchors.right: parent.right; anchors.bottom: parent.bottom
            anchors.margins: 16
            spacing: 2
            Text {
                width: parent.width
                text: Model.name(root.tile, root.st)
                color: Theme.text2; font.pixelSize: 18
                elide: Text.ElideRight
                maximumLineCount: root.tile.h > 1 ? 2 : 1
                wrapMode: Text.WordWrap
            }
            Text {
                visible: root.type !== "sensor" && root.type !== "climate" && text !== ""
                width: parent.width
                text: { root.revision; return Model.stateText(root.tile, root.st); }
                color: root.on ? Theme.text : Theme.text2
                font.pixelSize: 21; font.weight: Font.DemiBold
                elide: Text.ElideRight
            }
        }

        // busy indicator
        Rectangle {
            visible: root.busy
            anchors.right: parent.right; anchors.top: parent.top; anchors.margins: 12
            width: 14; height: 14; radius: 7; color: root.accent
            SequentialAnimation on opacity { running: root.busy; loops: Animation.Infinite
                NumberAnimation { from: 1; to: 0.2; duration: 400 } NumberAnimation { from: 0.2; to: 1; duration: 400 } }
        }
    }

    // focus ring
    Rectangle {
        visible: root.selected && root.type !== "header"
        anchors.fill: parent
        anchors.margins: -5
        scale: card.scale
        radius: Theme.radius + 4
        color: "transparent"
        border.width: 3
        border.color: Theme.focus
    }
}
