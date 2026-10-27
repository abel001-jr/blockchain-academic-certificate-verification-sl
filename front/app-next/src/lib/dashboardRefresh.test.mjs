import test from "node:test";
import assert from "node:assert/strict";
import { DASHBOARD_UPDATED, publishDashboardUpdate, subscribeDashboardRefresh } from "./dashboardRefresh.mjs";

function browser(t) {
  const previousWindow = globalThis.window, previousDocument = globalThis.document;
  const window = new EventTarget(), document = new EventTarget();
  document.visibilityState = "visible";
  const stored = new Map();
  let poll;
  window.localStorage = { setItem: (key, value) => stored.set(key, value) };
  window.setInterval = callback => { poll = callback; return 1; };
  window.clearInterval = () => { poll = null; };
  globalThis.window = window; globalThis.document = document;
  const cleanups = [];
  t.after(() => { cleanups.forEach(stop => stop()); globalThis.window = previousWindow; globalThis.document = previousDocument; });
  return { window, document, stored, cleanup: stop => cleanups.push(stop), poll: () => poll?.() };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test("a successful mutation signal refreshes immediately and can notify other tabs", async t => {
  const env = browser(t);
  let calls = 0;
  const stop = subscribeDashboardRefresh(() => { calls++; }); env.cleanup(stop);
  await flush();
  assert.equal(calls, 1);
  publishDashboardUpdate("/certificates/draft/abandon/");
  assert.equal(calls, 2);
  assert.equal(JSON.parse([...env.stored.values()][0]).path, "/certificates/draft/abandon/");
});

test("updates during an older count request queue a fresh read without overlapping requests", async t => {
  const env = browser(t);
  const releases = [];
  let calls = 0;
  const stop = subscribeDashboardRefresh(() => { calls++; return new Promise(resolve => releases.push(resolve)); }); env.cleanup(stop);
  await flush();
  publishDashboardUpdate(); publishDashboardUpdate();
  assert.equal(calls, 1);
  releases.shift()(); await flush();
  assert.equal(calls, 2);
  releases.shift()(); await flush();
  assert.equal(calls, 2);
});

test("hidden tabs pause polling and catch up when visible; other-tab updates also refresh", async t => {
  const env = browser(t);
  let calls = 0;
  const stop = subscribeDashboardRefresh(() => { calls++; }); env.cleanup(stop);
  await flush();
  env.document.visibilityState = "hidden";
  env.poll(); publishDashboardUpdate();
  assert.equal(calls, 1);
  env.document.visibilityState = "visible";
  env.document.dispatchEvent(new Event("visibilitychange")); await flush();
  assert.equal(calls, 2);
  const storageEvent = new Event("storage"); storageEvent.key = "credence:dashboard-update";
  env.window.dispatchEvent(storageEvent); await flush();
  assert.equal(calls, 3);
  env.poll(); await flush(); assert.equal(calls, 4);
});

test("cleanup removes listeners and queued work even with an outstanding request", async t => {
  const env = browser(t);
  let calls = 0, release;
  const stop = subscribeDashboardRefresh(() => { calls++; return new Promise(resolve => { release = resolve; }); });
  await flush(); publishDashboardUpdate(); stop(); release(); await flush();
  env.window.dispatchEvent(new Event(DASHBOARD_UPDATED)); env.window.dispatchEvent(new Event("focus")); env.poll();
  assert.equal(calls, 1);
});

test("temporary refresh failure recovers on the next update", async t => {
  const env = browser(t);
  let calls = 0;
  const stop = subscribeDashboardRefresh(() => { calls++; if (calls === 1) throw new Error("offline"); }); env.cleanup(stop);
  await flush(); publishDashboardUpdate(); await flush();
  assert.equal(calls, 2);
});

test("full-list subscriptions can disable timers while retaining immediate updates", async t => {
  const env = browser(t);
  let calls = 0;
  const stop = subscribeDashboardRefresh(() => { calls++; }, { intervalMs: 0 }); env.cleanup(stop);
  await flush(); env.poll(); await flush();
  assert.equal(calls, 1);
  publishDashboardUpdate("/certificates/changed/"); await flush();
  assert.equal(calls, 2);
  env.window.dispatchEvent(new Event("focus")); await flush();
  assert.equal(calls, 3);
});
