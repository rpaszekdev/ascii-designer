// app.js — white canvas + Excalidraw-style bottom bar. Paste ASCII → sheet of items (the tree is the truth; ASCII is import/export).
// Sheets move on the canvas; items move/resize in cells inside their sheet; a selection can span many items; ⌘C prints ASCII back out.
import { read } from './reader.js';
import { print, width } from './printer.js';
import { renderSheet, dims, arrowSvg, diamondSvg, penSvg, lucide, CW, CH } from './render.js';
import { stream, drawing } from './ai.js';
import { applyOps } from './ops.js';
import { breathe, cells } from './layout.js';

const $ = (s) => document.querySelector(s);
const viewport = $('#viewport'), world = $('#world'), hint = $('#hint'), handle = $('#handle');
const KEY = 'ascii-canvas';
const GRID = 8;
const RECTS = new Set(['frame', 'box', 'img', 'ellipse', 'diamond']);
const MIN = { frame: [3, 2], box: [3, 2], img: [3, 2], ellipse: [3, 2], diamond: [3, 2], arrow: [1, 1], line: [1, 1], pen: [1, 1] };
const FIXED_W = new Set(['text', 'h', 'check', 'radio', 'unknown']); // their width is their text
const DRAW = new Set(['box', 'diamond', 'ellipse', 'arrow', 'line']);
const minOf = (it) => (it.type === 'icon' ? [it.name.length + 4, 1] : MIN[it.type] || [1, 1]); // `[:name:]` / `│:name:│` must fit
const growsH = (it) => RECTS.has(it.type) || ['arrow', 'line', 'icon', 'pen'].includes(it.type) || it.h > 1;

const box = (lines, w) => ['┌' + '─'.repeat(w) + '┐', ...lines.map((l) => '│' + l.padEnd(w) + '│'), '└' + '─'.repeat(w) + '┘'].join('\n');
const SAMPLE = box([
  ' ◉ Acme        Home   Pricing   Docs      [ Sign up ] ',
  '──────────────────────────────────────────────────────',
  '',
  '   # Design in text. Ship real sites.                 ',
  '   Sketch it in ASCII, paste it here,                 ',
  '   see it as real components.                         ',
  '',
  '   [ Get started ]    < Watch demo >                  ',
  '',
  '   ┌── Fast ────────┐  ┌── Diffable ────┐             ',
  '   │ Paste it. Done.│  │ It is just text│             ',
  '   └────────────────┘  └────────────────┘             ',
  '',
  '   [email________________]  [ Subscribe ]             ',
  '   [x] Send me updates                                ',
], 54);

const uid = () => Math.random().toString(36).slice(2, 9);
const snap = (v) => Math.round(v / GRID) * GRID;
// reader items reference parents by index; sheets store ids so items can be moved and deleted freely
function itemsFrom(text) {
  const { items } = read(text);
  const ids = items.map(uid);
  return items.map((it, i) => ({ ...it, id: ids[i], parent: it.parent >= 0 ? ids[it.parent] : null }));
}
const asSheet = (s) => (s.items ? s : { id: s.id, x: s.x, y: s.y, items: itemsFrom(s.text || '') });

let state = load();
let saved = state, past = [], future = []; // undo: previous states (the tree is immutable, so these are just references)
let tx = 0, ty = 0, scale = 1;
let sel = []; // picks { sheet, item } — item null = the whole sheet
let mouse = null, space = false, drag = null, tool = 'select', keep = false;

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.sheets)) return { ...s, sheets: s.sheets.map(asSheet), skin: s.v === 2 ? s.skin : 'sketch', air: !!s.air, v: 2 };
  } catch {}
  return { sheets: [{ id: uid(), x: 0, y: 0, items: itemsFrom(SAMPLE) }], skin: 'sketch', air: false, v: 2 };
}
// save(false) stores without making an undo step (used while an answer streams in); the next save() closes the step
function save(mark = true) {
  if (mark) { if (saved !== state) { past.push(saved); future = []; if (past.length > 100) past.shift(); } saved = state; }
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}
function undo(redo = false) {
  const from = redo ? future : past, to = redo ? past : future;
  if (!from.length) return;
  to.push(state); state = from.pop(); saved = state; sel = [];
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  render();
}
const sheetOf = (id) => state.sheets.find((s) => s.id === id);
const itemOf = (sheet, id) => sheet.items.find((i) => i.id === id);
const descendants = (sheet, id) => sheet.items.filter((i) => i.parent === id).flatMap((c) => [c, ...descendants(sheet, c.id)]);
const family = (sheet, id) => [itemOf(sheet, id), ...descendants(sheet, id)];
// state is replaced, never mutated: every change builds new sheet/item objects and saves
function updateSheet(id, patch) { state = { ...state, sheets: state.sheets.map((s) => (s.id === id ? { ...s, ...patch } : s)) }; save(); }
function updateItems(id, fn) { updateSheet(id, { items: sheetOf(id).items.map(fn).filter(Boolean) }); }
// what is drawn: the tree as is, or in air mode the tree with every border on its own line (ids kept)
const view = (s) => (state.air ? breathe(s.items) : s.items);
const grid = (s) => (state.air ? cells(s.items) : { x: (c) => c, y: (c) => c, col: (c) => c, row: (c) => c });
const parentOf = (s, it) => s.items.filter((b) => ['frame', 'box', 'img'].includes(b.type) && b.x < it.x && b.y < it.y && b.x + b.w > it.x + it.w && b.y + b.h > it.y + it.h).sort((a, b) => a.w * a.h - b.w * b.h)[0]?.id ?? null;

