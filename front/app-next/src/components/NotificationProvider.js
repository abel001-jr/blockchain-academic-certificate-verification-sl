"use client";
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { api, jwtPayload } from "@/lib/api";
import { enablePush, disablePush, syncPush } from "@/lib/pushNotifications";
import { saveNotificationPreference } from "@/lib/notifications";

const NotificationContext = createContext({});
export function useNotifications() { return useContext(NotificationContext); }

export default function NotificationProvider({ children }) {
  const pathname = usePathname();
  const [inbox, setInbox] = useState({ results: [], unread_count: 0, next_offset: null });
  const [preferences, setPreferences] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState("default");
  const refresh = useCallback(async () => {
    if (!jwtPayload() || !window.location.pathname.startsWith("/dashboard")) return;
    const session = localStorage.getItem("access_token");
    try {
      const data = await api.get("/notifications/");
      if (localStorage.getItem("access_token") === session) { setInbox(data); setError(""); }
    } catch (e) { if (localStorage.getItem("access_token") === session) setError(e?.detail || "Could not load notifications."); }
  }, []);
  useEffect(() => {
    let active = true;
    const reset = () => { active = false; setInbox({ results: [], unread_count: 0, next_offset: null }); setPreferences(null); };
    const check = async () => { if (document.visibilityState === "visible") await refresh(); };
    window.addEventListener("credence:session-ended", reset);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    if (pathname?.startsWith("/dashboard") && jwtPayload()) {
      Promise.resolve().then(refresh);
      api.get("/notifications/preferences/").then(async data => {
        if (!active) return;
        setPreferences(data); setPermission("Notification" in window ? Notification.permission : "unsupported");
        saveNotificationPreference(data.push_enabled);
        if (data.push_enabled && data.push_configured) await syncPush(data.public_key);
      }).catch(() => { if (active) setError("Could not load notification preferences."); });
    }
    const timer = setInterval(check, 30000);
    return () => { active = false; clearInterval(timer); window.removeEventListener("credence:session-ended", reset); document.removeEventListener("visibilitychange", check); window.removeEventListener("focus", check); };
  }, [pathname, refresh]);
  async function setPush(enabled) {
    setBusy(true); setError("");
    try {
      if (enabled) await enablePush(preferences?.public_key); else await disablePush();
      const data = await api.patch("/notifications/preferences/", { push_enabled: enabled });
      setPreferences(data); saveNotificationPreference(enabled);
      setPermission("Notification" in window ? Notification.permission : "unsupported");
    } catch (e) { setError(e?.detail || e?.message || "Could not update push notifications."); }
    finally { setBusy(false); }
  }
  async function markRead(id) {
    try { await api.patch("/notifications/", id ? { id } : { all: true }); await refresh(); }
    catch (e) { setError(e?.detail || "Could not mark notifications as read."); }
  }
  async function loadMore() {
    if (inbox.next_offset === null) return;
    try {
      const next = await api.get(`/notifications/?offset=${inbox.next_offset}`);
      setInbox(previous => ({ ...next, results: [...previous.results, ...next.results.filter(row => !previous.results.some(old => old.id === row.id))] }));
    } catch { setError("Could not load more notifications."); }
  }
  async function sendTest() {
    setBusy(true); setError("");
    try { await api.post("/notifications/test/"); await refresh(); }
    catch (e) { setError(e?.detail || "Could not send a test notification."); }
    finally { setBusy(false); }
  }
  return <NotificationContext.Provider value={{ ...inbox, preferences, permission, busy, error, refresh, markRead, loadMore, setPush, sendTest }}>{children}</NotificationContext.Provider>;
}
