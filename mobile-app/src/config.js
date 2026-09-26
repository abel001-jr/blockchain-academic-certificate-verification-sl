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
  if (ENV_OVERRIDE) return ENV_OVERRIDE.replace(/\/$/, "");

  if (!__DEV__) return "https://your-deployed-api.com/api";

  // Dev: pick the right loopback address per platform
  if (Platform.OS === "android") {
    // Android emulator routes 10.0.2.2 → host machine localhost
    return "http://10.0.2.2:8000/api";
  }

  // iOS simulator + web browser both use standard localhost
  return "http://127.0.0.1:8000/api";
}

export default { API_BASE: getApiBase() };
