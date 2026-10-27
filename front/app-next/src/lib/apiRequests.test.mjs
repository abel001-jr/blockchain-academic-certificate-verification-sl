import test from "node:test";
import assert from "node:assert/strict";
import { api } from "./api.js";

function environment(t, access) {
  const original = { window: globalThis.window, localStorage: globalThis.localStorage, fetch: globalThis.fetch };
  const values = new Map([["access_token", access]]);
  globalThis.localStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  globalThis.window = new EventTarget();
  window.localStorage = localStorage;
  t.after(() => Object.assign(globalThis, original));
  return values;
}

test("the API shares duplicate profile reads and invalidates after a write", async t => {
  environment(t, "profile-session");
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ name: `version ${calls}` }); };
  const [first, second] = await Promise.all([api.get("/auth/me/"), api.get("/auth/me/")]);
  assert.equal(calls, 1); assert.deepEqual(first, second);
  await api.get("/auth/me/"); assert.equal(calls, 1);
  await api.patch("/auth/me/", { name: "new" });
  await api.get("/auth/me/"); assert.equal(calls, 3);
});

test("a queued read retains its original authentication instead of borrowing a new session", async t => {
  const values = environment(t, "old-session");
  const seen = [];
  globalThis.fetch = async (_, options) => { seen.push(options.headers.Authorization); return Response.json({}); };
  const old = api.get("/auth/me/");
  values.set("access_token", "new-session");
  const next = api.get("/auth/me/");
  await Promise.all([old, next]);
  assert.deepEqual(seen, ["Bearer old-session", "Bearer new-session"]);
});

test("API rate-limit responses prevent repeated reads during Retry-After", async t => {
  environment(t, "limited-session");
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ detail: "Please wait." }, { status: 429, headers: { "Retry-After": "60" } }); };
  await assert.rejects(api.get("/notifications/"), error => error.detail === "Please wait.");
  await assert.rejects(api.get("/notifications/"), error => error.detail === "Please wait.");
  assert.equal(calls, 1);
});
