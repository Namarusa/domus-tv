import QtQuick 2.4

// Refreshing camera snapshot with two buffers so the picture never flashes.
Item {
    id: root
    property string entity: ""
    property int interval: 3000
    property bool running: true
    property int fillMode: Image.PreserveAspectCrop
    property bool ready: a.status === Image.Ready || b.status === Image.Ready
    property int front: 0

    function refresh() {
        var url = app.cameraUrl(entity, Date.now());
        if (!url) return;
        var back = front === 0 ? b : a;
        if (back.status === Image.Loading) return;   // previous one still coming
        back.source = url;
    }

    Image {
        id: a; anchors.fill: parent; fillMode: root.fillMode; asynchronous: true; cache: false
        visible: root.front === 0
        onStatusChanged: if (status === Image.Ready) root.front = 0
    }
    Image {
        id: b; anchors.fill: parent; fillMode: root.fillMode; asynchronous: true; cache: false
        visible: root.front === 1
        onStatusChanged: if (status === Image.Ready) root.front = 1
    }
    Timer {
        interval: root.interval; repeat: true; triggeredOnStart: true
        running: root.running && root.visible && root.entity !== ""
        onTriggered: root.refresh()
    }
}
