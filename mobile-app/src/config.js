/**
 * API base URL — resolves correctly for every run target:
 *
 *   Web browser (expo start --web)  →  http://127.0.0.1:8000/api
 *   Android emulator               →  http://10.0.2.2:8000/api
 *   iOS simulator                  →  http://127.0.0.1:8000/api
 *   Physical device (dev)          →  set EXPO_PUBLIC_API_BASE to your
 *                                      machine's LAN IP, e.g.
 *                                      EXPO_PUBLIC_API_BASE=http://192.168.1.42:8000/api
 *   Production build               →  set EXPO_PUBLIC_API_BASE to your
 *                                      deployed backend URL
 */
import { Platform } from "react-native";

// Allow override via environment variable (physical devices, CI, prod)
const ENV_OVERRIDE = process.env.EXPO_PUBLIC_API_BASE;

function getApiBase() {
  if (Platform.OS === "web" && process.env.EXPO_PUBLIC_WEB_API_BASE) {
    return process.env.EXPO_PUBLIC_WEB_API_BASE.replace(/\/$/, "");
  }
  if (ENV_OVERRIDE) return ENV_OVERRIDE.replace(/\/$/, "");

  if (!__DEV__) {
    throw new Error("Set EXPO_PUBLIC_API_BASE to your deployed HTTPS API URL before building for production.");
  }

  // Dev: pick the right loopback address per platform
  if (Platform.OS === "android") {
    // Android emulator routes 10.0.2.2 → host machine localhost
    return "http://10.0.2.2:8000/api";
  }

  // iOS simulator + web browser both use standard localhost
  return "http://127.0.0.1:8000/api";
}

const WEB_BASE = (process.env.EXPO_PUBLIC_WEB_BASE || "https://credence.edu.sl").replace(/\/$/, "");
export function verificationUrl(id) {
  return `${WEB_BASE}/verify/${encodeURIComponent(id)}`;
}
export default { API_BASE: getApiBase(), WEB_BASE };