// ---- selection: picked items (descendants included) per sheet; a sheet pick means all of its items
function pickedIds() {
  const out = {};
  sel.forEach((p) => {
    const s = sheetOf(p.sheet); if (!s) return;
    const ids = p.item ? family(s, p.item).map((f) => f.id) : s.items.map((i) => i.id);
    out[s.id] = new Set([...(out[s.id] || []), ...ids]);
  });
  return out;
}
const isPicked = (sheet, item = null) => sel.some((p) => p.sheet === sheet && p.item === item);
const bbox = (items) => { const x = Math.min(...items.map((i) => i.x)), y = Math.min(...items.map((i) => i.y)); return { x, y, w: Math.max(...items.map((i) => i.x + i.w)) - x, h: Math.max(...items.map((i) => i.y + i.h)) - y }; };
// the one sheet whose picked items a resize scales; null when picks span sheets
function resizeTarget() {
  const groups = Object.entries(pickedIds());
  if (groups.length !== 1) return null;
  const [id, ids] = groups[0], s = sheetOf(id);
  return { s, items: s.items.filter((i) => ids.has(i.id)) };
}
function select(picks) { sel = picks; paintSelection(); }

// ---- render
function render() {
  world.className = `skin-${state.skin}`;
  world.replaceChildren(...state.sheets.map((s) => renderSheet({ ...s, items: view(s) })), handle, ...world.querySelectorAll('#aiBubble'));
  $('#air').classList.toggle('on', state.air);
  hint.hidden = state.sheets.length > 0;
  document.querySelectorAll('[data-skin]').forEach((b) => b.classList.toggle('on', b.dataset.skin === state.skin));
  paintSelection();
}
function paintSelection() {
  world.querySelectorAll('.selected').forEach((el) => el.classList.remove('selected'));
  sel = sel.filter((p) => sheetOf(p.sheet) && (!p.item || itemOf(sheetOf(p.sheet), p.item)));
  sel.forEach((p) => world.querySelector(p.item ? `.item[data-id="${p.item}"]` : `.sheet[data-id="${p.sheet}"]`)?.classList.add('selected'));
  const t = resizeTarget();
  handle.hidden = !t?.items.length;
  if (handle.hidden) return;
  const ids = new Set(t.items.map((i) => i.id)), b = bbox(view(t.s).filter((i) => ids.has(i.id)));
  handle.style.left = `${t.s.x + (b.x + b.w) * CW - 5}px`; handle.style.top = `${t.s.y + (b.y + b.h) * CH - 5}px`;
}

