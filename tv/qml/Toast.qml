import QtQuick 2.4
import "../js/theme.js" as Theme

Rectangle {
    id: toast
    property bool error: false
    function show(message, isError) {
        label.text = message;
        error = !!isError;
        opacity = 1;
        hide.restart();
    }
    anchors.horizontalCenter: parent.horizontalCenter
    anchors.bottom: parent.bottom
    anchors.bottomMargin: 40
    width: Math.min(label.implicitWidth + 48, 1000)
    height: label.implicitHeight + 24
    radius: height / 2
    color: error ? Theme.error : "#e6000000"
    opacity: 0
    z: 100
    Behavior on opacity { NumberAnimation { duration: 200 } }
    Text {
        id: label
        anchors.centerIn: parent
        width: Math.min(implicitWidth, 950)
        color: "white"
        font.pixelSize: 20
        wrapMode: Text.WordWrap
        horizontalAlignment: Text.AlignHCenter
    }
    Timer { id: hide; interval: 3500; onTriggered: toast.opacity = 0 }
}
