import test from "node:test";
import assert from "node:assert/strict";
import { nextDocumentReview } from "./documentReview.mjs";

test("review completion does not require an IPFS source", () => {
  const viewed = { certificate: { total: 1, pages: [1] }, transcript: { total: 2, pages: [1, 2] } };
  assert.equal(nextDocumentReview(["certificate", "transcript"], viewed), null);
});

test("a saved transcript still requires its second page to be reviewed", () => {
  const viewed = { certificate: { total: 1, pages: [1] }, transcript: { total: 2, pages: [1] } };
  assert.deepEqual(nextDocumentReview(["certificate", "transcript"], viewed), { kind: "transcript", page: 2 });
});
