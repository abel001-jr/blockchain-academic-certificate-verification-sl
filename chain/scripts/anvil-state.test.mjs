import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { prepareState, promoteCheckpoint } from './anvil-state.mjs';

test('partial writes preserve the checkpoint and corrupt checkpoints recover from backup', () => {
  const folder = mkdtempSync(join(tmpdir(), 'credence-checkpoint-'));
  const file = join(folder, 'state.json');
  const original = JSON.stringify({ accounts: {}, block: 1 });
  try {
    writeFileSync(file, original);
    writeFileSync(`${file}.pending`, '{"accounts":');
    assert.equal(promoteCheckpoint(file), false);
    assert.equal(readFileSync(file, 'utf8'), original);
    writeFileSync(`${file}.pending`, JSON.stringify({ accounts: {}, block: 2 }));
    assert.equal(promoteCheckpoint(file), true);
    assert.equal(readFileSync(`${file}.bak`, 'utf8'), original);
    writeFileSync(file, '{');
    writeFileSync(`${file}.pending`, '{');
    prepareState(file);
    assert.equal(readFileSync(file, 'utf8'), original);
    writeFileSync(`${file}.bak`, '{');
    writeFileSync(file, '{');
    assert.throws(() => prepareState(file), /damaged file has been preserved/);
    assert.equal(readFileSync(file, 'utf8'), '{');
  } finally {
    assert.ok(resolve(folder).startsWith(resolve(tmpdir()) + sep));
    rmSync(folder, { recursive: true, force: true });
  }
});
