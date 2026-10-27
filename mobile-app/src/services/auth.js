/**
 * Auth service — email/password + Google OAuth sign-in.
 * Wallet/MetaMask auth removed; Google replaces it for students.
 */
import { tokenStorage } from "./tokenStorage";
import api from "./api";
import { parseInviteToken } from "../utils/invitation";

/** Persist JWT tokens */
export async function saveTokens({ access, refresh }) {
  if (typeof access !== "string" || !access || typeof refresh !== "string" || !refresh) {
    throw new Error("The server did not return a complete sign-in session. Try signing in again.");
  }
  await tokenStorage.set("access_token", access);
  await tokenStorage.set("refresh_token", refresh);
}

/** Clear tokens (logout) */
export async function clearTokens() {
  await tokenStorage.remove("access_token");
  await tokenStorage.remove("refresh_token");
}

/** Read stored access token */
export async function getAccessToken() {
  return tokenStorage.get("access_token");
}

/** Standard email + password login */
export async function loginWithEmail(email, password) {
  const res = await api.post("/auth/login/", { email, password }, { publicAuth: true });
  await saveTokens(res.data);
  return res.data;
}

/**
 * Google sign-in — send the id_token from expo-auth-session to the backend.
 * The backend verifies it with Google's tokeninfo endpoint and returns a JWT.
 *
 * @param {string} idToken  — id_token from Google OAuth response
 */
export async function loginWithGoogle(idToken) {
  const res = await api.post("/auth/google/", { id_token: idToken }, { publicAuth: true });
  await saveTokens(res.data);
  return res.data; // { access, refresh, user, created }
}

/**
 * Claim a student invite token received via WhatsApp link.
 * Calls POST /api/auth/student-invite/claim/ with the raw token.
 * On success saves the returned JWT and returns { user, certificate_id }.
 *
 * @param {string} rawToken — the token from ?token= in the invite URL
 */
export async function claimInviteToken(rawToken) {
  const res = await api.post("/auth/student-invite/claim/", { token: parseInviteToken(rawToken) }, { publicAuth: true });
  try { await saveTokens(res.data); }
  catch {
    throw new Error("Your invitation was accepted, but the session could not be saved on this device. Sign in with linked Google, or ask your institution for a new invitation.");
  }
  return res.data; // { access, refresh, user, certificate_id }
}

/** Fetch current user profile */
export async function getMe() {
  const res = await api.get("/auth/me/");
  return res.data;
}

export async function updateStudentProfile(profile) {
  const res = await api.patch("/auth/me/", profile);
  return res.data;
}

export async function linkGoogleAccount(idToken) {
  const res = await api.post("/auth/google/link/", { id_token: idToken });
  return res.data.user;
}

/** Logout — clear local tokens only */
export async function logout() {
  await clearTokens();
}
