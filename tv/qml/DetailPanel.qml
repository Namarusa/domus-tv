import QtQuick 2.4
import "../js/theme.js" as Theme
import "../js/model.js" as Model

// Right-hand panel opened with ⓘ (or OK on sensors / thermostats).
FocusScope {
    id: root
    property var tile: null
    property int revision: 0
    property var st: { revision; return tile ? app.states[tile.entity] : undefined; }
    property var rows: { revision; return tile ? Model.detailRows(tile, st).concat(Model.linkRows(tile)) : []; }
    property string confirmEntity: ""
    onCurrentChanged: followCurrent()
    function followCurrent() {
        var it = rowsRep.itemAt(current);
        if (!it) return;
        var y = it.mapToItem(content, 0, 0).y;
        if (current === 0) scroller.contentY = 0;
        else if (y + it.height > scroller.contentY + scroller.height)
            scroller.contentY = Math.min(content.height - scroller.height, y + it.height - scroller.height + 8);
        else if (y < scroller.contentY) scroller.contentY = Math.max(0, y - 8);
    }
    property var info: { revision; return tile ? Model.infoLines(tile, st) : []; }
    property int current: 0
    signal closed()
    signal openCamera(string entity)

    property var hist: null
    readonly property bool numeric: { revision; return tile !== null && Model.isNumeric(st) && Model.effectiveType(tile) === "sensor"; }

    function open(t) {
        tile = t; current = 0; hist = null; visible = true; forceActiveFocus();
        scroller.contentY = 0;
        if (Model.isNumeric(app.states[t.entity]))
            app.fetchHistory(t.entity, 24, function(d) { if (root.tile === t) root.hist = d; });
    }
    function runLink(id) {
        var lst = app.states[id], p = Model.linkPrimary(id, lst);
        if (p.ui === "camera") { close(); openCamera(id); return; }
        if (p.ui === "details") { open({ entity: id, type: "auto", name: "", icon: "", color: "", links: [] }); return; }
        if (p.ui === "confirm" && confirmEntity !== id) {
            confirmEntity = id;
            toast.show("Appuyez encore sur OK pour " + (lst && lst.s === "locked" ? "déverrouiller" : "verrouiller") + " « " + Model.name({ entity: id }, lst) + " »");
            return;
        }
        confirmEntity = "";
        app.runAction(id, p.action, p.value);
    }

    function close() { focus = false; visible = false; tile = null; closed(); }

    visible: false
    anchors.fill: parent

    Keys.onPressed: {
        var k = event.key;
        event.accepted = true;
        if (k === Qt.Key_Back || k === Qt.Key_Escape || k === Qt.Key_Info || k === Qt.Key_Menu) { close(); return; }
        if (k === Qt.Key_Up) { if (current > 0) current--; confirmEntity = ""; return; }
        if (k === Qt.Key_Down) { if (current < rows.length - 1) current++; confirmEntity = ""; return; }
        var row = rows[current];
        if (!row) return;
        if ((k === Qt.Key_Left || k === Qt.Key_Right) && row.kind === "stepper") {
            var a = Model.stepAction(row, k === Qt.Key_Right ? 1 : -1);
            app.runAction(tile.entity, a.action, a.value);
            return;
        }
        if ((k === Qt.Key_Return || k === Qt.Key_Enter || k === Qt.Key_Select) && row.kind === "link") {
            runLink(row.entity);
            return;
        }
        if (k === Qt.Key_Return || k === Qt.Key_Enter || k === Qt.Key_Select) {
            if (row.ui === "camera") { var e = tile.entity; close(); openCamera(e); return; }
            if (row.kind === "button") app.runAction(tile.entity, row.action);
            return;
        }
        event.accepted = false;
    }

    // dim the dashboard
    Rectangle { anchors.fill: parent; color: "#99000000" }

    Rectangle {
        id: panel
        anchors.right: parent.right; anchors.top: parent.top; anchors.bottom: parent.bottom
        width: 460
        color: Theme.bg2
        Rectangle { anchors.left: parent.left; anchors.top: parent.top; anchors.bottom: parent.bottom; width: 1; color: Theme.line }

        Flickable {
            id: scroller
            anchors.fill: parent
            anchors.margins: 32
            anchors.bottomMargin: 76          // keep clear of the key hint
            contentHeight: content.height
            interactive: false
            clip: true
            Behavior on contentY { NumberAnimation { duration: 150 } }

        Column {
            id: content
            width: scroller.width
            spacing: 18

            Row {
                spacing: 16
                width: parent.width
                Icon {
                    name: { root.revision; return root.tile ? Model.icon(root.tile, root.st) : ""; }
                    size: 56
                    color: Model.isOn(root.st) ? (root.tile && root.tile.color ? root.tile.color : Theme.accent) : Theme.text2
                    anchors.verticalCenter: parent.verticalCenter
                }
                Column {
                    width: parent.width - 72
                    anchors.verticalCenter: parent.verticalCenter
                    Text {
                        width: parent.width
                        text: root.tile ? Model.name(root.tile, root.st) : ""
                        color: Theme.text; font.pixelSize: 28; font.weight: Font.DemiBold
                        wrapMode: Text.WordWrap; maximumLineCount: 2; elide: Text.ElideRight
                    }
                    Text {
                        width: parent.width
                        text: { root.revision; return root.tile ? Model.stateText(root.tile, root.st) : ""; }
                        color: Theme.text2; font.pixelSize: 22
                        elide: Text.ElideRight
                    }
                }
            }

            Item { width: 1; height: 6 }

            Repeater {
                id: rowsRep
                model: root.rows
                Item {
                    width: parent.width
                    readonly property bool isLink: modelData.kind === "link"
                    readonly property bool firstLink: isLink && (index === 0 || root.rows[index - 1].kind !== "link")
                    readonly property var lst: { root.revision; return isLink ? app.states[modelData.entity] : undefined; }
                    height: 64 + (firstLink ? 34 : 0)
                    Text {
                        visible: parent.firstLink
                        y: 4
                        text: "Actions liées"; color: Theme.text3; font.pixelSize: 16
                    }
                Rectangle {
                    y: parent.firstLink ? 34 : 0
                    width: parent.width; height: 64; radius: 12
                    color: index === root.current ? Theme.tileFocus : Theme.tile
                    border.width: index === root.current ? 3 : 0
                    border.color: Theme.focus
                    Icon {
                        name: parent.parent.isLink ? Model.icon({ entity: modelData.entity }, parent.parent.lst) : (modelData.icon || "")
                        size: 28
                        color: parent.parent.isLink && Model.isOn(parent.parent.lst) ? Theme.accent : Theme.text2
                        anchors.left: parent.left; anchors.leftMargin: 16; anchors.verticalCenter: parent.verticalCenter
                    }
                    Text {
                        anchors.left: parent.left; anchors.leftMargin: 60; anchors.verticalCenter: parent.verticalCenter
                        width: parent.width - 60 - (parent.parent.isLink ? 170 : 16)
                        elide: Text.ElideRight
                        text: parent.parent.isLink ? Model.name({ entity: modelData.entity }, parent.parent.lst) : modelData.label
                        color: Theme.text; font.pixelSize: 22
                    }
                    Text {
                        visible: parent.parent.isLink
                        anchors.right: parent.right; anchors.rightMargin: 16; anchors.verticalCenter: parent.verticalCenter
                        width: 160; horizontalAlignment: Text.AlignRight; elide: Text.ElideRight
                        text: parent.parent.isLink ? Model.stateText({ entity: modelData.entity }, parent.parent.lst) : ""
                        color: Theme.text2; font.pixelSize: 19
                    }
                    Row {
                        visible: modelData.kind === "stepper"
                        anchors.right: parent.right; anchors.rightMargin: 16; anchors.verticalCenter: parent.verticalCenter
                        spacing: 12
                        Icon { name: "chevron-left"; size: 28; color: index === root.current ? Theme.text : Theme.text3; anchors.verticalCenter: parent.verticalCenter }
                        Text { text: modelData.value || ""; color: Theme.text; font.pixelSize: 22; font.weight: Font.DemiBold; anchors.verticalCenter: parent.verticalCenter }
                        Icon { name: "chevron-right"; size: 28; color: index === root.current ? Theme.text : Theme.text3; anchors.verticalCenter: parent.verticalCenter }
                    }
                }
                }
            }

            // 24 h history for numeric sensors
            Column {
                visible: root.numeric
                width: parent.width
                spacing: 6
                Row {
                    width: parent.width
                    Text { width: parent.width / 2; text: "Dernières 24 h"; color: Theme.text3; font.pixelSize: 16 }
                    Text {
                        width: parent.width / 2; horizontalAlignment: Text.AlignRight
                        color: Theme.text3; font.pixelSize: 16
                        text: root.hist && root.hist.min !== null && root.hist.min !== undefined
                              ? "min " + Model.fmtNumber(root.hist.min) + " · max " + Model.fmtNumber(root.hist.max) : ""
                    }
                }
                Rectangle {
                    width: parent.width; height: 150; radius: 12; color: Theme.tile
                    Graph {
                        anchors.fill: parent; anchors.margins: 10
                        points: root.hist ? root.hist.points : []
                        lineColor: root.tile && root.tile.color ? root.tile.color : Theme.accent
                    }
                    Text {
                        anchors.centerIn: parent
                        visible: !root.hist || !root.hist.points || root.hist.points.length === 0
                        text: root.hist && root.hist.recorder === false ? "Historique désactivé dans Home Assistant"
                              : (root.hist ? "Pas encore d'historique" : "Chargement…")
                        color: Theme.text3; font.pixelSize: 16
                    }
                }
            }

            Item { width: 1; height: 8 }

            Repeater {
                model: root.info
                Row {
                    width: parent.width
                    Text { width: 150; text: modelData[0]; color: Theme.text3; font.pixelSize: 18 }
                    Text { width: parent.width - 150; text: modelData[1]; color: Theme.text2; font.pixelSize: 18; elide: Text.ElideRight }
                }
            }
        }

        }

        Text {
            anchors.bottom: parent.bottom; anchors.bottomMargin: 24; anchors.horizontalCenter: parent.horizontalCenter
            width: parent.width - 48; horizontalAlignment: Text.AlignHCenter; wrapMode: Text.WordWrap
            text: root.rows.length ? "Haut/Bas : choisir · OK ou Gauche/Droite : agir · Retour : fermer" : "Retour pour fermer"
            color: Theme.text3; font.pixelSize: 16
        }
    }
}
