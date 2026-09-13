// render.js — a sheet's items (cells) → absolutely positioned DOM. Skins paint; this only places.
export const CW = 8;
export const CH = 18;
const TAG = { btn: 'button', input: 'input', select: 'select', link: 'a', text: 'span', unknown: 'span' };

// svg for an arrow between two opposite corners of a w×h cell box (also used for the drawing preview)
export function arrowSvg(w, h, from, head = true) {
  const W = w * CW, H = h * CH;
  const c = { tl: [CW / 2, CH / 2], tr: [W - CW / 2, CH / 2], bl: [CW / 2, H - CH / 2], br: [W - CW / 2, H - CH / 2] };
  const opp = { tl: 'br', tr: 'bl', bl: 'tr', br: 'tl' };
  const [ax, ay] = c[from], [bx, by] = c[opp[from]];
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs><line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="currentColor" stroke-width="2"${head ? ' marker-end="url(#ah)"' : ''}/></svg>`;
}
export function penSvg(it) {
  const pts = (it.pts || []).map(([x, y]) => `${(x * CW).toFixed(1)},${(y * CH).toFixed(1)}`).join(' ');
  return `<svg width="${it.w * CW}" height="${it.h * CH}"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
export function diamondSvg(w, h) {
  const W = w * CW, H = h * CH;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><polygon points="${W / 2},1 ${W - 1},${H / 2} ${W / 2},${H - 1} 1,${H / 2}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
}

const ICONS = new Map();
// ponytail: Lucide straight from the CDN, one fetch per name; unknown, offline or unsafe name → null and the token stays as grey text
export function lucide(name) {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) return Promise.resolve(null);
  if (!ICONS.has(name)) ICONS.set(name, fetch(`https://cdn.jsdelivr.net/npm/lucide-static/icons/${name}.svg`).then((r) => (r.ok ? r.text() : null)).catch(() => null));
  return ICONS.get(name);
}

export const dims = (items) => ({ w: Math.max(0, ...items.map((i) => i.x + i.w)), h: Math.max(0, ...items.map((i) => i.y + i.h)) });

export function renderSheet(sheet) {
  const { w, h } = dims(sheet.items);
  const el = document.createElement('div');
  el.className = 'sheet';
  el.dataset.id = sheet.id;
  el.style.left = `${sheet.x}px`; el.style.top = `${sheet.y}px`;
  el.style.width = `${w * CW}px`; el.style.height = `${h * CH}px`;
  sheet.items.forEach((it) => el.append(item(it)));
  return el;
}

function item(it) {
  const e = document.createElement(it.type === 'h' ? `h${it.level}` : TAG[it.type] || 'div');
  e.className = `item ${it.type}${it.dir ? ` ${it.dir}` : ''}${it.role ? ` role-${it.role}` : ''}`;
  e.dataset.id = it.id;
  e.dataset.type = it.type;
  Object.assign(e.style, { left: `${it.x * CW}px`, top: `${it.y * CH}px`, width: `${it.w * CW}px`, height: `${it.h * CH}px` });
  switch (it.type) {
    case 'frame': case 'box': if (it.title) e.append(span('title', it.title)); break;
    case 'img': if (it.text) e.append(span('label', it.text)); break;
    case 'check': case 'radio': {
      const i = document.createElement('input');
      i.type = it.type === 'check' ? 'checkbox' : 'radio';
      i.checked = Boolean(it.checked); i.tabIndex = -1;
      e.append(i); break;
    }
    case 'input': e.placeholder = it.text || ''; e.readOnly = true; e.tabIndex = -1; break;
    case 'select': { const o = document.createElement('option'); o.textContent = it.text || ''; e.append(o); e.tabIndex = -1; break; }
    case 'arrow': case 'line': e.innerHTML = arrowSvg(it.w, it.h, it.from || (it.dir === 'left' ? 'tr' : 'tl'), it.type === 'arrow'); break;
    case 'diamond': e.innerHTML = diamondSvg(it.w, it.h); break;
    case 'pen': e.innerHTML = penSvg(it); break;
    case 'ellipse': case 'divider': break;
    case 'icon':
      e.dataset.name = it.name; e.textContent = `:${it.name}:`; e.classList.add('missing');
      lucide(it.name).then((svg) => { if (svg) { e.classList.remove('missing'); e.innerHTML = svg; } });
      break;
    default: e.textContent = it.text || '';
  }
  if (it.type === 'link') e.href = '#';
  if (it.type === 'btn') e.type = 'button';
  return e;
}

function span(cls, text) { const s = document.createElement('span'); s.className = cls; s.textContent = text; return s; }
