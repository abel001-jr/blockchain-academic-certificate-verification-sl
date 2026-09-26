/**
 * Auth service — email/password + Google OAuth sign-in.
 * Wallet/MetaMask auth removed; Google replaces it for students.
 */
import * as SecureStore from "expo-secure-store";
import api from "./api";
import config from "../config";

/** Persist JWT tokens */
export async function saveTokens({ access, refresh }) {
  await SecureStore.setItemAsync("access_token", access);
  await SecureStore.setItemAsync("refresh_token", refresh);
}

/** Clear tokens (logout) */
export async function clearTokens() {
  await SecureStore.deleteItemAsync("access_token");
  await SecureStore.deleteItemAsync("refresh_token");
}

/** Read stored access token */
export async function getAccessToken() {
  return SecureStore.getItemAsync("access_token");
}

/** Standard email + password login */
export async function loginWithEmail(email, password) {
  const res = await api.post("/auth/login/", { email, password });
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
  const res = await api.post("/auth/google/", { id_token: idToken });
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
  const res = await api.post("/auth/student-invite/claim/", { token: rawToken });
  await saveTokens(res.data);
  return res.data; // { access, refresh, user, certificate_id }
}

/** Fetch current user profile */
export async function getMe() {
  const res = await api.get("/auth/me/");
  return res.data;
}

/** Logout — clear local tokens only */
export async function logout() {
  await clearTokens();
}