// ---- pan / zoom
const apply = (animate = false) => {
  world.classList.toggle('animate', animate);
  world.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  $('#zoom').textContent = `${Math.round(scale * 100)}%`;
};
const zoomAt = (next, px, py) => {
  next = Math.min(4, Math.max(0.1, next));
  tx = px - (px - tx) * (next / scale); ty = py - (py - ty) * (next / scale); scale = next;
};
const center = () => { const r = viewport.getBoundingClientRect(); return [r.width / 2, r.height / 2]; };
const toWorld = (cx, cy) => { const r = viewport.getBoundingClientRect(); return [(cx - r.left - tx) / scale, (cy - r.top - ty) / scale]; };
function fit() {
  const els = [...world.querySelectorAll('.sheet')];
  if (!els.length) { tx = ty = 0; scale = 1; return apply(true); }
  const b = els.reduce((a, el) => ({
    x0: Math.min(a.x0, el.offsetLeft), y0: Math.min(a.y0, el.offsetTop),
    x1: Math.max(a.x1, el.offsetLeft + el.offsetWidth), y1: Math.max(a.y1, el.offsetTop + el.offsetHeight),
  }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  const r = viewport.getBoundingClientRect(), pad = 80;
  scale = Math.max(0.05, Math.min(1.5, (r.width - pad * 2) / (b.x1 - b.x0), (r.height - pad * 2 - 60) / (b.y1 - b.y0)));
  tx = (r.width - (b.x1 - b.x0) * scale) / 2 - b.x0 * scale;
  ty = (r.height - 60 - (b.y1 - b.y0) * scale) / 2 - b.y0 * scale;
  apply(true);
}
viewport.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = viewport.getBoundingClientRect();
  if (e.ctrlKey || e.metaKey) zoomAt(scale * Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
  else { tx -= e.deltaX; ty -= e.deltaY; }
  apply();
}, { passive: false });

// ---- mouse: pan / draw / text / erase / marquee / move
viewport.addEventListener('mousemove', (e) => { mouse = toWorld(e.clientX, e.clientY); });
viewport.addEventListener('mousedown', (e) => {
  if (e.target.closest('.bar, #editor, #handle, #asciiPanel, #textEdit, #aiBubble')) return;
  if (e.button === 1 || (e.button === 0 && (space || tool === 'hand'))) { e.preventDefault(); drag = { kind: 'pan', x: e.clientX, y: e.clientY, tx, ty }; viewport.classList.add('grabbing'); return; }
  if (e.button !== 0) return;
  const sheetEl = e.target.closest('.sheet'), itemEl = e.target.closest('.item');
  const s = sheetEl && sheetOf(sheetEl.dataset.id), it = s && itemEl && itemOf(s, itemEl.dataset.id);
  const [wx, wy] = toWorld(e.clientX, e.clientY);
  if (DRAW.has(tool)) {
    e.preventDefault();
    const el = document.createElement('div');
    el.className = `item ${tool} draft`;
    world.append(el);
    drag = { kind: 'draw', tool, wx, wy, el, sheetEl, moved: false };
    return;
  }
  if (tool === 'pen') {
    e.preventDefault();
    const el = document.createElement('div');
    el.className = 'item pen draft';
    el.innerHTML = '<svg width="0" height="0" style="overflow:visible"><polyline fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    world.append(el);
    drag = { kind: 'pen', wx, wy, pts: [[wx, wy]], el, sheetEl, moved: false };
    return;
  }
  if (tool === 'text') { e.preventDefault(); editText(s, wx, wy); return; }
  if (tool === 'ai') { e.preventDefault(); askAi(wx, wy); return; }
  if (tool === 'eraser') { if (it && it.type !== 'frame') erase(s, it); return; }
  e.preventDefault();
  if (!sheetEl) { if (!e.shiftKey) select([]); drag = { kind: 'marquee', wx, wy, add: e.shiftKey, moved: false }; return; }
  const pick = { sheet: s.id, item: it && it.type !== 'frame' ? it.id : null };
  if (e.shiftKey) select(isPicked(pick.sheet, pick.item) ? sel.filter((p) => !(p.sheet === pick.sheet && p.item === pick.item)) : [...sel, pick]);
  else if (!isPicked(pick.sheet, pick.item)) select([pick]);
  drag = { kind: 'move', x: e.clientX, y: e.clientY, moved: false, parts: moveParts() };
});
// what a drag moves: picked sheets by pixels, picked items (descendants included) by cells
function moveParts() {
  const sheets = sel.filter((p) => !p.item).map((p) => ({ s: sheetOf(p.sheet), el: world.querySelector(`.sheet[data-id="${p.sheet}"]`) }));
  const items = Object.entries(pickedIds()).filter(([id]) => !sheets.some((p) => p.s.id === id)).map(([id, ids]) => {
    const s = sheetOf(id), its = s.items.filter((i) => ids.has(i.id));
    return { s, its, els: its.map((i) => world.querySelector(`.item[data-id="${i.id}"]`)) };
  });
  const all = items.flatMap((g) => g.its);
  return { sheets, items, minX: Math.min(Infinity, ...all.map((i) => i.x)), minY: Math.min(Infinity, ...all.map((i) => i.y)) };
}
window.addEventListener('mousemove', (e) => {
  if (!drag) return;
  if (drag.kind === 'pan') { tx = drag.tx + e.clientX - drag.x; ty = drag.ty + e.clientY - drag.y; apply(); return; }
  const dx = (e.clientX - drag.x) / scale, dy = (e.clientY - drag.y) / scale;
  const [wx, wy] = toWorld(e.clientX, e.clientY);
  if (!drag.moved && Math.hypot(drag.kind === 'move' ? dx : wx - drag.wx, drag.kind === 'move' ? dy : wy - drag.wy) < 3) return;
  drag.moved = true;
  if (drag.kind === 'move') {
    drag.dx = Math.max(-drag.parts.minX, Math.round(dx / CW)); drag.dy = Math.max(-drag.parts.minY, Math.round(dy / CH));
    drag.parts.sheets.forEach((p) => { p.el.classList.add('dragging'); p.el.style.left = `${snap(p.s.x + dx)}px`; p.el.style.top = `${snap(p.s.y + dy)}px`; });
    drag.parts.items.forEach((g) => g.els.forEach((el) => { el.classList.add('dragging'); el.style.transform = `translate(${drag.dx * CW}px, ${drag.dy * CH}px)`; }));
    handle.hidden = true;
    return;
  }
  if (drag.kind === 'marquee') {
    if (!drag.el) { drag.el = Object.assign(document.createElement('div'), { id: 'marquee' }); world.append(drag.el); }
    drag.rect = { x: Math.min(wx, drag.wx), y: Math.min(wy, drag.wy), w: Math.abs(wx - drag.wx), h: Math.abs(wy - drag.wy) };
    Object.assign(drag.el.style, { left: `${drag.rect.x}px`, top: `${drag.rect.y}px`, width: `${drag.rect.w}px`, height: `${drag.rect.h}px` });
    return;
  }
  if (drag.kind === 'pen') {
    const [lx, ly] = drag.pts[drag.pts.length - 1];
    if (Math.hypot(wx - lx, wy - ly) < 2) return;
    drag.pts.push([wx, wy]);
    drag.el.querySelector('polyline').setAttribute('points', drag.pts.map(([x, y]) => `${x},${y}`).join(' '));
    return;
  }
  if (drag.kind === 'draw') {
    const g = geometry(drag, wx, wy);
    Object.assign(drag.el.style, { left: `${g.px}px`, top: `${g.py}px`, width: `${g.w * CW}px`, height: `${g.h * CH}px` });
    if (drag.tool === 'arrow' || drag.tool === 'line') drag.el.innerHTML = arrowSvg(g.w, g.h, g.from, drag.tool === 'arrow');
    if (drag.tool === 'diamond') drag.el.innerHTML = diamondSvg(g.w, g.h);
  }
});
window.addEventListener('mouseup', () => {
  if (!drag) return;
  if (drag.kind === 'pan') viewport.classList.remove('grabbing');
  else if (drag.kind === 'draw') { drag.el.remove(); if (drag.moved) finishDraw(drag, ...(mouse || [drag.wx, drag.wy])); }
  else if (drag.kind === 'pen') { drag.el.remove(); if (drag.moved) finishPen(drag); }
  else if (drag.kind === 'marquee') { drag.el?.remove(); if (drag.moved) select([...(drag.add ? sel : []), ...inRect(drag.rect)]); }
  else if (drag.kind === 'move' && drag.moved) {
    state = { ...state, sheets: state.sheets.map((sh) => {
      const p = drag.parts.sheets.find((q) => q.s.id === sh.id);
      if (p) return { ...sh, x: parseFloat(p.el.style.left), y: parseFloat(p.el.style.top) };
      const g = drag.parts.items.find((q) => q.s.id === sh.id);
      if (!g || (!drag.dx && !drag.dy)) return sh;
      const ids = new Set(g.its.map((i) => i.id));
      return { ...sh, items: sh.items.map((i) => (ids.has(i.id) ? { ...i, x: i.x + drag.dx, y: i.y + drag.dy } : i)) };
    }) };
    save(); render();
  }
  drag = null;
});
// picks inside a world-space rectangle: a sheet swallowed whole is one pick, otherwise its touched items
function inRect(r) {
  const hit = (x, y, w, h) => x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y;
  return state.sheets.flatMap((s) => {
    const items = view(s), d = dims(items);
    if (r.x <= s.x && r.y <= s.y && r.x + r.w >= s.x + d.w * CW && r.y + r.h >= s.y + d.h * CH) return [{ sheet: s.id, item: null }];
    return items.filter((i) => i.type !== 'frame' && hit(s.x + i.x * CW, s.y + i.y * CH, i.w * CW, i.h * CH)).map((i) => ({ sheet: s.id, item: i.id }));
  });
}
world.addEventListener('click', (e) => { if (e.target.closest('a')) e.preventDefault(); });

// ---- drawing tools: a drag becomes an item in the sheet it started on (or a new sheet), snapped to that sheet's cells
function geometry(d, wx, wy) {
  const s = d.sheetEl && sheetOf(d.sheetEl.dataset.id);
  const ox = s ? s.x : snap(Math.min(d.wx, wx)), oy = s ? s.y : snap(Math.min(d.wy, wy));
  const g = s ? grid(s) : { x: (c) => c, y: (c) => c, col: (c) => c, row: (c) => c };
  const cx0 = Math.max(0, g.col(Math.max(0, Math.round((Math.min(d.wx, wx) - ox) / CW)))), cy0 = Math.max(0, g.row(Math.max(0, Math.round((Math.min(d.wy, wy) - oy) / CH))));
  const [mw, mh] = MIN[d.tool];
  const w = Math.max(mw, Math.round(Math.abs(wx - d.wx) / CW)), h = Math.max(mh, Math.round(Math.abs(wy - d.wy) / CH));
  const from = `${wy >= d.wy ? 't' : 'b'}${wx >= d.wx ? 'l' : 'r'}`;
  return { s, ox, oy, x: cx0, y: cy0, w, h, from, px: ox + g.x(cx0) * CW, py: oy + g.y(cy0) * CH };
}
function finishDraw(d, wx, wy) {
  const g = geometry(d, wx, wy);
  const item = { id: uid(), type: d.tool, x: g.x, y: g.y, w: g.w, h: g.h, parent: null, ...((d.tool === 'arrow' || d.tool === 'line') && { from: g.from }) };
  addItem(g.s, item, g.ox, g.oy);
}
// a pen stroke: points in cell units (two decimals) relative to the stroke's own cell box, so it moves and scales like anything else
function finishPen(d) {
  const s = d.sheetEl && sheetOf(d.sheetEl.dataset.id);
  const floorSnap = (v) => Math.floor(v / GRID) * GRID; // a new sheet's origin must not sit past the stroke's first cell
  const ox = s ? s.x : floorSnap(Math.min(...d.pts.map((p) => p[0]))), oy = s ? s.y : floorSnap(Math.min(...d.pts.map((p) => p[1])));
  const cells = d.pts.map(([px, py]) => [Math.max(0, (px - ox) / CW), Math.max(0, (py - oy) / CH)]);
  const x = Math.max(0, Math.floor(Math.min(...cells.map((c) => c[0])))), y = Math.max(0, Math.floor(Math.min(...cells.map((c) => c[1]))));
  const w = Math.max(1, Math.ceil(Math.max(...cells.map((c) => c[0]))) - x), h = Math.max(1, Math.ceil(Math.max(...cells.map((c) => c[1]))) - y);
  const pts = cells.map(([cx, cy]) => [Math.round((cx - x) * 100) / 100, Math.round((cy - y) * 100) / 100]);
  addItem(s, { id: uid(), type: 'pen', x, y, w, h, pts, parent: null }, ox, oy);
}
// put an item in a sheet (parented to the smallest box around it) or start a new sheet at world px (ox, oy)
function addItem(s, item, ox, oy) {
  if (s) { updateSheet(s.id, { items: [...s.items, { ...item, parent: parentOf(s, item) }] }); sel = [{ sheet: s.id, item: item.id }]; }
  else {
    const sheet = { id: uid(), x: ox, y: oy, items: [item] };
    state = { ...state, sheets: [...state.sheets, sheet] }; save();
    sel = [{ sheet: sheet.id, item: item.id }];
  }
  if (!keep) setTool('select');
  render();
}
// text tool: click, type, Enter — a text item in the sheet under the cursor (or a new sheet)
function editText(s, wx, wy) {
  const ox = s ? s.x : snap(wx), oy = s ? s.y : snap(wy);
  const g = s ? grid(s) : { x: (c) => c, y: (c) => c, col: (c) => c, row: (c) => c };
  const cx = s ? g.col(Math.max(0, Math.round((wx - ox) / CW))) : 0, cy = s ? g.row(Math.max(0, Math.round((wy - oy) / CH))) : 0;
  const input = Object.assign(document.createElement('input'), { id: 'textEdit', spellcheck: false });
  input.style.left = `${ox + g.x(cx) * CW}px`; input.style.top = `${oy + g.y(cy) * CH}px`;
  let closed = false;
  const done = (commit) => {
    if (closed) return; closed = true;
    const text = input.value.trim();
    input.remove();
    if (commit && text) addItem(s, { id: uid(), type: 'text', text, x: cx, y: cy, w: width(text), h: 1, parent: null }, ox, oy);
    else { if (!keep) setTool('select'); render(); }
  };
  input.addEventListener('blur', () => done(true));
  input.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Enter') input.blur(); if (ev.key === 'Escape') done(false); });
  world.append(input); input.focus();
}
// ✦ tool: an anchored prompt. The answer streams into a new sheet at the anchor and is re-read as every line lands — a live
// paste. With a selection, its ASCII goes along as context and the answer is the redrawn version (placed at the anchor).
let aiCtrl = null;
const SHOT_PROMPT = 'Redraw this screenshot as an ASCII wireframe with the idioms, about 70 characters wide. Keep the layout and the texts you can read.';
const imageFrom = (dt) => [...(dt?.files || [])].find((f) => f.type.startsWith('image/'));
const dataUrl = (file) => new Promise((ok, err) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => err(new Error('could not read the image')); r.readAsDataURL(file); });
function askAi(wx, wy, edit = false, image = null) {
  aiCtrl?.abort(); aiCtrl = null; $('#aiBubble')?.remove();
  const x = snap(wx), y = snap(wy);
  const bubble = Object.assign(document.createElement('div'), { id: 'aiBubble' });
  bubble.innerHTML = `<span class="star">✦</span><img class="shot" alt="" hidden><textarea rows="2" spellcheck="false"></textarea><small>Enter to draw · Esc to close · ⌘V a screenshot</small>`;
  bubble.style.left = `${x}px`; bubble.style.top = `${y}px`;
  const ta = bubble.querySelector('textarea'), status = bubble.querySelector('small');
  const scope = sel.length ? 'selection' : 'canvas';
  const context = scope === 'selection' ? selectionAscii() : edit ? canvasAscii() : '';
  const elements = edit ? elementsFor(scope) : undefined;
  const shot = bubble.querySelector('.shot');
  const attach = (url) => { image = url; shot.src = url; shot.hidden = false; ta.placeholder = 'what should I draw from this screenshot? (Enter = redraw it as a wireframe)'; };
  if (image) attach(image);
  else ta.placeholder = edit ? (scope === 'selection' ? 'what should change? — a row, a column, a 2×2 grid, align, rename…' : 'what should change on the canvas?') : context ? 'how should the selection change?' : 'what should appear here?';
  bubble.addEventListener('paste', async (ev) => { const f = imageFrom(ev.clipboardData); if (!f) return; ev.preventDefault(); ev.stopPropagation(); try { attach(await dataUrl(f)); } catch (err) { status.textContent = err.message; } });
  let sheetId = null;
  const close = () => { aiCtrl?.abort(); aiCtrl = null; bubble.remove(); if (!keep) setTool('select'); render(); };
  const run = async () => {
    const prompt = ta.value.trim() || (image ? SHOT_PROMPT : '');
    if (!prompt || aiCtrl) return;
    aiCtrl = new AbortController(); ta.disabled = true; bubble.classList.add('busy'); status.textContent = 'thinking…';
    try {
      const raw = await stream(prompt, context, (text) => {
        if (!text) return;
        if (edit) { status.textContent = 'writing…'; return; }
        status.textContent = 'drawing…';
        const items = itemsFrom(text);
        state = { ...state, sheets: sheetId ? state.sheets.map((sh) => (sh.id === sheetId ? { ...sh, items } : sh)) : [...state.sheets, { id: (sheetId = uid()), x, y, items }] };
        save(false); render();
      }, aiCtrl.signal, elements, image || undefined);
      if (edit) applyAnswer(drawing(raw, true), scope);
      else if (sheetId) { sel = [{ sheet: sheetId, item: null }]; save(); }
      else flash('nothing drawn');
      close();
    } catch (err) {
      aiCtrl = null; ta.disabled = false; bubble.classList.remove('busy');
      status.textContent = err.name === 'AbortError' ? 'stopped' : err.message.slice(0, 160);
    }
  };
  ta.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); run(); } if (ev.key === 'Escape') close(); });
  world.append(bubble); ta.focus();
}
// the ask button: the selection (or the whole canvas) plus every element's id and place, so the model knows what is where
function openAsk() {
  let x, y;
  if (sel.length) {
    const pts = sel.map((p) => { const s = sheetOf(p.sheet), it = p.item ? view(s).find((i) => i.id === p.item) : null; return [s.x + (it ? it.x * CW : 0), s.y + (it ? it.y * CH : 0)]; });
    x = Math.min(...pts.map((p) => p[0])); y = Math.min(...pts.map((p) => p[1]));
  } else [x, y] = toWorld(...center().map((v, i) => v + viewport.getBoundingClientRect()[i ? 'top' : 'left']));
  askAi(x, y, true);
}
function elementsFor(scope) {
  const ids = pickedIds(), sheets = scope === 'selection' ? state.sheets.filter((s) => ids[s.id]) : state.sheets;
  return sheets.flatMap((s) => placed(s, s.items).map((i) => ({ id: i.id, type: i.type, x: i.x, y: i.y, w: i.w, h: i.h, ...(i.text && { text: i.text }), ...(i.title && { title: i.title }),
    ...(i.name && { icon: i.name }), ...(i.parent && { parent: i.parent }), ...(ids[s.id]?.has(i.id) && { selected: true }) })));
}
const placedAll = () => state.sheets.flatMap((s) => placed(s, s.items).map((i) => ({ ...i, sheet: s.id })));
// items in canvas cells → back into their sheets; an emptied sheet disappears, one pushed past its origin moves instead
function unplace(items) {
  const sheets = state.sheets.map((s) => {
    const mine = items.filter((i) => i.sheet === s.id);
    if (!mine.length) return null;
    const ox = Math.round(s.x / CW), oy = Math.round(s.y / CH);
    const sx = Math.min(0, ...mine.map((i) => i.x - ox)), sy = Math.min(0, ...mine.map((i) => i.y - oy));
    return { ...s, x: s.x + sx * CW, y: s.y + sy * CH, items: mine.map(({ sheet, ...i }) => ({ ...i, x: i.x - ox - sx, y: i.y - oy - sy })) };
  }).filter(Boolean);
  state = { ...state, sheets };
}
// an answer is either operations (a JSON array → applied exactly by ops.js) or a drawing (takes the place of what was asked about); one undo step either way
function applyAnswer(text, scope) {
  const t = text.trim();
  if (t.startsWith('[')) {
    let ops;
    try { ops = JSON.parse(t); } catch { flash('could not read the changes'); return; }
    unplace(applyOps(placedAll(), ops));
    sel = []; save(); render();
    flash(`${ops.length} change${ops.length === 1 ? '' : 's'} · ⌘Z undoes`);
    return;
  }
  const items = itemsFrom(t);
  if (!items.length) { flash('nothing drawn'); return; }
  const ids = pickedIds();
  if (scope === 'canvas' || sel.every((p) => !p.item)) {
    const keep = scope === 'canvas' ? state.sheets[0] : sheetOf(sel[0].sheet);
    const gone = new Set(scope === 'canvas' ? state.sheets.map((s) => s.id) : Object.keys(ids));
    state = { ...state, sheets: keep ? state.sheets.filter((s) => s === keep || !gone.has(s.id)).map((s) => (s === keep ? { ...s, items } : s)) : [{ id: uid(), x: 0, y: 0, items }] };
    sel = [{ sheet: state.sheets.find((s) => s.items === items).id, item: null }];
  } else {
    const [sid] = Object.keys(ids), s = sheetOf(sid), b = bbox(s.items.filter((i) => ids[sid].has(i.id)));
    const rest = s.items.filter((i) => !ids[sid].has(i.id)), moved = items.map((i) => ({ ...i, x: i.x + b.x, y: i.y + b.y }));
    const parent = parentOf({ items: rest }, { x: b.x, y: b.y, w: Math.max(...moved.map((i) => i.x + i.w)) - b.x, h: Math.max(...moved.map((i) => i.y + i.h)) - b.y });
    state = { ...state, sheets: state.sheets.map((sh) => (sh.id === sid ? { ...sh, items: [...rest, ...moved.map((i) => (i.parent ? i : { ...i, parent }))] } : sh)) };
    sel = [{ sheet: sid, item: null }];
  }
  save(); render(); flash('replaced · ⌘Z undoes');
}
function erase(s, it) {
  const gone = new Set(family(s, it.id).map((f) => f.id));
  updateItems(s.id, (i) => (gone.has(i.id) ? null : i));
  sel = sel.filter((p) => !gone.has(p.item));
  if (!sheetOf(s.id).items.length) state = { ...state, sheets: state.sheets.filter((x) => x.id !== s.id) }, save();
  render();
}
function setTool(t) {
  tool = t;
  document.querySelectorAll('#tools button').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
  viewport.classList.toggle('drawing', DRAW.has(t) || ['text', 'ai', 'pen'].includes(t));
  viewport.classList.toggle('erasing', t === 'eraser');
  viewport.classList.toggle('hand', t === 'hand');
}
document.querySelectorAll('#tools button').forEach((b) => { b.onclick = () => setTool(b.dataset.tool); });
const icon = (i) => lucide(i.dataset.icon).then((svg) => { if (svg) i.innerHTML = svg; });
document.querySelectorAll('.bar i[data-icon]').forEach(icon);
$('#lock').onclick = () => { keep = !keep; $('#lock').classList.toggle('on', keep); const i = $('#lock i'); i.dataset.icon = keep ? 'lock' : 'lock-open'; icon(i); };

