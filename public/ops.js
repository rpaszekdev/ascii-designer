// ops.js — pure. What the model says (a short list of operations over ids) → what the tree becomes. Items arrive placed
// in canvas cells (with their sheet id); the app puts the result back into sheets. The model decides WHAT, this does the cells.
const kids = (items, id) => items.filter((i) => i.parent === id).flatMap((c) => [c.id, ...kids(items, c.id)]);
const shift = (items, id, dx, dy) => { if (!dx && !dy) return items; const ids = new Set([id, ...kids(items, id)]); return items.map((i) => (ids.has(i.id) ? { ...i, x: i.x + dx, y: i.y + dy } : i)); };
// the named items, in the given order, minus any whose ancestor is also named (it moves with its parent)
function pick(items, ids) {
  const its = (ids || []).map((id) => items.find((i) => i.id === id)).filter(Boolean);
  const named = new Set(its.map((i) => i.id));
  const under = (i) => { for (let p = items.find((x) => x.id === i.parent); p; p = items.find((x) => x.id === p.parent)) if (named.has(p.id)) return true; return false; };
  return its.filter((i) => !under(i));
}
const bbox = (its) => ({ x: Math.min(...its.map((i) => i.x)), y: Math.min(...its.map((i) => i.y)), x1: Math.max(...its.map((i) => i.x + i.w)), y1: Math.max(...its.map((i) => i.y + i.h)) });

function flow(items, ids, gap, axis) {
  const its = pick(items, ids); if (!its.length) return items;
  const b = bbox(its);
  let out = items, pos = axis === 'x' ? b.x : b.y;
  its.forEach((it) => {
    out = axis === 'x' ? shift(out, it.id, pos - it.x, b.y - it.y) : shift(out, it.id, b.x - it.x, pos - it.y);
    pos += (axis === 'x' ? it.w : it.h) + gap;
  });
  return out;
}
function grid(items, ids, cols, gap) {
  const its = pick(items, ids); if (!its.length) return items;
  const b = bbox(its), cw = Math.max(...its.map((i) => i.w)) + gap, ch = Math.max(...its.map((i) => i.h)) + gap;
  return its.reduce((out, it, k) => shift(out, it.id, b.x + (k % cols) * cw - it.x, b.y + Math.floor(k / cols) * ch - it.y), items);
}
function align(items, ids, edge) {
  const its = pick(items, ids); if (!its.length) return items;
  const b = bbox(its);
  return its.reduce((out, it) => shift(out, it.id,
    edge === 'left' ? b.x - it.x : edge === 'right' ? b.x1 - it.x - it.w : edge === 'centerx' ? Math.round((b.x + b.x1 - it.w) / 2) - it.x : 0,
    edge === 'top' ? b.y - it.y : edge === 'bottom' ? b.y1 - it.y - it.h : edge === 'centery' ? Math.round((b.y + b.y1 - it.h) / 2) - it.y : 0), items);
}

const OPS = {
  move: (items, o) => { const it = items.find((i) => i.id === o.id); return it ? shift(items, o.id, (o.x ?? it.x) - it.x, (o.y ?? it.y) - it.y) : items; },
  resize: (items, o) => items.map((i) => (i.id === o.id ? { ...i, w: Math.max(1, Math.round(o.w ?? i.w)), h: Math.max(1, Math.round(o.h ?? i.h)) } : i)),
  delete: (items, o) => { const gone = new Set([o.id, ...kids(items, o.id)]); return items.filter((i) => !gone.has(i.id)); },
  text: (items, o) => items.map((i) => {
    if (i.id !== o.id || typeof o.text !== 'string') return i;
    if (i.title !== undefined || i.type === 'box' || i.type === 'frame') return { ...i, title: o.text };
    return { ...i, text: o.text, ...(i.h === 1 && { w: Math.max(i.w, o.text.length + (i.type === 'text' || i.type === 'h' ? 0 : 4)) }) };
  }),
  row: (items, o) => flow(items, o.ids, o.gap ?? 2, 'x'),
  column: (items, o) => flow(items, o.ids, o.gap ?? 1, 'y'),
  grid: (items, o) => grid(items, o.ids, Math.max(1, o.cols ?? 2), o.gap ?? 1),
  align: (items, o) => align(items, o.ids, o.edge ?? 'left'),
  equalize: (items, o) => { const its = pick(items, o.ids), p = o.prop === 'h' ? 'h' : 'w'; if (!its.length) return items; const m = Math.max(...its.map((i) => i[p])), ids = new Set(its.map((i) => i.id)); return items.map((i) => (ids.has(i.id) ? { ...i, [p]: m } : i)); },
  wrap: (items, o) => {
    const its = pick(items, o.ids); if (!its.length) return items;
    const b = bbox(its), id = o.newId || `w${Math.random().toString(36).slice(2, 8)}`;
    const box = { id, type: 'box', x: b.x - 2, y: b.y - 1, w: b.x1 - b.x + 4, h: b.y1 - b.y + 2, parent: its[0].parent ?? null, sheet: its[0].sheet, ...(o.title && { title: String(o.title) }) };
    const ids = new Set(its.map((i) => i.id));
    return [...items.map((i) => (ids.has(i.id) ? { ...i, parent: id } : i)), box];
  },
};
export const OP_NAMES = Object.keys(OPS);
export function applyOps(items, ops) {
  return (Array.isArray(ops) ? ops : []).reduce((acc, o) => (o && OPS[o.op] ? OPS[o.op](acc, o) : acc), items);
}
