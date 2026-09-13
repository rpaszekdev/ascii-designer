// reader.js — pure. ASCII text → { w, h, items } in character cells.
// Rectangles (including regions carved by ├ ┬ ┤ ┴ junctions) become frames/boxes, bracket idioms become
// controls, everything else survives as text or 'unknown'. Sides may wobble a little; that's forgiven.
const TRUE_TL = new Set('┌╔╭+'), TRUE_BL = new Set('└╚╰+');
const TL = new Set('┌╔╭+┬├┼╤╟╠╦╬'), TR = new Set('┐╗╮+┬┤┼╤╢╣╦╬');
const BL = new Set('└╚╰+┴├┼╧╟╠╩╬'), BR = new Set('┘╝╯+┴┤┼╧╢╣╩╬');
const HE = new Set('─═-┬┴╤╧┼+╦╩╬'), VE = new Set('│║|├┤╟╢┼+╠╣╬');
const DIAG = /[\/\\╱╲╳]/g;
const ICON = /^\[?:([a-z][a-z0-9-]*):?\]?$/; // a box holding only this token is an icon of that size
const LETTERS = /\p{L}/gu;
const READABLE = /[\p{L}\p{N}\s.,:;!?'"()\/&%$€@*+#​-]/gu;
const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1F000}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u;
const ZERO = /[\p{M}️‍]/u;
export const FILL = '​'; // second cell of a wide character
export const isWide = (c) => WIDE.test(c);
const SIDE_SLACK = 2;

