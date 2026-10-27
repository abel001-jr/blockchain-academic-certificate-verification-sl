/**
 * api.js — Centralised fetch wrapper for INTELLIGENT ACADEMIC CREDENTIALING.
 * All dashboard requests run through here so token handling is in one place.
 */

// Falls back to the local dev server so a missing env var degrades to today's
// behaviour rather than sending requests to "/api" on the wrong origin.
import { publishDashboardUpdate } from "./dashboardRefresh.mjs";
import { createRequestPool } from "./requestPool.mjs";

const reads = createRequestPool();
if (typeof window !== "undefined") {
  window.addEventListener("storage", event => { if (event.key === "credence:dashboard-update") reads.invalidate(); });
  window.addEventListener("credence:session-ended", () => reads.clear());
}

const BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000/api";

export function clearSession() {
  reads.clear();
  const endpoint = localStorage.getItem("credence:push-endpoint");
  const access = localStorage.getItem("access_token");
  if (endpoint && access) {
    fetch(`${BASE}/notifications/push/`, { method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${access}` }, body: JSON.stringify({ endpoint }), keepalive: true }).catch(() => {});
    navigator.serviceWorker?.getRegistration("/").then(async registration => { const subscription = await registration?.pushManager.getSubscription(); await subscription?.unsubscribe(); }).catch(() => {});
  }
  const preferences = Object.keys(localStorage).filter(key => key === "credence.dashboard-theme" || key.startsWith("credence:branding-guide-seen")).map(key => [key, localStorage.getItem(key)]);
  localStorage.clear();
  preferences.forEach(([key, value]) => { if (value !== null) localStorage.setItem(key, value); });
  window.dispatchEvent(new Event("credence:session-ended"));
}

function token() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

async function request(method, path, body, access = token()) {
  if (method !== "GET") reads.invalidate();
  const multipart = body instanceof FormData;
  const headers = multipart ? {} : { "Content-Type": "application/json" };
  const t = access;
  if (t) headers["Authorization"] = `Bearer ${t}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
    cache: "no-store",
  });

  if (res.status === 401) {
    if (t === token()) { clearSession(); window.location.replace("/login"); }
    throw new Error("Your session has ended. Sign in again.");
  }

  const data = res.status === 204 ? null : await res.json().catch(() => {
    if (res.ok) throw new Error("The server returned an unreadable response. Try again.");
    return { detail: res.status === 429 ? "Too many requests. Wait before trying again." : "The server could not complete the request. Try again shortly." };
  });
  if (!res.ok) {
    if (res.status === 429) reads.defer(`${t || "anonymous"}:${path}`, data, res.headers.get("Retry-After"));
    throw data;
  }
  if (method !== "GET") { reads.invalidate(); publishDashboardUpdate(path); }
  if (method === "PATCH" && path === "/auth/me/") {
    window.dispatchEvent(new CustomEvent("credence:profile-updated", { detail: data }));
  }
  return data;
}

export const api = {
  get: (path) => {
    const access = token();
    return reads.get(`${access || "anonymous"}:${path}`, () => request("GET", path, undefined, access), ["/auth/me/", "/notifications/preferences/"].includes(path) ? 30000 : 1000);
  },
  post:   (path, body)   => request("POST",   path, body),
  patch:  (path, body)   => request("PATCH",  path, body),
  delete: (path, body)   => request("DELETE", path, body),
};

// Uploads are retried explicitly: a lost response may follow a successful pin.
export async function uploadDocument(path, body) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: "POST", headers: { Authorization: `Bearer ${token() || ""}` }, body,
    });
  } catch {
    throw new Error("The upload connection was interrupted. Keep this page open and retry with the same files. Saved upload progress will be reused where confirmed.");
  }
  if (res.status === 401) {
    clearSession();
    window.location.replace("/login");
    throw new Error("Your session has ended. Sign in again to reopen the saved draft.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    const detail = data?.detail || "The server did not confirm the upload. Keep this page open and retry with the same files.";
    const guidance = data?.retryable === true ? " Keep this page open and retry with the same files; confirmed uploads will be reused." : "";
    throw Object.assign(new Error(detail + guidance), { code: data?.code, retryable: data?.retryable });
  }
  reads.invalidate();
  publishDashboardUpdate(path);
  return data;
}

/** Decode JWT payload (handles base64url). Returns role, full_name, institution, user_id. */
export function jwtPayload() {
  const t = token();
  if (!t) return null;
  try {
    const part = t.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}
