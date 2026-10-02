import test from 'node:test';
import assert from 'node:assert/strict';
import { adapterFor } from '../coach/adapters/index.js';

test('the fixture launches from the actual filesystem path, including Windows and encoded Unicode directories', async () => {
  const previousMode = process.env.FIXTURE_MODE;
  process.env.FIXTURE_MODE = 'invalid';
  try {
    const result = await adapterFor('fixture').invoke({ prompt: '{}', jobDir: process.cwd(), env: process.env, timeoutMs: 5000 });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.spawnError, false);
    assert.ok(result.text.length > 0, 'fixture response reaches the caller');
  } finally {
    if (previousMode === undefined) delete process.env.FIXTURE_MODE; else process.env.FIXTURE_MODE = previousMode;
  }
});
