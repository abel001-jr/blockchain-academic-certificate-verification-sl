"use client";
import { useEffect, useRef, useState } from "react";
import { usePendingApplications } from "./PendingApplicationsProvider";
import Link from "next/link";
import { Bell, CheckCheck, X } from "lucide-react";
import { useNotifications } from "@/components/NotificationProvider";

export default function NotificationInbox() {
  const { results = [], unread_count = 0, next_offset, error, refresh, markRead, loadMore } = useNotifications();
  const pendingApplications = usePendingApplications();
  const notificationCount = unread_count + pendingApplications;
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("notifications") === "1") Promise.resolve().then(() => setOpen(true));
    const close = event => { if (event.key === "Escape" || (event.type === "mousedown" && !root.current?.contains(event.target))) setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, []);
  return <div className="relative" ref={root}>
    <button type="button" onClick={() => { setOpen(!open); if (!open) refresh(); }} className="relative p-2 rounded-xl hover:bg-[var(--cd-soft)] text-[var(--cd-primary)]" aria-label={`Notifications, ${unread_count} unread${pendingApplications ? `, ${pendingApplications} applications awaiting approval` : ""}`} aria-expanded={open} aria-controls="notification-inbox"><Bell size={20} className={notificationCount > 0 && !open ? "cd-approval-attention" : undefined} />{notificationCount > 0 && <span className="absolute -top-1 -right-1 rounded-full bg-[var(--cd-accent)] text-white min-w-5 px-1 text-xs font-semibold">{notificationCount > 99 ? "99+" : notificationCount}</span>}</button>
    {open && <section id="notification-inbox" aria-label="Notification inbox" className="fixed right-3 top-16 sm:absolute sm:right-0 sm:top-full mt-2 w-[min(420px,calc(100vw-24px))] bg-[var(--cd-surface)] text-[var(--cd-text)] border border-[var(--cd-line)] rounded-2xl shadow-xl overflow-hidden z-50">
      <div className="flex items-center justify-between p-4 border-b border-[var(--cd-line)]"><h2 className="font-semibold">Notifications</h2><button className="p-1" aria-label="Close notifications" onClick={() => setOpen(false)}><X size={18} /></button></div>
      <div className="flex items-center justify-between px-4 py-3 text-sm"><span>{unread_count} unread</span><button disabled={!unread_count} onClick={() => markRead()} className="flex items-center gap-1 disabled:opacity-40"><CheckCheck size={16} /> Mark all read</button></div>
      {pendingApplications > 0 && <Link href="/dashboard/admin/applications" onClick={() => setOpen(false)} className="block border-t border-[var(--cd-line)] bg-amber-50 px-4 py-4 text-sm text-amber-950"><strong>Application approval waiting</strong><p className="mt-1">{pendingApplications} institution application{pendingApplications === 1 ? " needs" : "s need"} your review. View applications.</p></Link>}
      {error && <p role="alert" className="px-4 py-2 text-sm text-red-700">{error} <button onClick={refresh} className="underline">Retry</button></p>}
      <div className="max-h-[55vh] overflow-y-auto">{!results.length && !error && !pendingApplications && <p className="p-6 text-center text-[var(--cd-muted)]">You’re all caught up.</p>}{results.map(item => <Link key={item.id} href={item.url.startsWith("/dashboard") ? item.url : "/dashboard"} onClick={() => { markRead(item.id); setOpen(false); }} className="block px-4 py-4 border-t border-[var(--cd-line)] hover:bg-[var(--cd-soft)]" style={{ background: item.read_at ? undefined : "var(--cd-soft)" }}><div className="flex gap-2 items-start"><span className="mt-1.5 w-2 h-2 shrink-0 rounded-full" style={{ background: item.read_at ? "transparent" : "var(--cd-accent)" }} /><div><p className="font-semibold text-sm">{item.title}</p><p className="text-sm text-[var(--cd-muted)] mt-1">{item.body}</p><time dateTime={item.created_at} className="text-xs text-[var(--cd-muted)] block mt-2">{new Date(item.created_at).toLocaleString()}</time></div></div></Link>)}{next_offset !== null && <button onClick={loadMore} className="w-full py-3 text-sm font-semibold">Load earlier notifications</button>}</div>
      <Link href="/dashboard/settings?tab=Notifications" onClick={() => { setOpen(false); window.dispatchEvent(new Event("credence:notification-settings")); }} className="block border-t border-[var(--cd-line)] px-4 py-3 text-sm font-semibold">Notification settings</Link>
    </section>}
  </div>;
}
