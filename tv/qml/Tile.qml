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
    // content scale: 1.0 for a 6-column grid, smaller for 7-8 columns, larger for 3-5
    readonly property real k: Math.max(0.65, Math.min(1.35, Model.cellSize(columns).h / 136))
    readonly property real pad: 14 * k
    readonly property real iconSize: (tile.h > 1 ? 50 : 34) * k
    // big top-right value only for numbers and thermostats; on/off sensors use the state line
    readonly property bool bigValue: { revision; return type === "climate" || (type === "sensor" && Model.isNumeric(st)); }
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
            fontSizeMode: Text.HorizontalFit; minimumPixelSize: 14
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
            opacity: root.on && root.type !== "camera" && !root.bigValue ? 0.14 : 0
            Behavior on opacity { NumberAnimation { duration: 200 } }
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
            height: 44 * root.k
            gradient: Gradient { GradientStop { position: 0; color: "#00000000" } GradientStop { position: 1; color: "#cc000000" } }
            Text {
                anchors.left: parent.left; anchors.leftMargin: root.pad; anchors.right: parent.right; anchors.rightMargin: root.pad
                anchors.verticalCenter: parent.verticalCenter
                text: Model.name(root.tile, root.st); color: "white"; font.pixelSize: 18 * root.k
                elide: Text.ElideRight
            }
        }

        // icon (top left)
        Icon {
            id: icon
            visible: root.type !== "camera"
            x: root.pad; y: root.pad * 0.9
            name: { root.revision; return Model.icon(root.tile, root.st); }
            size: root.iconSize
            color: root.on ? root.accent : Theme.text2
            Behavior on color { ColorAnimation { duration: 200 } }
        }

        // big value (numbers, thermostats): top right, shrinks to fit instead of being cut
        Text {
            visible: root.bigValue
            anchors.right: parent.right; anchors.rightMargin: root.pad
            anchors.top: parent.top; anchors.topMargin: root.pad * 0.6
            width: parent.width - 2 * root.pad - root.iconSize - 8 * root.k
            height: root.iconSize + 6 * root.k
            horizontalAlignment: Text.AlignRight; verticalAlignment: Text.AlignVCenter
            text: { root.revision; return Model.stateText(root.tile, root.st); }
            color: Theme.text
            font.pixelSize: (root.tile.w > 1 || root.tile.h > 1 ? 36 : 28) * root.k
            fontSizeMode: Text.Fit; minimumPixelSize: 11
            font.weight: Font.DemiBold
            elide: Text.ElideRight
        }

        // state line (bottom) for everything that is not a big value
        Text {
            id: stateLine
            visible: !root.bigValue && root.type !== "camera" && text !== ""
            anchors.left: parent.left; anchors.right: parent.right; anchors.bottom: parent.bottom
            anchors.leftMargin: root.pad; anchors.rightMargin: root.pad; anchors.bottomMargin: root.pad
            height: visible ? 26 * root.k : 0
            verticalAlignment: Text.AlignBottom
            text: { root.revision; return root.bigValue ? "" : Model.stateText(root.tile, root.st); }
            color: root.on ? Theme.text : Theme.text2
            font.pixelSize: 21 * root.k; font.weight: Font.DemiBold
            fontSizeMode: Text.HorizontalFit; minimumPixelSize: 12
            elide: Text.ElideRight
        }

        // name, just above the state line
        Text {
            id: nameLine
            visible: root.type !== "camera"
            anchors.left: parent.left; anchors.right: parent.right
            anchors.leftMargin: root.pad; anchors.rightMargin: root.pad
            anchors.bottom: stateLine.visible ? stateLine.top : parent.bottom
            anchors.bottomMargin: stateLine.visible ? 2 * root.k : root.pad
            height: (root.tile.h > 1 ? 44 : 22) * root.k
            verticalAlignment: Text.AlignBottom
            text: Model.name(root.tile, root.st)
            color: Theme.text2; font.pixelSize: 18 * root.k
            fontSizeMode: Text.HorizontalFit; minimumPixelSize: 12
            wrapMode: root.tile.h > 1 ? Text.WordWrap : Text.NoWrap
            maximumLineCount: root.tile.h > 1 ? 2 : 1
            elide: Text.ElideRight
        }

        // history curve between the icon and the name
        Graph {
            visible: root.hasGraph
            anchors.left: parent.left; anchors.right: parent.right
            anchors.leftMargin: root.pad; anchors.rightMargin: root.pad
            anchors.top: icon.bottom; anchors.topMargin: 4 * root.k
            anchors.bottom: nameLine.top; anchors.bottomMargin: 2 * root.k
            points: root.history
            lineColor: root.accent
            lineWidth: 2
            fillOpacity: 0.14
        }

        // busy indicator
        Rectangle {
            visible: root.busy
            anchors.right: parent.right; anchors.top: parent.top; anchors.margins: 12 * root.k
            width: 14 * root.k; height: width; radius: width / 2; color: root.accent
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
