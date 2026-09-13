// tools/minimax.mjs — ask MiniMax for ASCII drawings, save them, and judge them with our reader.
// usage: node tools/minimax.mjs [promptsFile.json]   (key from .env: MINIMAX_API_KEY)
import fs from 'node:fs';
import path from 'node:path';
import { read } from '../public/reader.js';

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]));
const KEY = env.MINIMAX_API_KEY;
if (!KEY) throw new Error('MINIMAX_API_KEY missing in .env');
const MODEL = process.env.MODEL || 'MiniMax-M3';
const PARALLEL = 3;
const OUT = 'samples/minimax';

const DEFAULT_PROMPTS = {
  dragon: 'A dragon eating a spaceship above a city skyline at night',
  heart: 'Cross-section of a human heart with labeled chambers and arrows showing blood flow',
  solar: 'The solar system with orbits, planets of different sizes and a comet with a tail',
  cats: 'A mind map explaining why cats knock things off tables',
  steampunk: 'A steampunk machine with gears, pipes, valves and pressure gauges, labeled',
  water: 'The water cycle: sun, clouds, rain, mountains, river, ocean, evaporation arrows',
  nn: 'A neural network with input, hidden and output layers, weights drawn as connections',
  treasure: 'A pirate treasure map with islands, a compass rose, a dotted path and an X',
  onboarding: 'Three mobile app onboarding screens side by side with arrows between them',
  dna: 'A DNA double helix next to a cell with labeled organelles',
};
const prompts = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : DEFAULT_PROMPTS;
const ask = (subject) => `Draw this as an ASCII drawing: ${subject}.\nAbout 60-90 characters wide and up to 40 lines. Use whatever characters you like (box-drawing, arrows, slashes, unicode). Do not deliberate or verify line lengths, draw immediately. Output ONLY the drawing inside one \`\`\` code block, no explanation.`;

async function call(subject) {
  const body = { model: MODEL, messages: [{ role: 'user', content: ask(subject) }], max_tokens: 4000, temperature: 0.9, thinking: { type: 'disabled' } };
  const res = await fetch('https://api.minimax.io/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok || !json.choices) throw new Error(`${res.status} ${JSON.stringify(json).slice(0, 300)}`);
  return json.choices[0].message.content;
}
const extract = (s) => {
  const body = s.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^[\s\S]*<\/think>/, '');
  const blocks = [...body.matchAll(/```[^\n]*\n([\s\S]*?)(?:```|$)/g)].map((m) => m[1]);
  return (blocks.length ? blocks[blocks.length - 1] : body).replace(/\s+$/, '');
};

// glyph census by class
const CLASSES = {
  boxSingle: /[─│┌┐└┘├┤┬┴┼]/u, boxRounded: /[╭╮╰╯]/u, boxDouble: /[═║╔╗╚╝╠╣╦╩╬]/u, boxHeavy: /[━┃┏┓┗┛┣┫┳┻╋]/u,
  asciiBox: /[+|]|-(?=-)/, arrowsUni: /[→←↑↓↔↕⇒⇐⇑⇓►◄▲▼▶◀↗↖↘↙]/u, arrowsAscii: /^(>|<|\^|v)$/,
  diagonals: /[╱╲\/\\]/u, waves: /[~∿≈]/u, fills: /[█▓▒░▪▫■□]/u, glyphs: /[●○◉◎◆◇★☆✦✧•·⊙◯]/u, wideEmoji: /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u,
};
function census(text) {
  const counts = Object.fromEntries(Object.keys(CLASSES).map((k) => [k, 0]));
  let nonSpace = 0;
  for (const c of text) { if (!c.trim()) continue; nonSpace++; for (const [k, re] of Object.entries(CLASSES)) if (re.test(c)) { counts[k]++; break; } }
  return { nonSpace, ...counts };
}
// how much of the drawing our reader turned into components, by type
function judge(text) {
  const { w, h, items } = read(text);
  const cells = Object.create(null);
  const cover = Object.create(null);
  items.forEach((i) => {
    const n = ['frame', 'box', 'img'].includes(i.type) && i.h > 1 ? 2 * i.w + 2 * (i.h - 2) : i.w * i.h;
    cover[i.type] = (cover[i.type] || 0) + n;
  });
  const total = Object.values(cover).reduce((a, b) => a + b, 0);
  const byType = {}; items.forEach((i) => { byType[i.type] = (byType[i.type] || 0) + 1; });
  return { w, h, items: items.length, boxes: items.filter((i) => ['frame', 'box'].includes(i.type)).length, cover, total, byType };
}

const items = (j, t) => j.byType[t] || 0;
const report = [];
async function one([name, subject]) {
  try {
    const raw = await call(subject);
    fs.writeFileSync(path.join(OUT, `${name}.raw.txt`), raw);
    const text = extract(raw);
    fs.writeFileSync(path.join(OUT, `${name}.txt`), text);
    const c = census(text), j = judge(text);
    const pct = (k) => `${Math.round(((j.cover[k] || 0) / Math.max(1, j.total)) * 100)}%`;
    const strokes = Math.round(((c.diagonals + c.waves + c.fills) / Math.max(1, c.nonSpace)) * 100);
    report.push({ name, size: `${j.w}x${j.h}`, chars: c.nonSpace, boxes: j.boxes, arrows: items(j, 'arrow'), widgets: items(j, 'btn') + items(j, 'input') + items(j, 'check') + items(j, 'radio'), text: pct('text'), unknown: pct('unknown'), 'strokes%': `${strokes}%`, top: Object.entries(c).filter(([k]) => k !== 'nonSpace').sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}:${v}`).join(' ') });
    console.log(`✔ ${name} ${j.w}x${j.h}`);
  } catch (e) { console.log(`✖ ${name}: ${e.message}`); }
}
const entries = Object.entries(prompts);
for (let i = 0; i < entries.length; i += PARALLEL) await Promise.all(entries.slice(i, i + PARALLEL).map(one));
report.sort((a, b) => a.name.localeCompare(b.name));
console.table(report);
fs.writeFileSync(path.join(OUT, '_report.json'), JSON.stringify(report, null, 2));
