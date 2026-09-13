import { test } from 'node:test';
import assert from 'node:assert/strict';
import { read } from '../public/reader.js';

const by = (items, type) => items.filter((i) => i.type === type);
const wrap = (lines, w) => ['┌' + '─'.repeat(w) + '┐', ...lines.map((l) => '│' + l.padEnd(w) + '│'), '└' + '─'.repeat(w) + '┘'].join('\n');

// the user's ChatGPT sketch, verbatim — ragged right side on some rows, wide chars, junctions
const CHATGPT = `╭──────────────────────────────────────────────────────────────────────────────╮
│  ◉ ChatGPT                                      New chat   ⋯   ⚙              │
├───────────────────────┬──────────────────────────────────────────────────────┤
│                       │                                                      │
│  ＋ New chat           │                    ChatGPT                          │
│                       │                                                      │
│  ▸ Today              │       ┌───────────────────────────────────┐          │
│    Website design     │       │  What can I help you with?       │          │
│    Python help        │       └───────────────────────────────────┘          │
│    Trip planning      │                                                      │
│                       │       ┌──────────────┐ ┌──────────────┐              │
│  ▸ Yesterday          │       │ ✦ Write       │ │ ◇ Analyze    │              │
│    Ideas              │       │   something   │ │   data       │              │
│    Questions          │       └──────────────┘ └──────────────┘              │
│                       │                                                      │
│                       │       ┌──────────────┐ ┌──────────────┐              │
│  ─────────────────    │       │ ▣ Create      │ │ ◎ Brainstorm  │              │
│  👤 User              │       │   an image    │ │   ideas       │              │
│                       │       └──────────────┘ └──────────────┘              │
│  ⚙ Settings           │                                                      │
│  ? Help                │                                                      │
│                       │                                                      │
│                       │                                                      │
│                       │                                                      │
│                       │                                                      │
│                       │       ┌───────────────────────────────────────┐      │
│                       │       │ Message ChatGPT...                 ↑  │      │
│                       │       └───────────────────────────────────────┘      │
│                       │                                                      │
│                       │          ChatGPT can make mistakes. Check important │
│                       │          information.                                │
╰───────────────────────┴──────────────────────────────────────────────────────╯`;

test('reader: junction regions + tolerant sides on the ChatGPT sketch', () => {
  const { items } = read(CHATGPT);
  const frames = by(items, 'frame'), boxes = by(items, 'box');
  assert.equal(frames.length, 1);
  assert.equal(frames[0].role, 'page');
  assert.deepEqual([frames[0].x, frames[0].y, frames[0].w, frames[0].h], [0, 0, 80, 32]);
  const regions = boxes.filter((b) => b.parent === items.indexOf(frames[0]));
  assert.deepEqual(regions.map((b) => [b.role, b.x, b.y, b.w, b.h]).sort(), [['main', 24, 2, 56, 30], ['nav', 0, 0, 80, 3], ['sidebar', 0, 2, 25, 30]]);
  const main = regions.find((b) => b.x === 24);
  const inMain = boxes.filter((b) => b.parent === items.indexOf(main));
  assert.equal(inMain.length, 6);
  assert.equal(inMain.filter((b) => b.role === 'tile').length, 4);
  const texts = by(items, 'text').map((t) => t.text);
  assert.ok(texts.includes('👤 User') && texts.includes('＋ New chat') && texts.includes('? Help'), texts.join('|'));
  assert.equal(by(items, 'unknown').length, 0);
  assert.equal(by(items, 'divider').length, 1);
  const user = by(items, 'text').find((t) => t.text === '👤 User');
  assert.equal(user.w, 7); // 👤 takes two cells + space + User
});

test('reader: a stacked box is not swallowed by the one above', () => {
  const { items } = read(wrap(['a'], 6) + '\n\n' + wrap(['b'], 6));
  assert.equal(by(items, 'frame').length, 2);
});

