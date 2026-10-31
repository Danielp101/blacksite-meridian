import test from 'node:test';
import assert from 'node:assert/strict';

import { keyboardTurn } from '../src/input.js';

test('keyboardTurn provides pointer-lock-free left and right look controls', () => {
  assert.equal(keyboardTurn(new Set(['ArrowLeft']), 0.5), -0.9);
  assert.equal(keyboardTurn(new Set(['ArrowRight']), 0.5), 0.9);
  assert.equal(keyboardTurn(new Set(['ArrowLeft', 'ArrowRight']), 0.5), 0);
  assert.equal(keyboardTurn(new Set(), 0.5), 0);
});