// ---- resize: scales every picked item (the whole sheet when a sheet is picked) from the group's top-left corner, in cells
handle.addEventListener('pointerdown', (e) => {
  const t = resizeTarget();
  if (!t?.items.length) return;
  e.preventDefault(); e.stopPropagation();
  const b = bbox(t.items);
  const els = Object.fromEntries(t.items.map((i) => [i.id, world.querySelector(`.item[data-id="${i.id}"]`)]));
  let next = t.items;
  const scaled = (sx, sy) => t.items.map((i) => {
    const [mw, mh] = minOf(i);
    const w = FIXED_W.has(i.type) ? i.w : Math.max(mw, Math.round(i.w * sx));
    const h = growsH(i) ? Math.max(mh, Math.round(i.h * sy)) : i.h;
    return { ...i, x: b.x + Math.round((i.x - b.x) * sx), y: b.y + Math.round((i.y - b.y) * sy), w, h, ...(i.pts && { pts: i.pts.map(([px, py]) => [(px * w) / i.w, (py * h) / i.h]) }) };
  });
  const move = (ev) => {
    const w = Math.max(1, b.w + Math.round((ev.clientX - e.clientX) / scale / CW)), h = Math.max(1, b.h + Math.round((ev.clientY - e.clientY) / scale / CH));
    next = scaled(w / b.w, h / b.h);
    const byId = Object.fromEntries(next.map((i) => [i.id, i])), ids = new Set(next.map((i) => i.id));
    const shown = view({ ...t.s, items: t.s.items.map((i) => byId[i.id] || i) }).filter((i) => ids.has(i.id));
    shown.forEach((i) => {
      const el = els[i.id]; if (!el) return;
      Object.assign(el.style, { left: `${i.x * CW}px`, top: `${i.y * CH}px`, width: `${i.w * CW}px`, height: `${i.h * CH}px` });
      if (i.type === 'arrow' || i.type === 'line') el.innerHTML = arrowSvg(i.w, i.h, i.from || 'tl', i.type === 'arrow');
      if (i.type === 'diamond') el.innerHTML = diamondSvg(i.w, i.h);
      if (i.type === 'pen') el.innerHTML = penSvg(i);
    });
    const nb = bbox(shown);
    handle.style.left = `${t.s.x + (nb.x + nb.w) * CW - 5}px`; handle.style.top = `${t.s.y + (nb.y + nb.h) * CH - 5}px`;
  };
  const up = () => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
    const byId = Object.fromEntries(next.map((i) => [i.id, i]));
    updateItems(t.s.id, (i) => byId[i.id] || i);
    render();
  };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
});

