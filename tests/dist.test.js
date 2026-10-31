import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expected = [
  'index.html',
  'src/audio.js',
  'src/input.js',
  'src/main.js',
  'src/renderer.js',
  'src/score-api.js',
  'src/simulation.js',
  'styles.css',
  'vercel.json',
];

async function filesWithin(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await filesWithin(path.join(directory, entry.name), relative));
    else files.push(relative);
  }
  return files.sort();
}

function build() {
  execFileSync(process.execPath, ['scripts/build-dist.mjs'], { cwd: root, stdio: 'pipe' });
}

test('distribution builder is idempotent and removes stale files', async () => {
  build();
  await writeFile(path.join(root, 'dist', 'stale.tmp'), 'stale');
  build();
  assert.deepEqual(await filesWithin(path.join(root, 'dist')), expected);
});

test('distributed runtime files exactly match their sources', async () => {
  build();
  for (const relative of expected.filter((file) => file !== 'vercel.json')) {
    const source = await readFile(path.join(root, relative));
    const distributed = await readFile(path.join(root, 'dist', relative));
    assert.deepEqual(distributed, source, `${relative} differs from its source`);
  }
  const config = JSON.parse(await readFile(path.join(root, 'dist', 'vercel.json'), 'utf8'));
  assert.equal(config.outputDirectory, '.');
  assert.equal(config.cleanUrls, true);
});
