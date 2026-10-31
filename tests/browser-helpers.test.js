import test from 'node:test';
import assert from 'node:assert/strict';

import { unlockAudioSafely } from '../src/audio.js';
import { projectSprite, visibleDepthColumns } from '../src/renderer.js';

test('audio initialization failures degrade silently', async () => {
  const audio = { enabled: true, unlock: async () => { throw new Error('blocked'); } };
  assert.equal(await unlockAudioSafely(audio), false);
  assert.equal(audio.enabled, false);
});

test('sprite occlusion compares camera depth and retains visible edge columns', () => {
  const projection = projectSprite({ x: 1.5, y: 1.5, angle: -0.5 }, 7.5, 1.5, 1000, 600);
  assert.ok(Math.abs(projection.cameraDepth - (6 * Math.cos(0.5))) < 0.001);
  const depth = new Array(100).fill(projection.cameraDepth + 0.1);
  depth[55] = projection.cameraDepth - 0.1;
  const visible = visibleDepthColumns(projection, depth, 1000, 0.05);
  assert.ok(visible.length > 0);
  assert.equal(visible.includes(55), false);
});