// ---- paste / copy / delete
function addSheet(text) {
  const [cx, cy] = mouse || toWorld(...center().map((v, i) => v + viewport.getBoundingClientRect()[i ? 'top' : 'left']));
  const sheet = { id: uid(), x: snap(cx), y: snap(cy), items: itemsFrom(text) };
  if (!sheet.items.length) return;
  state = { ...state, sheets: [...state.sheets, sheet] };
  sel = [{ sheet: sheet.id, item: null }];
  save(); render();
}
document.addEventListener('paste', async (e) => {
  if (e.target.closest?.('#editor, #textEdit, #aiBubble')) return;
  const shot = imageFrom(e.clipboardData);
  if (shot) { // a screenshot: the ✦ opens with it attached, at the mouse, and Enter redraws it as components
    e.preventDefault();
    const [cx, cy] = mouse || toWorld(...center().map((v, i) => v + viewport.getBoundingClientRect()[i ? 'top' : 'left']));
    try { askAi(cx, cy, false, await dataUrl(shot)); } catch (err) { flash(err.message); }
    return;
  }
  const text = e.clipboardData.getData('text/plain');
  if (!text.trim()) return;
  e.preventDefault();
  addSheet(text);
});
// items placed in canvas cells (sheet offsets applied) print as one drawing, so a selection across sheets copies whole
const placed = (s, items) => items.map((i) => ({ ...i, x: i.x + Math.round(s.x / CW), y: i.y + Math.round(s.y / CH) }));
function asciiOf(items) {
  if (!items.length) return '';
  const x0 = Math.min(...items.map((i) => i.x)), y0 = Math.min(...items.map((i) => i.y));
  return print(items.map((i) => ({ ...i, x: i.x - x0, y: i.y - y0 })));
}
const canvasAscii = () => asciiOf(state.sheets.flatMap((s) => placed(s, s.items)));
const selectionAscii = () => asciiOf(Object.entries(pickedIds()).flatMap(([id, ids]) => { const s = sheetOf(id); return placed(s, s.items.filter((i) => ids.has(i.id))); }));
document.addEventListener('copy', (e) => {
  if (!sel.length || e.target.closest?.('#editor, #asciiPanel, #textEdit, #aiBubble') || String(getSelection())) return;
  e.clipboardData.setData('text/plain', selectionAscii());
  e.preventDefault();
});
function removeSelected() {
  if (!sel.length) return;
  const sheets = new Set(sel.filter((p) => !p.item).map((p) => p.sheet)), ids = pickedIds();
  const all = sheets.size === state.sheets.length;
  state = { ...state, sheets: state.sheets.filter((s) => !sheets.has(s.id)).map((s) => (ids[s.id] ? { ...s, items: s.items.filter((i) => !ids[s.id].has(i.id)) } : s)).filter((s) => s.items.length) };
  sel = []; save(); render();
  if (all) flash('canvas cleared');
}
// ⌘⇧C: the sheet as JSON — the hook for anything that wants to sit on top (a classifier, Claude)
async function copyJson() { if (sel.length) await navigator.clipboard.writeText(JSON.stringify(sheetOf(sel[0].sheet).items, null, 2)); }
// ⌘⇧P: the prompt that teaches Claude to draw ASCII the reader understands
async function copyPrompt() { await navigator.clipboard.writeText(await (await fetch('PROMPT.md')).text()); flash('prompt copied — paste it to Claude'); }
function flash(msg) {
  const el = Object.assign(document.createElement('div'), { id: 'toast', textContent: msg });
  document.body.append(el);
  setTimeout(() => el.remove(), 1800);
}
const panel = $('#asciiPanel');
async function toggleAscii(open = panel.hidden) {
  panel.hidden = !open;
  $('#ascii').classList.toggle('on', open);
  if (!open) return;
  panel.value = canvasAscii();
  try { await navigator.clipboard.writeText(panel.value); flash('ASCII copied'); } catch { flash('select and ⌘C to copy'); }
}
window.asciiDesigner = { read, print, sheets: () => state.sheets, ascii: canvasAscii, select, selection: () => sel, tool: setTool, busy: () => !!aiCtrl, undo, ask: openAsk, apply: applyAnswer };

