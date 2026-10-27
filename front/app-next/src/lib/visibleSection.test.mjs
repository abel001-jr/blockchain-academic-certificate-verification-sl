import test from "node:test";
import assert from "node:assert/strict";
import {visibleSection} from "./visibleSection.mjs";

test("Why Web3 wins over the earlier quick tour and later get started", () => {
  assert.equal(visibleSection([
    {anchor: "quick-tour", top: -600, bottom: 100},
    {anchor: "why", top: 200, bottom: 1200},
    {anchor: "get-started", top: 2000, bottom: 2400},
  ], 100, 1000), "why");
});
test("Who it is for wins when the preceding get started is above the header", () => {
  assert.equal(visibleSection([
    {anchor: "get-started", top: -400, bottom: 150},
    {anchor: "stakeholders", top: 180, bottom: 1400},
  ], 100, 1000), "stakeholders");
});
test("hidden or zero-height sections cannot steal the active state", () => {
  assert.equal(visibleSection([
    {anchor: "why", top: -100, bottom: 1000},
    {anchor: "get-started", top: 0, bottom: 0},
    {anchor: "quick-tour", top: 0, bottom: 1000, hidden: true},
  ], 100, 900), "why");
});
test("hero without a visible navigation section has no active item", () => {
  assert.equal(visibleSection([{anchor: "quick-tour", top: 1000, bottom: 1500}], 100, 900), "");
});
