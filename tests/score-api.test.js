import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SCORE_ENDPOINT,
  buildScorePayload,
  submitScore,
} from '../src/score-api.js';

test('buildScorePayload trims the name and preserves the final numeric score', () => {
  assert.deepEqual(buildScorePayload('  Ada Lovelace  ', 1270), {
    playerName: 'Ada Lovelace',
    score: 1270,
  });
});

test('buildScorePayload rejects blank names and invalid scores', () => {
  assert.throws(() => buildScorePayload('   ', 100), /player name/i);
  assert.throws(() => buildScorePayload('Ada', Number.NaN), /score/i);
  assert.throws(() => buildScorePayload('Ada', -1), /score/i);
});

test('submitScore sends the exact JSON contract and accepts a successful response', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return { ok: true, status: 201, json: async () => ({ accepted: true }) };
  };
  const result = await submitScore({ playerName: '  Grace  ', score: 450 }, fetchImpl);
  assert.equal(request.url, SCORE_ENDPOINT);
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(request.options.body), {
    playerName: 'Grace',
    score: 450,
  });
  assert.deepEqual(result, { accepted: true });
});

test('submitScore reports non-success responses', async () => {
  const fetchImpl = async () => ({ ok: false, status: 400, text: async () => 'Invalid score' });
  await assert.rejects(() => submitScore({ playerName: 'Grace', score: 10 }, fetchImpl), /400.*Invalid score/);
});