// ---- double-click: edit the sheet as ASCII (re-imports on commit)
world.addEventListener('dblclick', (e) => {
  const sheetEl = e.target.closest('.sheet');
  if (!sheetEl || tool !== 'select') return;
  const s = sheetOf(sheetEl.dataset.id);
  const text = print(s.items);
  const ta = document.createElement('textarea');
  ta.id = 'editor'; ta.spellcheck = false; ta.value = text;
  const rows = text.split('\n');
  ta.style.left = `${s.x}px`; ta.style.top = `${s.y}px`;
  ta.style.width = `${Math.max(40, ...rows.map((r) => r.length)) * CW + 24}px`;
  ta.style.height = `${(rows.length + 2) * CH + 8}px`;
  sheetEl.hidden = true; handle.hidden = true;
  const done = (commit) => {
    if (commit && ta.value !== text) updateSheet(s.id, { items: itemsFrom(ta.value) });
    ta.remove(); render();
  };
  ta.addEventListener('blur', () => done(true));
  ta.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Escape') { ev.preventDefault(); done(false); }
    if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); ta.blur(); }
    if (ev.key === 'Tab') { ev.preventDefault(); ta.setRangeText('    ', ta.selectionStart, ta.selectionEnd, 'end'); }
  });
  world.append(ta);
  ta.focus();
});

