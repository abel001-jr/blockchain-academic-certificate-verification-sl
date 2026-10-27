import test from "node:test";
import assert from "node:assert/strict";
import { recordCredentialApproval } from "./credentialApproval.mjs";

const cert = { id: "record", certificate_id: "CR-1", cert_hash: "data", doc_hash: "certificate", transcript_hash: "transcript" };

for (const role of ["vc", "chancellor"]) {
  test(`${role} acceptance signs once and confirms the matching officer stage`, async () => {
    const calls = [];
    const transaction = { hash: "0xtx" };
    let saved;
    await recordCredentialApproval({ cert, role, api: {
      get: async path => { calls.push(path); return path.endsWith("/chain-status/") ? { exists: true } : { ...cert, status: role === "vc" ? "pending_vc" : "pending_chancellor" }; },
      post: async (path, body) => calls.push([path, body]),
    }, approveOnChain: async (...args) => { calls.push(args); return transaction; }, onTransaction: value => { saved = value; } });
    assert.equal(saved, transaction);
    assert.deepEqual(calls, ["/certificates/record/chain-status/", "/certificates/record/", ["CR-1", role], [`/certificates/record/confirm-${role}/`, { tx_hash: "0xtx" }]]);
  });
}

test("a changed document prevents opening MetaMask", async () => {
  await assert.rejects(recordCredentialApproval({ cert, role: "vc", api: {
    get: async path => path.endsWith("/chain-status/") ? { exists: true } : ({ ...cert, status: "pending_vc", transcript_hash: "changed" }),
  }, approveOnChain: () => assert.fail("Must not sign changed documents") }), /has changed/);
});

test("retrying backend confirmation never sends a second blockchain approval", async () => {
  let saved, sends = 0, posts = 0;
  const options = { cert, role: "vc", api: {
    get: async path => path.endsWith("/chain-status/") ? { exists: true } : ({ ...cert, status: "pending_vc" }),
    post: async () => { if (++posts === 1) throw new Error("connection lost"); },
  }, approveOnChain: async () => { sends++; return { hash: "0xtx" }; }, onTransaction: value => { saved = value; } };
  await assert.rejects(recordCredentialApproval(options), /connection lost/);
  await recordCredentialApproval({ ...options, transaction: saved });
  assert.equal(sends, 1);
  assert.equal(posts, 2);
});

test("a reset chain reports registrar recovery before requesting a wallet transaction", async () => {
  await assert.rejects(recordCredentialApproval({ cert, role: "vc", api: { get: async () => ({ exists: false }) },
    approveOnChain: () => assert.fail("Must not submit an approval for a missing record") }), /Ask the Registrar/);
});
