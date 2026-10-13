"use client";
import { ActionButton } from "@/components/ui/AnimatedControls";
import { Bell, BellRing, CheckCheck } from "lucide-react";
import { useNotifications } from "@/components/NotificationProvider";

export default function NotificationSettingsPanel() {
  const { preferences, permission, busy, error, setPush, sendTest, unread_count } = useNotifications();
  return <section className="cd-card p-6 space-y-5">
    <div><h3 className="text-xl font-semibold flex items-center gap-2"><Bell size={22} /> Notifications</h3><p className="mt-2 text-[var(--cd-muted)]">Credential approvals, issuance and revocation updates appear in your notification inbox.</p></div>
    <div className="flex items-center justify-between gap-4 border-y border-[var(--cd-line)] py-4"><div><h4 className="font-semibold">System inbox</h4><p className="text-sm text-[var(--cd-muted)]">Always available while signed in · {unread_count} unread</p></div><CheckCheck size={22} className="text-[var(--cd-primary)]" /></div>
    <div className="flex items-center justify-between gap-4"><div><h4 className="font-semibold">Browser push</h4><p className="text-sm text-[var(--cd-muted)]">Get an alert even when the dashboard is closed. Private details stay in your inbox.</p><p className="text-sm mt-1">{preferences?.push_enabled ? "Enabled for your account" : "Off"} · Browser permission: {permission}</p></div><ActionButton type="button" role="switch" aria-checked={!!preferences?.push_enabled} disabled={busy || !preferences || (!preferences.push_configured && !preferences.push_enabled)} onClick={() => setPush(!preferences.push_enabled)} className="cred-btn cred-btn-primary gap-2 self-start"><BellRing size={17} />{preferences?.push_enabled ? "Disable push" : "Enable push"}</ActionButton></div>
    {preferences && !preferences.push_configured && <p className="text-sm text-[var(--cd-muted)]">Background push is awaiting server configuration. Your system inbox remains available.</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <button type="button" className="cred-btn cred-btn-secondary" disabled={busy || !preferences} onClick={sendTest}>Send test notification</button>
  </section>;
}