// order matters: earlier idioms consume their cells before later ones run
const IDIOMS = [
  ['icon', /\[:([a-z][a-z0-9-]*):?\]|:([a-z][a-z0-9-]*):/g, (m) => ({ name: m[1] || m[2] })],
  ['check', /\[( |x|X|✓|✔)\]/g, (m) => ({ checked: m[1] !== ' ' })],
  ['radio', /\(( |o|O|•|●|x|\*)\)/g, (m) => ({ checked: m[1] !== ' ' })],
  ['input', /\[[^\[\]]*?_{3,}[^\[\]]*?\]/g, (m) => ({ text: m[0].slice(1, -1).replace(/_+/g, ' ').trim() })],
  ['select', /\[([^\[\]]*?)\s*[▾▼]\s*\]/g, (m) => ({ text: m[1].trim() })],
  ['img', /\[\s*(?:~+|img|image|photo)\b[^\]]*\]|~{6,}/gi, (m) => ({ text: m[0].replace(/[\[\]~]/g, '').trim() })],
  ['btn', /\[\s*([^\[\]]+?)\s*\]/g, (m) => ({ text: m[1] })],
  ['arrow', /[-─═=]{2,}[>►▶→]|[<◄◀←][-─═=]{2,}|[→←↔]/g, (m) => (/[<◄◀←]/.test(m[0][0]) ? { dir: 'left', from: 'tr' } : { dir: 'right', from: 'tl' })],
  ['link', /<\s*([^<>]+?)\s*>/g, (m) => ({ text: m[1] })],
  ['h', /(#{1,3})\s+(\S.*?)(?=\s{2,}|$)/g, (m) => ({ level: m[1].length, text: m[2] })],
  ['divider', /[─═-]{3,}|={3,}/g, () => ({})],
];

export function toGrid(text) {
  const rows = text.replace(/\t/g, '    ').replace(/\r/g, '').split('\n');
  while (rows.length && !rows[rows.length - 1].trim()) rows.pop();
  const first = rows.findIndex((r) => r.trim());
  const body = first > 0 ? rows.slice(first) : rows;
  const indents = body.filter((r) => r.trim()).map((r) => r.match(/^ */)[0].length);
  const indent = indents.length ? Math.min(...indents) : 0;
  return body.map((r) => {
    const cells = [];
    for (const c of r.slice(indent)) {
      if (ZERO.test(c)) continue;
      if (isWide(c)) cells.push(c, FILL);
      else cells.push(c.length > 1 ? '�' : c);
    }
    return cells;
  });
}
export const fromGrid = (grid) => grid.map((r) => r.join('').replaceAll(FILL, '').replace(/\s+$/, '')).join('\n');
const clean = (s) => s.replaceAll(FILL, '');

// nearest x within ±slack of x0 on row y whose char is in set, trying the inward side first (dir = +1 for a
// left edge, -1 for a right edge) so a wobbly side never steals a neighbour's border; -1 if none
function near(at, x0, y, set, slack, dir = -1) {
  for (let d = 0; d <= slack; d++) for (const x of d ? [x0 + d * dir, x0 - d * dir] : [x0]) if (set.has(at(x, y))) return x;
  return -1;
}
const run = (at, y, xa, xb, set) => { for (let x = xa; x <= xb; x++) if (!set.has(at(x, y))) return false; return true; };

// walk down from a top edge; every row where both sides are found is recorded, bottoms are collected.
// A true └ corner ends the walk; a junction bottom (├ ┴ ┤) lets it continue, so a divider row yields a region
// AND the box keeps going. Broken rows are tolerated up to ~20%.
function findBottoms(at, x, x1, y, h) {
  const out = [];
  const left = {}, right = {};
  let bad = 0;
  for (let yy = y + 1; yy < h; yy++) {
    const xl = near(at, x, yy, BL, SIDE_SLACK, 1), xr = near(at, x1, yy, BR, SIDE_SLACK);
    if (xl !== -1 && xr !== -1 && run(at, yy, xl + 1, xr - 1, HE)) {
      left[yy] = xl; right[yy] = xr;
      out.push({ y1: yy, left: { ...left }, right: { ...right } });
      if (TRUE_BL.has(at(xl, yy))) break;
      continue;
    }
    const sl = near(at, x, yy, VE, SIDE_SLACK, 1), sr = near(at, x1, yy, VE, SIDE_SLACK);
    if (sl !== -1) left[yy] = sl;
    if (sr !== -1) right[yy] = sr;
    if ((sl === -1 || sr === -1) && ++bad > Math.max(1, Math.floor((yy - y) * 0.2))) break;
  }
  return out;
}

// minimal: nearest right edge, nearest bottom (the region a junction carves). maximal: farthest right edge and
// bottom that still close (the whole box). True corners yield both; junctions only the minimal region.
function findRect(at, x, y, w, h, maximal) {
  const xs = [];
  for (let x1 = x + 2; x1 < w; x1++) if (TR.has(at(x1, y)) && HE.has(at(x + 1, y)) && HE.has(at(x1 - 1, y))) xs.push(x1);
  if (maximal) xs.reverse();
  for (const x1 of xs) {
    const bottoms = findBottoms(at, x, x1, y, h);
    if (!bottoms.length) continue;
    const b = maximal ? bottoms[bottoms.length - 1] : bottoms[0];
    const top = Array.from({ length: x1 - x - 1 }, (_, i) => at(x + 1 + i, y));
    const title = top.some((c) => !HE.has(c)) ? clean(top.map((c) => (HE.has(c) ? ' ' : c)).join('')).trim() : '';
    return { x0: x, y0: y, x1, y1: b.y1, left: b.left, right: b.right, title };
  }
  return null;
}

function findRects(at, w, h) {
  const seen = new Set(), rects = [];
  const add = (r) => { if (!r) return; const k = `${r.x0},${r.y0},${r.x1},${r.y1}`; if (!seen.has(k)) { seen.add(k); rects.push(r); } };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!TL.has(at(x, y))) continue;
    add(findRect(at, x, y, w, h, false));
    if (TRUE_TL.has(at(x, y))) add(findRect(at, x, y, w, h, true));
  }
  return rects.filter(Boolean);
}

// ponytail: geometry-only roles; a classifier or Claude can overwrite these later, the field is the interface
function role(it, parent) {
  if (!parent) return it.w < 1.8 * it.h ? 'mobile' : 'page';
  const wide = it.w >= (parent.w - 2) * 0.85;
  if (wide && it.y - parent.y <= 2) return 'nav';
  if (wide && parent.y + parent.h - (it.y + it.h) <= 2) return 'footer';
  const tall = parent.h >= 10 && it.h >= (parent.h - 2) * 0.7; // sidebar/main only make sense in a tall parent
  if (tall) return it.x === parent.x ? 'sidebar' : it.x + it.w === parent.x + parent.w ? 'main' : 'panel';
  return it.w <= 27 && it.h <= 6 ? 'tile' : 'card'; // cells are ~1:2, so a tile is ≤ ~220×110 px
}

