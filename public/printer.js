// printer.js — pure. items (cells) → ASCII. Boxes get proper ├ ┬ ┤ ┴ ┼ where their edges meet.
import { FILL, isWide } from './reader.js';

const U = 1, R = 2, D = 4, L = 8;
const LINE = { [U | D]: '│', [L | R]: '─', [R | D]: '┌', [L | D]: '┐', [U | R]: '└', [U | L]: '┘', [U | R | D]: '├', [U | L | D]: '┤',
  [L | R | D]: '┬', [U | L | R]: '┴', [U | R | D | L]: '┼', [U]: '│', [D]: '│', [L]: '─', [R]: '─' };
const RECTS = new Set(['frame', 'box', 'img']);
const isRect = (i) => RECTS.has(i.type) || (i.type === 'icon' && i.h > 1); // a tall icon prints as a frame holding its token
const pad = (s, w) => { const gap = Math.max(0, w - width(s)); const l = Math.floor(gap / 2); return ' '.repeat(l) + s + ' '.repeat(gap - l); };
export const width = (s) => [...s].reduce((n, c) => n + (isWide(c) ? 2 : 1), 0);

function leaf(it) {
  const t = it.text || '';
  switch (it.type) {
    case 'btn': return `[${pad(t, it.w - 2)}]`;
    case 'input': return `[${t}${'_'.repeat(Math.max(3, it.w - 2 - width(t)))}]`;
    case 'select': return `[${pad(`${t} ▾`, it.w - 2)}]`;
    case 'check': return it.checked ? '[x]' : '[ ]';
    case 'radio': return it.checked ? '(o)' : '( )';
    case 'link': return `<${pad(t, it.w - 2)}>`;
    case 'h': return `${'#'.repeat(it.level || 1)} ${t}`;
    case 'divider': return '─'.repeat(it.w);
    case 'arrow': return it.dir === 'left' ? `◄${'─'.repeat(Math.max(1, it.w - 1))}` : `${'─'.repeat(Math.max(1, it.w - 1))}►`;
    case 'img': return t ? `[${pad(t, it.w - 2)}]` : '~'.repeat(it.w);
    case 'icon': return pad(`[:${it.name}:]`, it.w);
    default: return t;
  }
}

const OPP = { tl: 'br', tr: 'bl', bl: 'tr', br: 'tl' };
// an arrow runs between two opposite corners of its box; legacy horizontal arrows only carry `dir`
export function arrowEnds(it) {
  const x1 = it.x + it.w - 1, y1 = it.y + it.h - 1;
  const c = { tl: [it.x, it.y], tr: [x1, it.y], bl: [it.x, y1], br: [x1, y1] };
  const from = it.from || (it.dir === 'left' ? 'tr' : 'tl');
  return [c[from], c[OPP[from]]];
}
function drawArrow(set, it, head = true) {
  const [[ax, ay], [bx, by]] = arrowEnds(it);
  const dx = bx - ax, dy = by - ay, n = Math.max(Math.abs(dx), Math.abs(dy));
  if (!n) return;
  const tip = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? '►' : '◄') : dy > 0 ? '▼' : '▲';
  for (let i = 0; i <= n; i++) {
    const x = Math.round(ax + (dx * i) / n), y = Math.round(ay + (dy * i) / n);
    set(x, y, i === n && head ? tip : dy === 0 ? '─' : dx === 0 ? '│' : (dx > 0) === (dy > 0) ? '╲' : '╱');
  }
}
// ponytail: a diamond is two slopes per row; the reader does not read it back yet
function drawDiamond(set, it) {
  const a = it.w / 2, b = it.h / 2;
  for (let i = 0; i < it.h; i++) {
    const half = a * (1 - Math.abs(i + 0.5 - b) / b), up = i + 0.5 < b, mid = Math.abs(i + 0.5 - b) < 0.5;
    const l = Math.max(0, Math.round(a - half)), r = Math.min(it.w - 1, Math.round(a + half) - 1);
    set(it.x + l, it.y + i, mid ? '<' : up ? '╱' : '╲');
    set(it.x + r, it.y + i, mid ? '>' : up ? '╲' : '╱');
  }
}
// a freehand stroke: each segment stepped cell by cell, the glyph following the segment's direction
function drawPen(set, it) {
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(v)));
  const pts = (it.pts || []).map(([x, y]) => [clamp(it.x + x, it.x, it.x + it.w - 1), clamp(it.y + y, it.y, it.y + it.h - 1)]);
  if (pts.length === 1) return set(pts[0][0], pts[0][1], '·');
  pts.slice(1).forEach(([bx, by], k) => {
    const [ax, ay] = pts[k];
    const dx = bx - ax, dy = by - ay, n = Math.max(Math.abs(dx), Math.abs(dy));
    if (!n) return;
    const c = Math.abs(dx) > 2 * Math.abs(dy) ? '─' : Math.abs(dy) > 2 * Math.abs(dx) ? '│' : (dx > 0) === (dy > 0) ? '╲' : '╱';
    for (let i = k ? 1 : 0; i <= n; i++) set(Math.round(ax + (dx * i) / n), Math.round(ay + (dy * i) / n), c); // a corner keeps the glyph that arrived first
  });
}
function drawEllipse(set, it) {
  const a = it.w / 2, b = it.h / 2;
  const ext = Array.from({ length: it.h }, (_, i) => {
    const half = a * Math.sqrt(Math.max(0, 1 - ((i + 0.5 - b) / b) ** 2));
    return [Math.max(0, Math.round(a - half)), Math.min(it.w - 1, Math.round(a + half) - 1)];
  });
  ext.forEach(([l, r], i) => {
    const y = it.y + i, last = it.h - 1;
    if (i === 0 || i === last) {
      set(it.x + l, y, i === 0 ? '╭' : '╰');
      for (let x = l + 1; x < r; x++) set(it.x + x, y, '─');
      set(it.x + r, y, i === 0 ? '╮' : '╯');
    } else {
      const grow = l < ext[i - 1][0], shrink = l > ext[i - 1][0];
      set(it.x + l, y, grow ? '╱' : shrink ? '╲' : '│');
      set(it.x + r, y, grow ? '╲' : shrink ? '╱' : '│');
    }
  });
}

