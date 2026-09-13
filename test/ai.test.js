import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawing } from '../public/ai.js';

test('ai: the drawing is the fenced block, complete lines only while streaming', () => {
  assert.equal(drawing('<think>hmm', false), '');
  assert.equal(drawing('Sure:\n```\n┌──┐\n│  │\n└─', false), '┌──┐\n│  │');
  assert.equal(drawing('Sure:\n```\n┌──┐\n│  │\n└─', true), '┌──┐\n│  │\n└─');
  assert.equal(drawing('```text\n┌──┐\n└──┘\n```\nDone.', false), '┌──┐\n└──┘');
  assert.equal(drawing('<think>a\nb</think>\n```\nhi\n', false), 'hi');
  assert.equal(drawing('plain answer\nline 2', false), '');
  assert.equal(drawing('plain answer\nline 2', true), 'plain answer\nline 2');
});
