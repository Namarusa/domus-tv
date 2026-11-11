// Shared layout rules for the editor (the TV app has a copy in tv/js/layout.js).
// Keep both files identical so the editor preview matches the TV exactly.

export const SCREEN = { width: 1280, height: 720, top: 84, side: 40, bottom: 28, gap: 14, header: 46 };

export function cellSize(columns) {
  const w = (SCREEN.width - 2 * SCREEN.side - SCREEN.gap * (columns - 1)) / columns;
  const h = Math.round(w * (columns <= 4 ? 0.62 : 0.72));
  return { w, h };
}

export function visibleRows(columns) {
  const { h } = cellSize(columns);
  return (SCREEN.height - SCREEN.top - SCREEN.bottom + SCREEN.gap) / (h + SCREEN.gap);
}

// Rows holding only section titles are short; every other row is one cell high.
export function rowMetrics(tiles, columns) {
  const cell = cellSize(columns);
  let rows = 0;
  for (const t of tiles) rows = Math.max(rows, t.y + t.h);
  const heights = [], offsets = [];
  let y = 0;
  for (let r = 0; r < rows; r++) {
    let content = false, header = false;
    for (const t of tiles) {
      if (r < t.y || r >= t.y + t.h) continue;
      if (effectiveType(t) === "header") header = true; else content = true;
    }
    heights[r] = header && !content ? SCREEN.header : cell.h;
    offsets[r] = y;
    y += heights[r] + SCREEN.gap;
  }
  return { heights, offsets, total: Math.max(0, y - SCREEN.gap) };
}

export function tileRect(tile, columns, metrics) {
  const cell = cellSize(columns);
  let h = 0;
  for (let r = tile.y; r < tile.y + tile.h; r++) h += (metrics.heights[r] || cell.h) + (r > tile.y ? SCREEN.gap : 0);
  return {
    x: SCREEN.side + tile.x * (cell.w + SCREEN.gap),
    y: metrics.offsets[tile.y] || 0,
    w: tile.w * cell.w + (tile.w - 1) * SCREEN.gap,
    h,
  };
}

export function defaultType(entityId) {
  const domain = (entityId || "").split(".")[0];
  switch (domain) {
    case "light": return "light";
    case "switch": case "input_boolean": case "fan": case "automation": case "siren":
    case "humidifier": case "group": return "toggle";
    case "scene": case "script": case "button": case "input_button": return "button";
    case "cover": return "cover";
    case "climate": case "water_heater": return "climate";
    case "camera": return "camera";
    case "lock": return "lock";
    case "media_player": return "media";
    default: return "sensor";
  }
}

export function defaultSize(type, columns) {
  if (type === "camera") return { w: 2, h: 2 };
  if (type === "climate" || type === "media") return { w: 2, h: 1 };
  if (type === "header") return { w: columns, h: 1 };
  return { w: 1, h: 1 };
}

export function effectiveType(tile) {
  return tile.type && tile.type !== "auto" ? tile.type : defaultType(tile.entity);
}

// Row-major first-fit packing, in list order (like CSS grid auto-flow: dense).
export function pack(tiles, columns) {
  const used = [];
  const free = (x, y, w, h) => {
    for (let r = y; r < y + h; r++)
      for (let c = x; c < x + w; c++)
        if (used[r] && used[r][c]) return false;
    return true;
  };
  const mark = (x, y, w, h) => {
    for (let r = y; r < y + h; r++) {
      used[r] = used[r] || [];
      for (let c = x; c < x + w; c++) used[r][c] = true;
    }
  };
  for (const t of tiles) {
    t.w = Math.max(1, Math.min(columns, t.w || 1));
    t.h = effectiveType(t) === "header" ? 1 : Math.max(1, Math.min(4, t.h || 1));
    let placed = false;
    for (let y = 0; !placed && y < 200; y++) {
      for (let x = 0; x + t.w <= columns; x++) {
        if (free(x, y, t.w, t.h)) {
          t.x = x; t.y = y; mark(x, y, t.w, t.h); placed = true; break;
        }
      }
    }
  }
  return tiles;
}
