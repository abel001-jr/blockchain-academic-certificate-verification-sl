/**
 * api.js — Centralised fetch wrapper for CREDENCE.
 * All dashboard requests run through here so token handling is in one place.
 */

const BASE = "http://127.0.0.1:8000/api";

function token() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

async function request(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const t = token();
  if (t) headers["Authorization"] = `Bearer ${t}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    localStorage.clear();
    window.location.href = "/login";
    return;
  }

  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) throw data;
  return data;
}

export const api = {
  get:    (path)         => request("GET",    path),
  post:   (path, body)   => request("POST",   path, body),
  patch:  (path, body)   => request("PATCH",  path, body),
  delete: (path)         => request("DELETE", path),
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
