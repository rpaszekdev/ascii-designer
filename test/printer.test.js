import { test } from 'node:test';
import assert from 'node:assert/strict';
import { read } from '../public/reader.js';
import { print } from '../public/printer.js';

const shape = (items) => items.map((i) => [i.type, i.x, i.y, i.w, i.h, i.text || i.title || '']).sort();

test('printer: regions print with junctions and read back identically', () => {
  const items = [
    { type: 'frame', x: 0, y: 0, w: 30, h: 9 },
    { type: 'box', x: 0, y: 0, w: 30, h: 3 },
    { type: 'box', x: 0, y: 2, w: 10, h: 7 },
    { type: 'box', x: 9, y: 2, w: 21, h: 7 },
    { type: 'btn', x: 12, y: 4, w: 11, h: 1, text: 'Go' },
    { type: 'text', x: 2, y: 1, w: 4, h: 1, text: 'Acme' },
    { type: 'text', x: 2, y: 4, w: 6, h: 1, text: '👤 Bob' },
  ];
  const ascii = print(items);
  const rows = ascii.split('\n');
  assert.equal(rows[0], '┌────────────────────────────┐');
  assert.equal(rows[2], '├────────┬───────────────────┤');
  assert.equal(rows[8], '└────────┴───────────────────┘');
  assert.ok(rows[4].includes('[   Go    ]') && rows[4].includes('👤 Bob'), rows[4]);
  const back = read(ascii).items;
  assert.deepEqual(shape(back.filter((i) => i.type !== 'text')), shape(items.filter((i) => i.type !== 'text')));
  assert.deepEqual(back.filter((i) => i.type === 'text').map((t) => t.text).sort(), ['Acme', '👤 Bob']);
});

test('printer: every leaf idiom survives a round trip', () => {
  const items = [
    { type: 'input', x: 0, y: 0, w: 12, h: 1, text: 'email' }, { type: 'select', x: 14, y: 0, w: 11, h: 1, text: 'Photo' },
    { type: 'check', x: 0, y: 2, w: 3, h: 1, checked: true }, { type: 'radio', x: 5, y: 2, w: 3, h: 1, checked: false },
    { type: 'link', x: 0, y: 4, w: 10, h: 1, text: 'Demo' }, { type: 'h', x: 0, y: 6, w: 8, h: 1, level: 2, text: 'Title' },
    { type: 'divider', x: 0, y: 8, w: 10, h: 1 }, { type: 'arrow', x: 0, y: 10, w: 6, h: 1, dir: 'right' },
    { type: 'img', x: 0, y: 12, w: 10, h: 4 },
  ];
  const back = read(print(items)).items;
  assert.deepEqual(back.map((i) => i.type).sort(), items.map((i) => i.type).sort());
  assert.equal(back.find((i) => i.type === 'input').text, 'email');
  assert.equal(back.find((i) => i.type === 'check').checked, true);
  assert.equal(back.find((i) => i.type === 'h').level, 2);
});

test('printer: drawn ellipses and any-direction arrows rasterise', () => {
  const rows = print([{ type: 'ellipse', x: 0, y: 0, w: 10, h: 4 }, { type: 'arrow', x: 12, y: 0, w: 5, h: 3, from: 'tl' }, { type: 'arrow', x: 18, y: 0, w: 1, h: 3, from: 'bl' }]).split('\n');
  assert.match(rows[0], /╭─+╮/);
  assert.match(rows[3], /╰─+╯/);
  assert.ok(/[╱│]/.test(rows[1][rows[1].indexOf('╭') - 1] || '') || rows[1].includes('╱') || rows[1].includes('│'), rows[1]);
  assert.equal(rows[0][12], '╲');
  assert.equal(rows[2][16], '►');
  assert.equal(rows[0][18], '▲');
  assert.equal(rows[1][18], '│');
  const hz = print([{ type: 'arrow', x: 0, y: 0, w: 6, h: 1, dir: 'left' }]);
  assert.equal(hz, '◄─────');
});

test('printer: icons round-trip inline and boxed', () => {
  const items = [
    { type: 'icon', name: 'user', x: 0, y: 0, w: 8, h: 1 },
    { type: 'icon', name: 'rocket', x: 0, y: 2, w: 12, h: 4 },
  ];
  const ascii = print(items);
  assert.equal(ascii.split('\n')[0], '[:user:]');
  assert.equal(ascii.split('\n')[4], '│ :rocket: │');
  const back = read(ascii).items;
  assert.deepEqual(shape(back), shape(items));
  assert.deepEqual(back.map((i) => i.name).sort(), ['rocket', 'user']);
});

test('printer: lines have no head, diamonds are two slopes per row', () => {
  assert.equal(print([{ type: 'line', x: 0, y: 0, w: 5, h: 1, from: 'tl' }]), '─────');
  assert.equal(print([{ type: 'arrow', x: 0, y: 0, w: 5, h: 1, from: 'tl' }]), '────►');
  assert.equal(print([{ type: 'line', x: 0, y: 0, w: 3, h: 3, from: 'tl' }]), '╲\n ╲\n  ╲');
  assert.equal(print([{ type: 'diamond', x: 0, y: 0, w: 6, h: 4 }]), '  ╱╲\n ╱  ╲\n ╲  ╱\n  ╲╱');
});

test('printer: a pen stroke prints as direction glyphs along its points', () => {
  const pen = { type: 'pen', x: 0, y: 0, w: 6, h: 3, pts: [[0, 0], [5, 0], [5, 2], [3, 2]] };
  assert.equal(print([pen]), '──────\n     │\n   ──│');
  assert.equal(print([{ type: 'pen', x: 0, y: 0, w: 3, h: 3, pts: [[0.2, 0.1], [2.4, 2.3]] }]), '╲\n ╲\n  ╲');
});