export function print(items) {
  if (!items.length) return '';
  const w = Math.max(...items.map((i) => i.x + i.w)), h = Math.max(...items.map((i) => i.y + i.h));
  const g = Array.from({ length: h }, () => new Array(w).fill(' '));
  const lines = Array.from({ length: h }, () => new Array(w).fill(0));
  const put = (x, y, s) => { for (const c of s) { if (y < h && x < w) g[y][x] = c; x++; if (isWide(c)) { if (y < h && x < w) g[y][x] = FILL; x++; } } };

  const rects = items.filter(isRect).sort((a, b) => b.w * b.h - a.w * a.h);
  rects.forEach((r) => {
    const x1 = r.x + r.w - 1, y1 = r.y + r.h - 1;
    for (let x = r.x; x <= x1; x++) { const m = (x > r.x ? L : 0) | (x < x1 ? R : 0); lines[r.y][x] |= m; lines[y1][x] |= m; }
    for (let y = r.y; y <= y1; y++) { const m = (y > r.y ? U : 0) | (y < y1 ? D : 0); lines[y][r.x] |= m; lines[y][x1] |= m; }
    if (r.type === 'img' && r.h > 2) {
      const iw = r.w - 2, ih = r.h - 2;
      for (let t = 0; t < ih; t++) {
        const k = ih === 1 ? 0.5 : t / (ih - 1);
        const xl = r.x + 1 + Math.round(k * (iw - 1)), xr = x1 - 1 - Math.round(k * (iw - 1));
        g[r.y + 1 + t][xl] = xl === xr ? '╳' : '╲'; if (xl !== xr) g[r.y + 1 + t][xr] = '╱';
      }
    }
  });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (lines[y][x]) g[y][x] = LINE[lines[y][x]] || '┼';
  rects.filter((r) => r.title).forEach((r) => put(r.x + 2, r.y, ` ${r.title} `));
  rects.filter((r) => r.type === 'icon').forEach((r) => put(r.x + 1, r.y + Math.floor(r.h / 2), pad(`:${r.name}:`, r.w - 2)));
  const set = (x, y, c) => { if (y >= 0 && y < h && x >= 0 && x < w) g[y][x] = c; };
  items.filter((i) => !isRect(i) || i.h === 1).forEach((i) => {
    if (i.type === 'arrow' || i.type === 'line') drawArrow(set, i, i.type === 'arrow');
    else if (i.type === 'ellipse') drawEllipse(set, i);
    else if (i.type === 'diamond') drawDiamond(set, i);
    else if (i.type === 'pen') drawPen(set, i);
    else put(i.x, i.y, leaf(i));
  });
  return g.map((row) => row.join('').replaceAll(FILL, '').replace(/\s+$/, '')).join('\n');
}
