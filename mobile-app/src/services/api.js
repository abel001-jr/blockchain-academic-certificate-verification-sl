/**
 * Axios instance pre-configured for the Intelligent Academic Credentialing Django backend.
 * Automatically attaches the JWT access token from secure storage.
 */
import axios from "axios";
import { tokenStorage } from "./tokenStorage";
import config from "../config";
import { notifySessionExpired } from "./session";

const api = axios.create({
  baseURL: config.API_BASE,
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

// Attach access token to every request
api.interceptors.request.use(async (req) => {
  if (req.publicAuth) { delete req.headers.Authorization; return req; }
  const token = await tokenStorage.get("access_token");
  if (token) req.headers.Authorization = `Bearer ${token}`;
  return req;
});

let refreshing = null;
// Share a refresh request when several authenticated requests expire together.
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const req = err.config;
    if (err.response?.status === 401 && req && !req.publicAuth && !req.retried) {
      req.retried = true;
      try {
        if (!refreshing) {
          refreshing = (async () => {
            const refresh = await tokenStorage.get("refresh_token");
            if (!refresh) throw err;
            const { data } = await axios.post(`${config.API_BASE}/auth/refresh/`, { refresh }, { timeout: 15000 });
            await tokenStorage.set("access_token", data.access);
            if (data.refresh) await tokenStorage.set("refresh_token", data.refresh);
            return data.access;
          })().finally(() => { refreshing = null; });
        }
        req.headers.Authorization = `Bearer ${await refreshing}`;
        return api(req);
      } catch (refreshError) {
        if (![400, 401, 403].includes(refreshError.response?.status)) {
          return Promise.reject(refreshError);
        }
        await tokenStorage.remove("access_token");
        await tokenStorage.remove("refresh_token");
        notifySessionExpired();
      }
    }
    return Promise.reject(err);
  }
);

export default api;
