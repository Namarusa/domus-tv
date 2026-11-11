import QtQuick 2.4

// Line + soft fill graph of evenly spaced values (nulls = no data yet).
Canvas {
    id: g
    property var points: []
    property color lineColor: "#f5a623"
    property real lineWidth: 2.5
    property real fillOpacity: 0.18
    property real padTop: 4
    property real padBottom: 2

    onPointsChanged: requestPaint()
    onLineColorChanged: requestPaint()
    onWidthChanged: requestPaint()
    onHeightChanged: requestPaint()

    onPaint: {
        var ctx = getContext("2d");
        ctx.reset();
        var pts = points || [];
        var lo = 1e12, hi = -1e12, n = pts.length, i, first = -1;
        for (i = 0; i < n; i++) {
            if (pts[i] === null || pts[i] === undefined) continue;
            if (first < 0) first = i;
            if (pts[i] < lo) lo = pts[i];
            if (pts[i] > hi) hi = pts[i];
        }
        if (first < 0 || n < 2) return;
        if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
        var h = height - padTop - padBottom;
        function X(k) { return k * width / (n - 1); }
        function Y(v) { return padTop + (hi - v) / (hi - lo) * h; }

        ctx.beginPath();
        ctx.moveTo(X(first), Y(pts[first]));
        for (i = first + 1; i < n; i++) if (pts[i] !== null && pts[i] !== undefined) ctx.lineTo(X(i), Y(pts[i]));
        ctx.lineWidth = lineWidth;
        ctx.lineJoin = "round";
        ctx.strokeStyle = lineColor;
        ctx.stroke();

        ctx.lineTo(X(n - 1), height);
        ctx.lineTo(X(first), height);
        ctx.closePath();
        ctx.globalAlpha = fillOpacity;
        ctx.fillStyle = lineColor;
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}
