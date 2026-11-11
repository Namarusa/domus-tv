import QtQuick 2.4
import "../js/mdi.js" as Mdi

Text {
    property string name: ""
    property int size: 32
    font.family: app.iconFont
    font.pixelSize: size
    text: Mdi.glyph(name)
    renderType: Text.QtRendering
}
