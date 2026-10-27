const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function source(file) { return fs.readFileSync(path.join(__dirname, "..", file), "utf8"); }
function load(file, names, dependencies = {}) {
  return new Function(...Object.keys(dependencies), source(file).replace(/^import .*;\r?\n/gm, "").replace(/export function /g, "function ") + `\nreturn {${names.join(",")}};`)(...Object.values(dependencies));
}

async function main() {
  const { parseInviteToken, isInvitationUrl } = load("src/utils/invitation.js", ["parseInviteToken", "isInvitationUrl"]);
  assert.equal(parseInviteToken(" credence://student-invite?token=abc_-123#section "), "abc_-123");
  assert.equal(parseInviteToken("https://example.test/student-invite?token=abc%5F123&next=home"), "abc_123");
  assert.equal(parseInviteToken("abc-123"), "abc-123");
  for (const input of ["", "https://example.test/student-invite", "https://example.test/student-invite?token=", "credence://student-invite?token=%ZZ"]) {
    assert.throws(() => parseInviteToken(input));
  }
  assert.equal(isInvitationUrl("credence://student-invite?token=abc"), true);
  assert.equal(isInvitationUrl("https://example.test/verify/student-invite?token=abc"), false);

  const { parseVerificationInput } = load("src/utils/parseCertificateScan.js", ["parseVerificationInput"]);
  assert.deepEqual(parseVerificationInput("https://example.test/verify/CR-123?code=share%5F123"), { certificateId: "CR-123", code: "share_123" });
  assert.deepEqual(parseVerificationInput("CR-123"), { certificateId: "CR-123", code: "" });
  const errorHelpers = load("src/utils/apiError.js", ["apiErrorData", "apiErrorMessage", "claimErrorMessage"]);
  const { verificationFailure } = load("src/utils/verification.js", ["verificationFailure"], errorHelpers);
  assert.match(errorHelpers.apiErrorMessage({ response: { status: 429, headers: { "retry-after": "30" } } }), /30 seconds/);
  assert.match(errorHelpers.apiErrorMessage({ isAxiosError: true, code: "ECONNABORTED" }), /too long/);
  assert.match(errorHelpers.claimErrorMessage({ response: { status: 503 } }), /temporarily unavailable/);
  assert.match(errorHelpers.claimErrorMessage({ response: { status: 403, data: { detail: "This invite link has expired." } } }), /new invitation/);
  assert.match(errorHelpers.claimErrorMessage({ response: { status: 403, data: { detail: "This invite link has already been used." } } }), /linked Google/);
  assert.equal(verificationFailure({ response: { status: 403, data: { captcha_required: true } } }).requires_web, true);
  assert.equal(errorHelpers.apiErrorMessage({ response: { status: 503, data: "null" } }), "The service is temporarily unavailable. Please try again shortly.");
  const binaryFailure = new TextEncoder().encode(JSON.stringify({ detail: "Your documents are not ready." })).buffer;
  assert.equal(errorHelpers.apiErrorMessage({ response: { status: 409, data: binaryFailure } }), "Your documents are not ready.");
  const decoder = global.TextDecoder;
  try {
    global.TextDecoder = undefined;
    assert.equal(errorHelpers.apiErrorMessage({ response: { status: 409, data: binaryFailure } }), "Your documents are not ready.");
  } finally { global.TextDecoder = decoder; }
  for (const status of [undefined, 403, 429, 500, 503, 404]) {
    assert.equal(verificationFailure({ response: status ? { status } : undefined }).verification_outcome, "unavailable");
  }
  assert.equal(verificationFailure({ response: { status: 404, data: { found: false, verification_outcome: "not_found" } } }).verification_outcome, "not_found");

  let requestHandler, errorHandler, refreshCalls = 0, retries = 0;
  const tokens = new Map([["access_token", "old"], ["refresh_token", "refresh"]]);
  const tokenStorage = { get: async key => tokens.get(key), set: async (key, value) => tokens.set(key, value), remove: async key => tokens.delete(key) };
  const api = async req => { retries++; assert.equal(req.headers.Authorization, "Bearer renewed"); return { data: "ok" }; };
  api.interceptors = {
    request: { use: callback => { requestHandler = callback; } },
    response: { use: (_, callback) => { errorHandler = callback; } },
  };
  let refreshFailure;
  const axios = {
    create: () => api,
    post: async () => { refreshCalls++; await new Promise(resolve => setTimeout(resolve, 5)); if (refreshFailure) throw refreshFailure; return { data: { access: "renewed", refresh: "rotated" } }; },
  };
  let expiredSessions = 0;
  new Function("axios", "tokenStorage", "config", "notifySessionExpired", source("src/services/api.js").replace(/^import .*;\r?\n/gm, "").replace("export default api;", "return api;"))(axios, tokenStorage, { API_BASE: "https://api.test/api" }, () => expiredSessions++);
  assert.equal((await requestHandler({ headers: {} })).headers.Authorization, "Bearer old");
  assert.equal((await requestHandler({ headers: {}, publicAuth: true })).headers.Authorization, undefined);
  const expired = () => ({ response: { status: 401 }, config: { headers: {} } });
  await Promise.all([errorHandler(expired()), errorHandler(expired())]);
  assert.equal(refreshCalls, 1);
  assert.equal(retries, 2);
  assert.equal(tokens.get("refresh_token"), "rotated");
  refreshFailure = new Error("offline");
  await assert.rejects(errorHandler(expired()));
  assert.equal(tokens.get("refresh_token"), "rotated", "offline refresh must preserve the session");
  refreshFailure = { response: { status: 429 } };
  await assert.rejects(errorHandler(expired()));
  assert.equal(tokens.get("refresh_token"), "rotated", "rate-limited refresh must preserve the session");
  refreshFailure = { response: { status: 401 } };
  await assert.rejects(errorHandler(expired()));
  assert.equal(tokens.size, 0, "rejected refresh must clear expired credentials");
  assert.equal(expiredSessions, 1, "rejected refresh must return the app to signed-out navigation");
  tokens.set("access_token", "existing");
  await assert.rejects(errorHandler({ response: { status: 401 }, config: { publicAuth: true } }));
  assert.equal(tokens.get("access_token"), "existing", "failed Google login must preserve the current session");

  const calls = [];
  const endpointApi = {
    get: async (url, options) => { calls.push({ method: "GET", url, options }); return { data: url.startsWith("/verify/") ? { verification_outcome: "valid" } : [] }; },
    post: async (url, body, options) => { calls.push({ method: "POST", url, body, options }); return { data: { access: "access", refresh: "refresh", user: { id: "student" } } }; },
  };
  const moduleSource = file => source(file).replace(/^import .*;\r?\n/gm, "").replace(/export async function /g, "async function ");
  const certificates = new Function("api", "parseVerificationInput", moduleSource("src/services/certificates.js") + "\nreturn { getMyCertificates, verifyCertificate, downloadMyDocuments };")(endpointApi, parseVerificationInput);
  await certificates.getMyCertificates();
  assert.equal(calls.at(-1).url, "/my-certificates/");
  await certificates.verifyCertificate("credence://verify/CR-123?code=secret");
  assert.equal(calls.at(-1).url, "/verify/CR-123/");
  assert.deepEqual(calls.at(-1).options.params, { code: "secret" });
  const beforeInvalid = calls.length;
  await assert.rejects(certificates.verifyCertificate("https://unrelated.example/other"));
  assert.equal(calls.length, beforeInvalid);
  let verifyAttempts = 0;
  const originalGet = endpointApi.get;
  endpointApi.get = async (url, options) => {
    if (url.startsWith("/verify/")) {
      verifyAttempts++;
      if (verifyAttempts === 1) throw { response: { status: 401 } };
      assert.equal(options.publicAuth, true);
      assert.deepEqual(options.params, { code: "secret" });
      return { data: { verification_outcome: "valid" } };
    }
    return originalGet(url, options);
  };
  await certificates.verifyCertificate("credence://verify/CR-123?code=secret");
  assert.equal(verifyAttempts, 2);
  endpointApi.get = async (url, options) => ({ data: options.params.page === 1 ? { results: [{ id: "first" }], next: "page2" } : { results: [{ id: "second" }], next: null } });
  assert.deepEqual(await certificates.getMyCertificates(), [{ id: "first" }, { id: "second" }]);
  endpointApi.get = originalGet;
  await certificates.downloadMyDocuments("CR/123");
  assert.equal(calls.at(-1).url, "/my-certificates/CR%2F123/documents/");
  assert.equal(calls.at(-1).options.responseType, "arraybuffer");
  const auth = new Function("api", "tokenStorage", "parseInviteToken", moduleSource("src/services/auth.js") + "\nreturn { claimInviteToken, loginWithGoogle, getMe };")(endpointApi, tokenStorage, parseInviteToken);
  const beforeEmptyClaim = calls.length;
  await assert.rejects(auth.claimInviteToken(""));
  await assert.rejects(auth.claimInviteToken("https://example.test/student-invite?token=%ZZ"));
  assert.equal(calls.length, beforeEmptyClaim, "invalid invitations must not reach the claim API");
  await auth.claimInviteToken("credence://student-invite?token=invitation");
  assert.equal(calls.at(-1).url, "/auth/student-invite/claim/");
  assert.deepEqual(calls.at(-1).body, { token: "invitation" });
  assert.equal(calls.at(-1).options.publicAuth, true);
  await auth.loginWithGoogle("google-token");
  assert.equal(calls.at(-1).url, "/auth/google/");
  assert.deepEqual(calls.at(-1).body, { id_token: "google-token" });
  await auth.getMe();
  assert.equal(calls.at(-1).url, "/auth/me/");
  assert.equal(tokens.get("access_token"), "access");
  console.log("Passed invitation, QR/share-code, verification failure, and session refresh regression checks.");
  console.log("Passed mobile button endpoint and request payload checks.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
