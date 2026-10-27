import test from "node:test";
import assert from "node:assert/strict";
import { externalUploadResume } from "./externalUploadResume.mjs";

test("new drafts open Upload & Review rather than signing", () => {
  assert.deepEqual(externalUploadResume({ flow_type: "full_upload", status: "draft" }, "full_upload"), { kind: "draft", step: 1 });
});

test("reused prepared uploads require an explicit review stage", () => {
  const record = { flow_type: "full_upload", status: "pending_vc", cert_hash: "data", doc_hash: "pdf", tx_hash: "" };
  assert.deepEqual(externalUploadResume(record, "full_upload"), { kind: "prepared_review", step: 1 });
});

test("already submitted credentials go to details rather than being submitted again", () => {
  assert.deepEqual(externalUploadResume({ flow_type: "full_upload", status: "pending_vc", tx_hash: "0xtx" }, "full_upload"), { kind: "detail" });
});

test("a draft from another workflow cannot silently advance this flow", () => {
  assert.throws(() => externalUploadResume({ flow_type: "system_designed", status: "draft" }, "full_upload"), /different upload workflow/);
});
