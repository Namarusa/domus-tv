import QtQuick 2.4
import "../js/theme.js" as Theme
import "../js/model.js" as Model

// Full-screen camera. Left/Right switch between the dashboard's cameras.
FocusScope {
    id: root
    property var cameras: []        // tiles of type camera
    property int index: 0
    property var links: { var t = cameras[index]; return t && t.links ? t.links.filter(function(e) { return !!e; }) : []; }
    property int action: 0
    property string confirmEntity: ""
    onIndexChanged: { action = 0; confirmEntity = ""; }
    signal closed()

    function open(list, entity) {
        var found = -1;
        for (var i = 0; i < list.length; i++) if (list[i].entity === entity) found = i;
        if (found < 0) { list = [{ entity: entity, type: "camera", name: "", links: [] }]; found = 0; }
        cameras = list;
        index = found;
        action = 0;
        visible = true;
        forceActiveFocus();
        hint.opacity = 1; hideHint.restart();
    }
    function runAction(id) {
        var st = app.states[id], p = Model.linkPrimary(id, st);
        if (p.ui === "camera") { open(cameras, id); return; }
        if (p.ui === "details") { toast.show("Utilisez le panneau Info du tableau pour régler « " + Model.name({ entity: id }, st) + " »"); return; }
        if (p.ui === "confirm" && confirmEntity !== id) {
            confirmEntity = id;
            toast.show("Appuyez encore sur OK pour " + (st && st.s === "locked" ? "déverrouiller" : "verrouiller") + " « " + Model.name({ entity: id }, st) + " »");
            return;
        }
        confirmEntity = "";
        app.runAction(id, p.action, p.value, function(okDone) {
            if (okDone) toast.show("« " + Model.name({ entity: id }, app.states[id]) + " » : " + Model.stateText({ entity: id }, app.states[id]));
        });
    }

    function close() { focus = false; visible = false; closed(); }

    visible: false
    anchors.fill: parent

    Keys.onPressed: {
        event.accepted = true;
        var k = event.key;
        var ok = k === Qt.Key_Return || k === Qt.Key_Enter || k === Qt.Key_Select;
        if (k === Qt.Key_Back || k === Qt.Key_Escape) close();
        else if (links.length) {
            // action bar: Left/Right pick an action, OK runs it, Up/Down change camera
            if (k === Qt.Key_Right) { action = Math.min(links.length - 1, action + 1); confirmEntity = ""; }
            else if (k === Qt.Key_Left) { action = Math.max(0, action - 1); confirmEntity = ""; }
            else if (ok) runAction(links[action]);
            else if ((k === Qt.Key_Down || k === Qt.Key_PageDown) && cameras.length > 1) index = (index + 1) % cameras.length;
            else if ((k === Qt.Key_Up || k === Qt.Key_PageUp) && cameras.length > 1) index = (index + cameras.length - 1) % cameras.length;
            else event.accepted = false;
        }
        else if (ok) close();
        else if (k === Qt.Key_Right && cameras.length > 1) index = (index + 1) % cameras.length;
        else if (k === Qt.Key_Left && cameras.length > 1) index = (index + cameras.length - 1) % cameras.length;
        else event.accepted = false;
        hint.opacity = 1; hideHint.restart();
    }

    Rectangle { anchors.fill: parent; color: "black" }

    LiveImage {
        id: img
        anchors.fill: parent
        entity: root.visible && root.cameras.length ? root.cameras[root.index].entity : ""
        interval: 1000
        fillMode: Image.PreserveAspectFit
        running: root.visible
    }
    Text {
        visible: !img.ready
        anchors.centerIn: parent
        text: "Chargement de l'image…"
        color: Theme.text2; font.pixelSize: 24
    }

    Rectangle {
        id: hint
        anchors.left: parent.left; anchors.right: parent.right; anchors.bottom: parent.bottom
        height: 90
        gradient: Gradient { GradientStop { position: 0; color: "#00000000" } GradientStop { position: 1; color: "#cc000000" } }
        Behavior on opacity { NumberAnimation { duration: 400 } }
        Text {
            anchors.left: parent.left; anchors.leftMargin: 40; anchors.verticalCenter: parent.verticalCenter
            text: root.cameras.length ? Model.name(root.cameras[root.index], app.states[root.cameras[root.index].entity]) : ""
            color: "white"; font.pixelSize: 26; font.weight: Font.DemiBold
        }
        Text {
            anchors.right: parent.right; anchors.rightMargin: 40; anchors.verticalCenter: parent.verticalCenter
            text: root.links.length
                  ? "Gauche/Droite : choisir · OK : agir" + (root.cameras.length > 1 ? " · Haut/Bas : autre caméra" : "") + " · Retour : fermer"
                  : (root.cameras.length > 1 ? (root.index + 1) + "/" + root.cameras.length + " · Gauche/Droite : autre caméra · " : "") + "Retour : fermer"
            color: Theme.text2; font.pixelSize: 18
        }
    }
    Timer { id: hideHint; interval: 4000; onTriggered: hint.opacity = 0 }

    // linked actions (gate, lock, light…) over the picture
    Row {
        visible: root.links.length > 0
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.bottom: parent.bottom; anchors.bottomMargin: 100
        spacing: 16
        Repeater {
            model: root.links
            Rectangle {
                readonly property var st: { app.statesRevision; return app.states[modelData]; }
                readonly property bool sel: index === root.action
                width: 230; height: 84; radius: 16
                color: sel ? "#f2ffffff" : "#cc141a24"
                border.width: sel ? 0 : 1; border.color: "#33ffffff"
                Icon {
                    x: 16; anchors.verticalCenter: parent.verticalCenter
                    name: Model.icon({ entity: modelData }, parent.st)
                    size: 36
                    color: parent.sel ? "#141a24" : (Model.isOn(parent.st) ? Theme.accent : Theme.text)
                }
                Column {
                    x: 66; anchors.verticalCenter: parent.verticalCenter
                    width: parent.width - 80
                    Text {
                        width: parent.width; elide: Text.ElideRight
                        text: Model.name({ entity: modelData }, parent.parent.st)
                        color: parent.parent.sel ? "#141a24" : Theme.text; font.pixelSize: 20; font.weight: Font.DemiBold
                    }
                    Text {
                        width: parent.width; elide: Text.ElideRight
                        text: root.confirmEntity === modelData ? "OK pour confirmer" : Model.stateText({ entity: modelData }, parent.parent.st)
                        color: root.confirmEntity === modelData ? Theme.warn : (parent.parent.sel ? "#3a4352" : Theme.text2)
                        font.pixelSize: 17
                    }
                }
            }
        }
    }
}
