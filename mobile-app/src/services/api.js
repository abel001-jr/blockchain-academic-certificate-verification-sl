/**
 * Axios instance pre-configured for the Credence Django backend.
 * Automatically attaches the JWT access token from secure storage.
 */
import axios from "axios";
import * as SecureStore from "expo-secure-store";
import config from "../config";

const api = axios.create({
  baseURL: config.API_BASE,
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

// Attach access token to every request
api.interceptors.request.use(async (req) => {
  const token = await SecureStore.getItemAsync("access_token");
  if (token) req.headers.Authorization = `Bearer ${token}`;
  return req;
});

// On 401 — clear tokens and let the app handle redirect
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      await SecureStore.deleteItemAsync("access_token");
      await SecureStore.deleteItemAsync("refresh_token");
    }
    return Promise.reject(err);
  }
);

export default api;
