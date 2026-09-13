// tools/census.mjs — aggregate what the drawings in samples/**/ are made of, and what our reader leaves unnamed.
import fs from 'node:fs';
import path from 'node:path';
import { read } from '../public/reader.js';

const dir = process.argv[2] || 'samples/minimax';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.txt') && !f.endsWith('.raw.txt'));
const glyphs = new Map(), leftovers = new Map(), byType = new Map();
let cells = 0;
const shape = (s) => s.replace(/[\p{L}\p{N}]+/gu, 'a').replace(/(.)\1{2,}/gu, '$1$1$1'); // letters/digits → a, runs → 3
for (const f of files) {
  const text = fs.readFileSync(path.join(dir, f), 'utf8');
  for (const c of text) if (c.trim() && !/[\p{L}\p{N}]/u.test(c)) glyphs.set(c, (glyphs.get(c) || 0) + 1);
  const { items } = read(text);
  items.forEach((i) => { byType.set(i.type, (byType.get(i.type) || 0) + 1); cells += i.w * i.h; });
  items.filter((i) => i.type === 'unknown' || (i.type === 'text' && !/[\p{L}\p{N}]/u.test(i.text))).forEach((i) => {
    const k = shape(i.text); leftovers.set(k, (leftovers.get(k) || 0) + 1);
  });
}
const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
console.log(`${files.length} drawings\n\nitems by type:`, Object.fromEntries(top(byType, 20)));
console.log('\nmost used non-letter glyphs:');
console.log(top(glyphs, 40).map(([c, n]) => `${JSON.stringify(c)}:${n}`).join('  '));
console.log('\nunnamed leftovers (shape → count):');
top(leftovers, 30).forEach(([k, n]) => console.log(String(n).padStart(4), k));
