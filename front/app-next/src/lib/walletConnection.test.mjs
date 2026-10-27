import test from "node:test";
import assert from "node:assert/strict";
import { connectSingleWallet, disconnectWalletAccounts } from "./walletConnection.mjs";

function wallet(initial = [], chosen = ["0xABC"]) {
  let accounts = initial;
  const calls = [];
  return {
    calls,
    async request(request) {
      calls.push(request);
      if (request.method === "eth_accounts") return accounts;
      if (request.method === "eth_requestAccounts") { accounts = chosen; return accounts; }
      if (request.method === "wallet_revokePermissions") { accounts = []; return null; }
      throw new Error(`Unexpected wallet prompt: ${request.method}`);
    },
  };
}

test("an existing single connection is reused without a picker", async () => {
  const provider = wallet(["0xABC"]);
  assert.equal(await connectSingleWallet(provider), "0xabc");
  assert.deepEqual(provider.calls.map(call => call.method), ["eth_accounts"]);
});

test("a disconnected wallet connects once and confirms its permitted account", async () => {
  const provider = wallet();
  assert.equal(await connectSingleWallet(provider), "0xabc");
  assert.deepEqual(provider.calls.map(call => call.method), ["eth_accounts", "eth_requestAccounts", "eth_accounts"]);
});

test("multiple saved accounts are blocked instead of choosing the first", async () => {
  const provider = wallet(["0xAAA", "0xBBB"]);
  await assert.rejects(connectSingleWallet(provider), /Multiple MetaMask accounts/);
  assert.deepEqual(provider.calls.map(call => call.method), ["eth_accounts"]);
});

test("selecting multiple accounts at connection does not allow signing", async () => {
  const provider = wallet([], ["0xAAA", "0xBBB"]);
  await assert.rejects(connectSingleWallet(provider), /Multiple MetaMask accounts/);
});

test("concurrent connect attempts share one wallet request", async () => {
  const provider = wallet();
  const addresses = await Promise.all([connectSingleWallet(provider), connectSingleWallet(provider), connectSingleWallet(provider)]);
  assert.deepEqual(addresses, ["0xabc", "0xabc", "0xabc"]);
  assert.equal(provider.calls.filter(call => call.method === "eth_requestAccounts").length, 1);
});

test("disconnect revokes this site's account permission and confirms disconnection", async () => {
  const provider = wallet(["0xAAA", "0xBBB"]);
  await disconnectWalletAccounts(provider);
  assert.deepEqual(provider.calls[0], { method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
  assert.equal(provider.calls[1].method, "eth_accounts");
  assert.equal(await connectSingleWallet(provider), "0xabc");
});

test("unsupported revocation gives manual instructions instead of pretending to disconnect", async () => {
  const provider = { request: async () => { throw { code: 4200 }; } };
  await assert.rejects(disconnectWalletAccounts(provider), /MetaMask Permissions/);
});

test("an already pending MetaMask request is reported without retrying or queuing another", async () => {
  let attempts = 0;
  const provider = { request: async ({ method }) => {
    if (method === "eth_accounts") return [];
    attempts++; throw { code: -32002 };
  } };
  await assert.rejects(connectSingleWallet(provider), /already open/);
  assert.equal(attempts, 1);
});

test("cancelling a connect request releases the lock for a later attempt", async () => {
  const provider = wallet();
  const request = provider.request;
  let rejected = false;
  provider.request = async args => {
    if (args.method === "eth_requestAccounts" && !rejected) { rejected = true; throw { code: 4001 }; }
    return request(args);
  };
  await assert.rejects(connectSingleWallet(provider), error => error.code === 4001);
  assert.equal(await connectSingleWallet(provider), "0xabc");
});
