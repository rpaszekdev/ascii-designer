import { test } from 'node:test';
import assert from 'node:assert/strict';
import { breathe, cells } from '../public/layout.js';
import { print } from '../public/printer.js';
import { read } from '../public/reader.js';

const at = (items, id) => items.find((i) => i.id === id);

test('air: a shared side becomes two borders with a gap; content keeps its offset in its box', () => {
  const items = [{ id: 'a', type: 'box', x: 0, y: 0, w: 10, h: 3 }, { id: 'b', type: 'box', x: 9, y: 0, w: 11, h: 3 }, { id: 't', type: 'text', x: 11, y: 1, w: 2, h: 1, text: 'hi' }];
  const out = breathe(items);
  assert.deepEqual([at(out, 'a').x, at(out, 'a').w], [0, 10]);
  assert.deepEqual([at(out, 'b').x, at(out, 'b').w], [11, 11]);
  assert.equal(at(out, 't').x - at(out, 'b').x, 2);
  assert.equal(print(out).split('\n')[0], '┌────────┐ ┌─────────┐');
  assert.equal(read(print(out)).items.filter((i) => i.type !== 'text').length, 2);
  const c = cells(items);
  assert.equal(c.x(11), 13); assert.equal(c.col(13), 11); assert.equal(c.col(10), 9);
});

test('air: a child on its parent border moves inside; parent grows to fit', () => {
  const items = [{ id: 'p', type: 'frame', x: 0, y: 0, w: 20, h: 10 }, { id: 'c', type: 'box', x: 0, y: 0, w: 8, h: 10 }];
  const out = breathe(items);
  assert.deepEqual([at(out, 'c').x, at(out, 'c').y, at(out, 'c').w, at(out, 'c').h], [2, 2, 8, 10]);
  assert.deepEqual([at(out, 'p').x, at(out, 'p').y, at(out, 'p').w, at(out, 'p').h], [0, 0, 22, 14]);
});
