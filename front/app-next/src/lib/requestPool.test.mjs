import test from "node:test";
import assert from "node:assert/strict";
import { createRequestPool } from "./requestPool.mjs";

const flush = () => new Promise(resolve => setImmediate(resolve));

test("concurrent reads share one request and a short-lived result", async () => {
  let calls = 0, release, time = 0;
  const pool = createRequestPool({ now: () => time });
  const read = () => { calls++; return new Promise(resolve => { release = resolve; }); };
  const first = pool.get("session:path", read, 1000);
  const second = pool.get("session:path", read, 1000);
  await flush(); assert.equal(calls, 1);
  release({ count: 2 });
  assert.deepEqual(await first, await second);
  await pool.get("session:path", read); assert.equal(calls, 1);
  time = 1001;
  const next = pool.get("session:path", read); await flush();
  assert.equal(calls, 2); release({ count: 3 }); await next;
});

test("mutations do not reuse pre-mutation in-flight responses", async () => {
  const pool = createRequestPool();
  let oldRelease;
  const old = pool.get("session:path", () => new Promise(resolve => { oldRelease = resolve; }));
  await flush(); pool.invalidate();
  assert.equal(await pool.get("session:path", async () => "new"), "new");
  oldRelease("old"); await old;
  assert.equal(await pool.get("session:path", async () => "incorrect"), "new");
});

test("sessions cannot share responses and failures are not cached", async () => {
  const pool = createRequestPool();
  assert.equal(await pool.get("one:path", async () => "one"), "one");
  assert.equal(await pool.get("two:path", async () => "two"), "two");
  await assert.rejects(pool.get("failure", async () => { throw new Error("offline"); }));
  assert.equal(await pool.get("failure", async () => "recovered"), "recovered");
});

test("Retry-After blocks repeated reads until cooldown expires", async () => {
  let time = 0, calls = 0;
  const pool = createRequestPool({ now: () => time });
  pool.defer("session:path", new Error("limited"), "60");
  await assert.rejects(pool.get("session:path", async () => { calls++; }), /limited/);
  assert.equal(calls, 0);
  time = 60001;
  await pool.get("session:path", async () => { calls++; });
  assert.equal(calls, 1);
});

test("HTTP-date cooldowns work and clearing a session removes them", async () => {
  let time = Date.parse("2026-10-20T12:00:00Z");
  const pool = createRequestPool({ now: () => time });
  pool.defer("key", new Error("limited"), "Tue, 20 Oct 2026 12:01:00 GMT");
  await assert.rejects(pool.get("key", async () => "wrong"));
  pool.clear();
  assert.equal(await pool.get("key", async () => "new session"), "new session");
});
