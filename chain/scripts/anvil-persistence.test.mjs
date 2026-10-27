import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { anvilExecutable, anvilArguments } from './anvil-config.mjs';
import { promoteCheckpoint } from './anvil-state.mjs';

test('Anvil restores deployed contract storage and account nonce', { timeout: 30000 }, async () => {
  const folder = await mkdtemp(join(tmpdir(), 'credence-anvil-test-'));
  const file = join(folder, 'state.json');
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  let child;
  const rpc = async (method, params = []) => {
    const response = await fetch(`http://127.0.0.1:${port}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(2000),
    });
    const body = await response.json();
    if (body.error) throw new Error(JSON.stringify(body.error));
    return body.result;
  };
  const start = async () => {
    child = spawn(anvilExecutable(), anvilArguments({ file, port, interval: 1 }), { stdio: 'ignore', windowsHide: true });
    let failure;
    child.on('error', error => { failure = error; });
    for (let i = 0; i < 80; i++) {
      if (failure) throw failure;
      try { await rpc('eth_chainId'); return; } catch { await delay(100); }
    }
    throw new Error('Test Anvil did not start');
  };
  const stop = async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit'); child.kill(); await exited;
    }
  };
  try {
    await start();
    const [account] = await rpc('eth_accounts');
    const hash = await rpc('eth_sendTransaction', [{ from: account, gas: '0x100000', data: '0x602a60005560016000f3' }]);
    let receipt;
    for (let i = 0; i < 50 && !receipt; i++) {
      receipt = await rpc('eth_getTransactionReceipt', [hash]);
      if (!receipt) await delay(100);
    }
    assert.equal(receipt.status, '0x1');
    const nonce = await rpc('eth_getTransactionCount', [account, 'latest']);
    await delay(2500);
    assert.ok(promoteCheckpoint(file));
    assert.ok((await stat(file)).size > 0);
    await stop();
    await start();
    assert.equal(BigInt(await rpc('eth_getStorageAt', [receipt.contractAddress, '0x0', 'latest'])), 42n);
    assert.equal(await rpc('eth_getCode', [receipt.contractAddress, 'latest']), '0x00');
    assert.equal(await rpc('eth_getTransactionCount', [account, 'latest']), nonce);
  } finally {
    await stop();
    const target = resolve(folder);
    assert.ok(target.startsWith(resolve(tmpdir()) + sep) && target.includes('credence-anvil-test-'));
    await rm(target, { recursive: true, force: true });
  }
});
