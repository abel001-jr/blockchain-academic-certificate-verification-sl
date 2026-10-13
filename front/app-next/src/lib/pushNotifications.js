import { api } from "./api";

function supported() {
  return typeof window !== "undefined" && window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}
function keyBytes(value) {
  const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
async function register(publicKey, create) {
  const registration = await navigator.serviceWorker.register("/notification-sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription && create) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  if (subscription) {
    await api.post("/notifications/push/", subscription.toJSON());
    localStorage.setItem("credence:push-endpoint", subscription.endpoint);
  }
}
export async function enablePush(publicKey) {
  if (!supported()) throw new Error("Push requires a supported browser and HTTPS (or localhost).");
  if (!publicKey) throw new Error("Push delivery is not configured on this server.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error(permission === "denied" ? "Notifications are blocked. Allow them in your browser’s site settings, then try again." : "Allow browser notifications to enable push.");
  await register(publicKey, true);
}
export async function syncPush(publicKey) {
  if (supported() && Notification.permission === "granted") await register(publicKey, true);
}
export async function disablePush() {
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      await api.delete("/notifications/push/", { endpoint: subscription.endpoint });
      await subscription.unsubscribe();
    }
  }
  localStorage.removeItem("credence:push-endpoint");
}