const area = (r) => r.w * r.h;
const inside = (outer, r) => outer !== r && outer.x <= r.x && outer.y <= r.y && outer.x + outer.w >= r.x + r.w && outer.y + outer.h >= r.y + r.h && area(outer) > area(r);
const strictlyInside = (outer, r) => outer.x < r.x && outer.y < r.y && outer.x + outer.w > r.x + r.w && outer.y + outer.h > r.y + r.h;
// ponytail: one or two lone symbols are icons, not noise
const readable = (s) => { const t = clean(s); return t.length <= 2 || ((t.match(READABLE) || []).length / t.length) >= 0.5; };

export function read(text) {
  const grid = toGrid(text);
  const h = grid.length;
  const w = Math.max(0, ...grid.map((r) => r.length));
  const at = (x, y) => (grid[y] && grid[y][x]) || ' ';
  const used = grid.map(() => new Array(w).fill(false));
  const mark = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) used[y][x] = true; };

  const rects = findRects(at, w, h).sort((a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0));
  const boxes = rects.map((r) => {
    let s = '';
    for (let y = r.y0 + 1; y < r.y1; y++) for (let x = r.x0 + 1; x < r.x1; x++) s += at(x, y);
    const isImg = (s.match(DIAG) || []).length >= 2 && (s.match(LETTERS) || []).length <= 12;
    mark(r.x0, r.y0, r.x1, r.y0); mark(r.x0, r.y1, r.x1, r.y1);
    Object.entries(r.left).forEach(([y, x]) => { used[y][x] = true; });
    Object.entries(r.right).forEach(([y, x]) => { used[y][x] = true; });
    const icon = !r.title && clean(s).trim().match(ICON);
    if (isImg || icon) mark(r.x0, r.y0, r.x1, r.y1);
    const type = icon ? 'icon' : isImg ? 'img' : 'box';
    return { type, x: r.x0, y: r.y0, w: r.x1 - r.x0 + 1, h: r.y1 - r.y0 + 1, ...(icon && { name: icon[1] }), ...(r.title && { title: r.title }) };
  });
  boxes.forEach((b) => {
    const parent = boxes.filter((o) => inside(o, b)).sort((a, c) => area(a) - area(c))[0];
    b.parent = parent ? boxes.indexOf(parent) : -1;
    if (b.type === 'box') { if (!parent) b.type = 'frame'; b.role = role(b, parent); }
  });

  const leaves = [];
  for (let y = 0; y < h; y++) {
    // one code unit per cell so regex indices are cell indices; astral chars (emoji) become a placeholder here
    // and are restored from the grid when the text is extracted
    let line = grid[y].map((c, x) => (used[y][x] ? ' ' : c.length > 1 ? '\uE000' : c)).join('').padEnd(w);
    const cells = (x, len) => grid[y].slice(x, x + len).join('');
    const take = (x, len) => { line = line.slice(0, x) + ' '.repeat(len) + line.slice(x + len); };
    for (const [type, re, extra] of IDIOMS) {
      [...line.matchAll(re)].forEach((m) => {
        const real = cells(m.index, m[0].length).match(new RegExp(re.source, re.flags.replace('g', ''))) || m;
        const ex = extra(real);
        leaves.push({ type, x: m.index, y, w: m[0].length, h: 1, ...ex, ...(ex.text !== undefined && { text: clean(ex.text) }) });
        take(m.index, m[0].length);
      });
    }
    for (const m of line.matchAll(/\S(?:\S| (?=\S))*/g)) {
      const text = clean(cells(m.index, m[0].length));
      leaves.push({ type: readable(text) ? 'text' : 'unknown', x: m.index, y, w: m[0].length, h: 1, text });
    }
  }
  leaves.forEach((l) => {
    const parent = boxes.filter((b) => strictlyInside(b, l)).sort((a, c) => area(a) - area(c))[0];
    l.parent = parent ? boxes.indexOf(parent) : -1;
  });
  return { w, h, items: [...boxes, ...leaves] };
}
