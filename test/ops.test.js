import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOps } from '../public/ops.js';

const at = (items, id) => items.find((i) => i.id === id);
const items = [
  { id: 'p', type: 'box', x: 0, y: 0, w: 10, h: 4, parent: null, sheet: 's' },
  { id: 'c', type: 'btn', x: 2, y: 1, w: 6, h: 1, parent: 'p', sheet: 's', text: 'Go' },
  { id: 'q', type: 'box', x: 15, y: 3, w: 8, h: 3, parent: null, sheet: 's' },
  { id: 'r', type: 'box', x: 30, y: 0, w: 12, h: 3, parent: null, sheet: 's' },
];

test('ops: row/column/grid place roots in order, children follow their parent', () => {
  const row = applyOps(items, [{ op: 'row', ids: ['p', 'q', 'r'], gap: 2 }]);
  assert.deepEqual([at(row, 'p').x, at(row, 'q').x, at(row, 'r').x], [0, 12, 22]);
  assert.deepEqual([at(row, 'q').y, at(row, 'r').y, at(row, 'c').x], [0, 0, 2]);
  const col = applyOps(items, [{ op: 'column', ids: ['p', 'q'], gap: 1 }]);
  assert.deepEqual([at(col, 'q').x, at(col, 'q').y], [0, 5]);
  const g = applyOps(items, [{ op: 'grid', ids: ['p', 'q', 'r'], cols: 2, gap: 1 }]);
  assert.deepEqual([[at(g, 'p').x, at(g, 'p').y], [at(g, 'q').x, at(g, 'q').y], [at(g, 'r').x, at(g, 'r').y]], [[0, 0], [13, 0], [0, 5]]);
});

test('ops: align, equalize, move (children too), delete (children too), text, wrap', () => {
  const a = applyOps(items, [{ op: 'align', ids: ['p', 'q'], edge: 'right' }]);
  assert.equal(at(a, 'p').x + at(a, 'p').w, 23);
  assert.equal(at(a, 'c').x, 15);
  assert.equal(at(applyOps(items, [{ op: 'equalize', ids: ['p', 'q'], prop: 'w' }]), 'q').w, 10);
  const m = applyOps(items, [{ op: 'move', id: 'p', x: 5, y: 5 }]);
  assert.deepEqual([at(m, 'c').x, at(m, 'c').y], [7, 6]);
  assert.equal(applyOps(items, [{ op: 'delete', id: 'p' }]).length, 2);
  assert.equal(at(applyOps(items, [{ op: 'text', id: 'c', text: 'Continue' }]), 'c').w, 12);
  const w = applyOps(items, [{ op: 'wrap', ids: ['q', 'r'], title: 'Pair', newId: 'box' }]);
  assert.deepEqual([at(w, 'box').x, at(w, 'box').y, at(w, 'box').w, at(w, 'box').h, at(w, 'q').parent], [13, -1, 31, 8, 'box']);
  assert.equal(applyOps(items, [{ op: 'nope' }, null, { op: 'move', id: 'zz', x: 1 }]).length, 4);
});
