import test from "node:test";
import assert from "node:assert/strict";
import { scheduleDocumentFallback } from "./documentFallback.mjs";

test("an immediate gateway failure still waits four seconds before fallback", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const messages = [];
  const fallback = scheduleDocumentFallback(message => messages.push(message));
  fallback.setMessage("Gateway rate limited; opening saved copy.");
  t.mock.timers.tick(3999);
  assert.deepEqual(messages, []);
  t.mock.timers.tick(1);
  assert.deepEqual(messages, ["Gateway rate limited; opening saved copy."]);
});

test("a successful request or closed card cancels the automatic switch", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const fallback = scheduleDocumentFallback(() => calls++);
  t.mock.timers.tick(1000);
  fallback.cancel();
  t.mock.timers.tick(5000);
  assert.equal(calls, 0);
});
