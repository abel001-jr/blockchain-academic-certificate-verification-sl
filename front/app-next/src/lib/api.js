/**
 * api.js — Centralised fetch wrapper for INTELLIGENT ACADEMIC CREDENTIALING.
 * All dashboard requests run through here so token handling is in one place.
 */

// Falls back to the local dev server so a missing env var degrades to today's
// behaviour rather than sending requests to "/api" on the wrong origin.
const BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000/api";

export function clearSession() {
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

async function request(method, path, body) {
  const multipart = body instanceof FormData;
  const headers = multipart ? {} : { "Content-Type": "application/json" };
  const t = token();
  if (t) headers["Authorization"] = `Bearer ${t}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
    cache: "no-store",
  });

  if (res.status === 401) {
    clearSession();
    window.location.replace("/login");
    throw new Error("Your session has ended. Sign in again.");
  }

  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) throw data;
  if (method === "PATCH" && path === "/auth/me/") {
    window.dispatchEvent(new CustomEvent("credence:profile-updated", { detail: data }));
  }
  return data;
}

export const api = {
  get:    (path)         => request("GET",    path),
  post:   (path, body)   => request("POST",   path, body),
  patch:  (path, body)   => request("PATCH",  path, body),
  delete: (path, body)   => request("DELETE", path, body),
};

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
