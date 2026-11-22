import QtQuick 2.4
import "../js/theme.js" as Theme

// Forecast columns: label / icon / temperature (low) / rain chance.
// items come from Model.forecastItems().
Row {
    id: root
    property var items: []
    property int count: 6
    property real k: 1
    property bool showRain: false
    property real columnWidth: count > 0 ? width / count : 0

    Repeater {
        model: Math.min(root.count, root.items.length)
        Column {
            width: root.columnWidth
            anchors.verticalCenter: parent.verticalCenter
            spacing: 2 * root.k
            Text {
                anchors.horizontalCenter: parent.horizontalCenter
                text: root.items[index].label; color: Theme.text2; font.pixelSize: 14 * root.k
            }
            Icon {
                anchors.horizontalCenter: parent.horizontalCenter
                name: root.items[index].icon; size: 26 * root.k; color: Theme.text
            }
            Row {
                anchors.horizontalCenter: parent.horizontalCenter
                spacing: 4 * root.k
                Text { text: root.items[index].temp; color: Theme.text; font.pixelSize: 17 * root.k; font.weight: Font.DemiBold }
                Text { visible: root.items[index].low !== ""; text: root.items[index].low; color: Theme.text3; font.pixelSize: 17 * root.k }
            }
            Text {
                visible: root.showRain && root.items[index].rain !== ""
                anchors.horizontalCenter: parent.horizontalCenter
                text: root.items[index].rain; color: "#6fa8dc"; font.pixelSize: 13 * root.k
            }
        }
    }
}
