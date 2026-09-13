// layout.js — pure. "air": the tight ASCII tree drawn with negative space. Every column/row that carries more than one
// box border (a shared side, or a child's border lying on its parent's) is split so each border gets its own line,
// `gap` empty cells apart. The tree itself stays tight — this only decides where things are drawn — so ⌘C and the
// model keep seeing the compact drawing that round-trips best.
const BOXES = new Set(['frame', 'box', 'img']);

// one axis: which tree coordinate carries which borders, and where each lands. Two borders on the same line only need
// separate slots when their boxes overlap along the other axis (a shared side, a child on its parent's edge); boxes
// merely aligned side by side keep sharing the line.
function axis(items, pos, size, opos, osize, gap) {
  const at = {};
  items.forEach((b, i) => {
    if (!BOXES.has(b.type)) return;
    const e = { i, area: b.w * b.h, a: b[opos], z: b[opos] + b[osize] };
    (at[b[pos]] ||= []).push({ ...e, side: 'lo' });
    (at[b[pos] + b[size] - 1] ||= []).push({ ...e, side: 'hi' });
  });
  const overlap = (p, q) => p.a < q.z - 1 && q.a < p.z - 1; // touching at one cell (a shared corner column) is not overlap
  const slot = {}, slots = {};
  for (const [c, list] of Object.entries(at)) {
    const hi = list.filter((e) => e.side === 'hi').sort((a, b) => a.area - b.area); // closing borders: inner box first
    const lo = list.filter((e) => e.side === 'lo').sort((a, b) => b.area - a.area); // opening borders: outer box first
    const placed = [];
    [...hi, ...lo].forEach((e) => {
      let k = 0;
      while (placed.some((p) => p.k === k && overlap(p, e))) k++;
      placed.push({ ...e, k }); slot[`${e.i}:${e.side}`] = k;
    });
    slots[c] = Math.max(...placed.map((p) => p.k)) + 1;
  }
  const cols = Object.keys(at).map(Number).sort((a, b) => a - b), step = gap + 1;
  const map = (c) => { let out = c; for (const e of cols) { if (e >= c) break; out += (slots[e] - 1) * step; } return out; };
  const back = (v) => { let c = 0; while (map(c + 1) <= v) c++; return c; };
  return { map, back, edge: (i, side, c) => map(c) + slot[`${i}:${side}`] * step };
}

export function breathe(items, gap = 1) {
  const X = axis(items, 'x', 'w', 'y', 'h', gap), Y = axis(items, 'y', 'h', 'x', 'w', gap);
  return items.map((it, i) => {
    const box = BOXES.has(it.type);
    const x = box ? X.edge(i, 'lo', it.x) : X.map(it.x), x1 = box ? X.edge(i, 'hi', it.x + it.w - 1) : X.map(it.x + it.w - 1);
    const y = box ? Y.edge(i, 'lo', it.y) : Y.map(it.y), y1 = box ? Y.edge(i, 'hi', it.y + it.h - 1) : Y.map(it.y + it.h - 1);
    return { ...it, x, y, w: x1 - x + 1, h: y1 - y + 1 };
  });
}
// both directions for single cells: tree → drawn (x, y) and drawn → tree (col, row), for placing things while in air
export function cells(items, gap = 1) {
  const X = axis(items, 'x', 'w', 'y', 'h', gap), Y = axis(items, 'y', 'h', 'x', 'w', gap);
  return { x: X.map, y: Y.map, col: X.back, row: Y.back };
}