// ---- keyboard + bars
const TOOL_KEYS = { 1: 'pen', 2: 'select', 3: 'box', 4: 'diamond', 5: 'ellipse', 6: 'arrow', 7: 'line', 8: 'text', 9: 'eraser',
  p: 'pen', v: 'select', h: 'hand', r: 'box', d: 'diamond', o: 'ellipse', a: 'arrow', l: 'line', t: 'text', e: 'eraser', k: 'ai' };
document.addEventListener('keydown', (e) => {
  if (e.target.closest?.('#editor, #textEdit, #aiBubble')) return;
  if (e.target.closest?.('#asciiPanel')) { if (e.key === 'Escape') toggleAscii(false); return; }
  if (e.key === 'Escape' && !panel.hidden) { toggleAscii(false); return; }
  if (e.code === 'Space') { e.preventDefault(); space = true; viewport.classList.add('grab'); return; }
  const mod = e.metaKey || e.ctrlKey;
  if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); removeSelected(); }
  else if (e.key === 'Escape') { select([]); setTool('select'); }
  else if (!mod && TOOL_KEYS[e.key]) setTool(TOOL_KEYS[e.key]);
  else if (!mod && e.key === 'q') $('#lock').click();
  else if (mod && e.code === 'KeyZ') { e.preventDefault(); undo(e.shiftKey); }
  else if (mod && e.code === 'KeyK') { e.preventDefault(); openAsk(); }
  else if (mod && e.key === '0') { e.preventDefault(); zoomAt(1, ...center()); apply(true); }
  else if (mod && !e.shiftKey && e.code === 'KeyA') { e.preventDefault(); selectAll(); }
  else if (mod && e.shiftKey && e.code === 'KeyC') { e.preventDefault(); copyJson(); }
  else if (mod && e.shiftKey && e.code === 'KeyP') { e.preventDefault(); copyPrompt(); }
});
document.addEventListener('keyup', (e) => { if (e.code === 'Space') { space = false; viewport.classList.remove('grab'); } });
document.querySelectorAll('[data-skin]').forEach((b) => { b.onclick = () => { state = { ...state, skin: b.dataset.skin }; save(); render(); }; });
$('#zoomIn').onclick = () => { zoomAt(scale * 1.25, ...center()); apply(true); };
$('#zoomOut').onclick = () => { zoomAt(scale * 0.8, ...center()); apply(true); };
$('#zoom').onclick = () => { zoomAt(1, ...center()); apply(true); };
$('#fit').onclick = fit;
$('#ask').onclick = openAsk;
$('#air').onclick = () => { state = { ...state, air: !state.air }; save(); render(); };
$('#ascii').onclick = () => toggleAscii();
function selectAll() { select(state.sheets.map((s) => ({ sheet: s.id, item: null }))); }
$('#selectAll').onclick = selectAll;

render();
fit();
