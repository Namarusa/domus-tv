import QtQuick 2.4
import "../js/theme.js" as Theme
import "../js/config.js" as Config

// Shows a 6-digit code; an admin types it in Home Assistant → "Domus TV" → Écrans.
FocusScope {
    id: root
    property bool active: false
    signal paired(string token, string tvId)
    signal back()

    property string code: ""
    property string pollId: ""
    property string home: ""
    property string status: "connecting"   // connecting | waiting | error
    property string message: ""
    property int remaining: 0

    onActiveChanged: if (active) start(); else stop()

    function stop() {
        pollTimer.stop(); countdown.stop(); retry.stop();
        code = ""; pollId = "";
    }

    function start() {
        stop();
        status = "connecting";
        message = "";
        app.request("POST", "/api/domus_tv/pair/start", { name: Config.DEVICE_NAME }, false, function(st, data) {
            if (!root.active) return;
            if (st === 200 && data && data.code) {
                code = data.code; pollId = data.poll_id; home = data.home || "";
                if (data.language) app.setLanguage(data.language);
                console.log("Domus pairing code", code);
                remaining = data.expires_in || 600;
                status = "waiting";
                pollTimer.start(); countdown.start();
            } else {
                status = "error";
                if (st === 0) message = app.tr("pair.err.noanswer", settings.haUrl);
                else if (st === 404) message = app.tr("pair.err.noint");
                else if (st === 429) message = app.tr("pair.err.busy");
                else message = app.tr("pair.err.other", st);
                retry.start();
            }
        });
    }

    Timer {
        id: pollTimer; interval: 2000; repeat: true
        onTriggered: {
            app.request("GET", "/api/domus_tv/pair/poll/" + root.pollId, null, false, function(st, data) {
                if (!root.active) return;
                if (st === 200 && data && data.token) { root.stop(); root.paired(data.token, data.tv_id); }
                else if (st === 404) root.start();     // expired: new code
            });
        }
    }
    Timer { id: countdown; interval: 1000; repeat: true; onTriggered: { if (root.remaining > 0) root.remaining--; } }
    Timer { id: retry; interval: 6000; onTriggered: root.start() }

    Keys.onPressed: {
        if (event.key === Qt.Key_Back || event.key === Qt.Key_Escape || event.key === Qt.Key_Left) {
            event.accepted = true; root.back();
        } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Select) {
            event.accepted = true; root.start();
        }
    }

    Column {
        anchors.centerIn: parent
        width: 1000
        spacing: 26

        Text {
            width: parent.width; horizontalAlignment: Text.AlignHCenter
            color: Theme.text; font.pixelSize: 40; font.weight: Font.DemiBold
            text: root.home ? app.tr("pair.titleHome", app.tr("this.player"), root.home) : app.tr("pair.title", app.tr("this.player"))
        }
        Text {
            visible: app.notice !== ""
            width: parent.width; horizontalAlignment: Text.AlignHCenter; wrapMode: Text.WordWrap
            color: Theme.warn; font.pixelSize: 22
            text: app.notice
        }

        Row {
            visible: root.status === "waiting"
            anchors.horizontalCenter: parent.horizontalCenter
            spacing: 14
            Repeater {
                model: root.code.length
                Rectangle {
                    width: 100; height: 130; radius: 14
                    color: Theme.tile
                    anchors.verticalCenter: parent.verticalCenter
                    Text { anchors.centerIn: parent; text: root.code.charAt(index); color: Theme.text; font.pixelSize: 84; font.weight: Font.DemiBold }
                }
            }
        }

        Text {
            visible: root.status === "waiting"
            width: parent.width; horizontalAlignment: Text.AlignHCenter; wrapMode: Text.WordWrap
            color: Theme.text2; font.pixelSize: 24; lineHeight: 1.3
            text: app.tr("pair.instructions")
            textFormat: Text.StyledText
        }
        Text {
            visible: root.status === "waiting"
            width: parent.width; horizontalAlignment: Text.AlignHCenter
            color: Theme.text3; font.pixelSize: 20
            text: app.tr("pair.waiting", Math.floor(root.remaining / 60), (root.remaining % 60 < 10 ? "0" : "") + (root.remaining % 60))
        }

        Text {
            visible: root.status === "connecting"
            width: parent.width; horizontalAlignment: Text.AlignHCenter
            color: Theme.text2; font.pixelSize: 26
            text: app.tr("pair.connecting", settings.haUrl)
        }
        Text {
            visible: root.status === "error"
            width: parent.width; horizontalAlignment: Text.AlignHCenter; wrapMode: Text.WordWrap
            color: Theme.error; font.pixelSize: 24
            text: root.message
        }
        Text {
            width: parent.width; horizontalAlignment: Text.AlignHCenter
            color: Theme.text3; font.pixelSize: 18
            text: app.tr("pair.hint")
        }
    }
}
