// tools/minimax-icons.mjs — does another model understand the `:name:` icon convention when told once?
import fs from 'node:fs';
import path from 'node:path';
import { read } from '../public/reader.js';

const KEY = fs.readFileSync('.env', 'utf8').match(/MINIMAX_API_KEY=(.*)/)[1].trim();
const MODEL = process.env.MODEL || 'MiniMax-M3';
const OUT = 'samples/minimax-icons';
fs.mkdirSync(OUT, { recursive: true });

const RULES = fs.readFileSync('public/PROMPT.md', 'utf8').replace(/\n\nSketch: .*$/s, '') + `
- Icons: write a Lucide icon name between colons. Inline: \`Settings [:settings:]\`. For a big icon, draw a box and put
  ONLY the token inside it — the box is the icon's size: 
  ┌──────────┐
  │ :rocket: │
  └──────────┘
  Use icons for nouns (rocket, database, user, globe, brain, cloud, bell, heart, star, planet, mountain). Never draw the
  object with characters when an icon name exists.`;

const PROMPTS = {
  dashboard: 'An analytics dashboard: sidebar with 5 nav items, header, 4 KPI cards each with an icon, a big chart area',
  launch: 'A landing page for a rocket delivery startup: hero with a large rocket illustration, three feature cards with icons, footer',
  solar: 'An explanatory diagram of the solar system: sun, 4 planets of increasing size, labels, orbit arrows',
  pipeline: 'A deployment pipeline diagram: code → build → test → deploy → monitor, each step a box with an icon, arrows between',
  profile: 'A mobile profile screen: avatar, name, stats row, settings list with icons, logout button',
};
const ask = (subject) => `${RULES}\n\nSketch: ${subject}. About 60-90 characters wide, up to 40 lines. Do not deliberate, draw immediately. Output ONLY the drawing in one \`\`\` code block.`;

async function call(subject) {
  const res = await fetch('https://api.minimax.io/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, temperature: 0.7, thinking: { type: 'disabled' }, messages: [{ role: 'user', content: ask(subject) }] }) });
  const json = await res.json();
  if (!res.ok || !json.choices) throw new Error(`${res.status} ${JSON.stringify(json).slice(0, 200)}`);
  return json.choices[0].message.content;
}
const extract = (s) => {
  const body = s.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^[\s\S]*<\/think>/, '');
  const blocks = [...body.matchAll(/```[^\n]*\n([\s\S]*?)(?:```|$)/g)].map((m) => m[1]);
  return (blocks.length ? blocks[blocks.length - 1] : body).replace(/\s+$/, '');
};

const lucide = new Set(Object.keys(await (await fetch('https://cdn.jsdelivr.net/npm/lucide-static/tags.json')).json()));
const report = [];
async function one([name, subject]) {
  try {
    const raw = await call(subject);
    fs.writeFileSync(path.join(OUT, `${name}.raw.txt`), raw);
    const text = extract(raw);
    fs.writeFileSync(path.join(OUT, `${name}.txt`), text);
    const tokens = [...text.matchAll(/:([a-z][a-z0-9-]*):/g)].map((m) => m[1]);
    const valid = tokens.filter((t) => lucide.has(t));
    // boxed = a token that is the only non-space content of a box interior row and the row above/below are box edges
    const rows = text.split('\n');
    const boxed = rows.filter((r, i) => /^\s*[│║|]\s*:[a-z0-9-]+:\s*[│║|]\s*$/.test(r) || (/:[a-z0-9-]+:/.test(r) && /^[\s│║|]*$/.test(r.replace(/:[a-z0-9-]+:/, '')) && /[┌╭╔+]/.test(rows[i - 1] || '') )).length;
    const { items } = read(text);
    report.push({ name, size: `${Math.max(...rows.map((r) => r.length))}x${rows.length}`, tokens: tokens.length, valid: valid.length, boxed, boxes: items.filter((i) => ['frame', 'box'].includes(i.type)).length, names: [...new Set(tokens)].slice(0, 8).join(' ') });
    console.log(`✔ ${name}: ${tokens.length} icons (${valid.length} valid lucide)`);
  } catch (e) { console.log(`✖ ${name}: ${e.message}`); }
}
const entries = Object.entries(PROMPTS);
for (let i = 0; i < entries.length; i += 2) await Promise.all(entries.slice(i, i + 2).map(one));
console.table(report);
fs.writeFileSync(path.join(OUT, '_report.json'), JSON.stringify(report, null, 2));