test('reader: a broken side row and a widened row still make one box', () => {
  const src = ['┌──────────┐', '│ ragged   │', '│ side      │', '  gap      │', '│ ok       │', '└──────────┘'].join('\n');
  const { items } = read(src);
  assert.equal(by(items, 'frame').length, 1);
  assert.deepEqual(by(items, 'text').map((t) => t.text), ['ragged', 'side', 'gap', 'ok']);
});

test('reader: idioms, nested boxes, image box, titles', () => {
  const S = wrap([
    ' ◉ Acme     Home   Pricing   [ Sign up ] ',
    '  # Design in text.                      ',
    '  [ Get started ]   < Watch demo >       ',
    '  ┌── Fast ──────┐  ┌──────────────┐     ',
    '  │ Paste, done. │  │ ## Diffable  │     ',
    '  └──────────────┘  └──────────────┘     ',
    '  [email_____________]  [ Subscribe ]    ',
    '  [x] Send me updates   ( ) Weekly       ',
    '  ┌────────┐   ¯\\_(ツ)_/¯   ──► next      ',
    '  │ ╲    ╱ │                             ',
    '  │  ╲  ╱  │   [ Photo ▾ ]               ',
    '  └────────┘                             ',
  ], 41);
  const { items } = read(S);
  assert.equal(by(items, 'frame').length, 1);
  assert.deepEqual(by(items, 'box').map((b) => b.title || ''), ['Fast', '']);
  assert.equal(by(items, 'img').length, 1);
  assert.deepEqual(by(items, 'btn').map((b) => b.text), ['Sign up', 'Get started', 'Subscribe']);
  assert.deepEqual(by(items, 'input').map((b) => b.text), ['email']);
  assert.deepEqual(by(items, 'check').map((b) => b.checked), [true]);
  assert.deepEqual(by(items, 'select').map((b) => b.text), ['Photo']);
  assert.deepEqual(by(items, 'h').map((b) => [b.level, b.text]), [[1, 'Design in text.'], [2, 'Diffable']]);
  assert.deepEqual(by(items, 'unknown').map((u) => u.text), ['¯\\_(ツ)_/¯']);
  const diffable = by(items, 'h').find((x) => x.text === 'Diffable');
  assert.equal(items[diffable.parent].type, 'box');
});

test('reader: plus boxes, indent/blank-line normalisation, roles', () => {
  const { w, h, items } = read('\n\n    +------+\n    | Hi   |\n    +------+\n');
  assert.deepEqual([w, h], [8, 3]);
  assert.equal(items[0].type, 'frame');
  const page = read(wrap(['┌────────────────────────────────┐', '│ logo   Home   [ Go ]           │', '└────────────────────────────────┘', '', '┌────┐  ┌────┐', '│ a  │  │ b  │', '│    │  │    │', '└────┘  └────┘', '', '┌────────────────────────────────┐', '│ © 2026                         │', '└────────────────────────────────┘'], 36));
  assert.deepEqual(page.items.filter((i) => i.role).map((i) => i.role), ['page', 'nav', 'footer', 'tile', 'tile']);
});

test('reader: icon tokens inline, sloppy, and boxed (box = icon size)', () => {
  const { items } = read(`┌──────────────────┐
│ [:user:]  :zap:  │
│   ┌──────────┐   │
│   │ :rocket: │   │
│   │          │   │
│   └──────────┘   │
│ [:bell] [ Go ]   │
└──────────────────┘`);
  const icons = items.filter((i) => i.type === 'icon').map((i) => [i.name, i.x, i.y, i.w, i.h]).sort();
  assert.deepEqual(icons, [['bell', 2, 6, 7, 1], ['rocket', 4, 2, 12, 4], ['user', 2, 1, 8, 1], ['zap', 12, 1, 5, 1]]);
  assert.equal(items.filter((i) => i.type === 'box' || i.type === 'frame').length, 1);
  assert.ok(items.some((i) => i.type === 'btn' && i.text === 'Go'));
});
