"use client";
import { ActionButton } from "@/components/ui/AnimatedControls";

import WelcomeCard from "./WelcomeCard";
import HeroTile from "./HeroTile";
import DashboardTooltip from "./DashboardTooltip";
import PlatformCharts from "./PlatformCharts";
import CompletionGauges from "./CompletionGauges";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Anchor, ArrowRight, Building2, CheckCircle2, FileCheck2, Gavel, History, ScrollText, Users } from "lucide-react";
import { api } from "@/lib/api";
import StatusBadge from "./StatusBadge";

const HELP = {
  institutions: ["Institutions", "Registered institutions currently active on the Intelligent Academic Credentialing platform."],
  users: ["System users", "User accounts across every platform and institutional role."],
  certificates: ["Total certificates", "All credentials currently recorded in the platform portfolio."],
  verifications: ["Verification checks", "Public certificate verification events recorded in the audit trail."],
};
const EMPTY_STATS = {
  institutions: { total: 0, active: 0, pending_anchor: 0, pending_applications: 0 },
  users: { total: 0, by_role: {} },
  certificates: { total: 0, by_status: { issued: 0, pending: 0, draft: 0, revoked: 0 }, issued_rate: 0 },
  verifications: { total: 0, trend: [] },
  by_institution: [],
  recent_certificates: [],
};
const getList = response => response?.results ?? response ?? [];
const date = value => value ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const action = value => (value || "").replace(/^certificate\./, "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

function Tooltip({ tip }) {
  if (!tip) return null;
  return <div role="tooltip" className="fixed z-[70] max-w-[220px] rounded-lg border border-white/10 bg-[var(--cd-primary)]/[.97] px-3 py-2 text-[11px] leading-relaxed text-[#D8E0E7] shadow-xl pointer-events-none" style={{ left: tip.x, top: tip.y }}><strong className="block text-xs text-white">{tip.title}</strong>{tip.detail}</div>;
}

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState(EMPTY_STATS);
  const [pending, setPending] = useState([]);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tip, setTip] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true); setError("");
      try {
        // Aggregated server-side. The previous implementation read the first
        // page of each list (DRF caps pages at 20 and ignores ?page_size=100),
        // so every total, donut segment and bar on this page was wrong once
        // the platform held more than 20 records.
        const [platform, pendingApps, recentAudit] = await Promise.all([
          api.get("/admin/platform-stats/"),
          api.get("/admin/institutions/pending/?page_size=6"),
          api.get("/audit-logs/?ordering=-timestamp&page_size=6"),
        ]);
        setStats({ ...EMPTY_STATS, ...platform });
        setPending(getList(pendingApps));
        setAudit(getList(recentAudit));
      } catch (cause) { console.error(cause); setError("Some dashboard data could not be loaded. Refresh to try again."); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const status      = stats.certificates.by_status;
  const total       = stats.certificates.total;
  const trend       = stats.verifications.trend;
  const pendingAnchors = stats.institutions.pending_anchor;

  function showTip(event, title, detail) {
    setTip({ x: Math.max(10, Math.min(event.clientX + 12, window.innerWidth - 235)), y: Math.max(10, Math.min(event.clientY + 12, window.innerHeight - 90)), title, detail });
  }
  function focusTip(event, title, detail) {
    const rect = event.currentTarget.getBoundingClientRect();
    setTip({ x: Math.min(rect.right + 10, window.innerWidth - 235), y: rect.top, title, detail });
  }
  const metrics = [
    { key: "institutions", Icon: Building2, value: stats.institutions.total, label: "Institutions", sub: `${stats.institutions.active} active · ${pendingAnchors} awaiting anchor`, href: "/dashboard/admin/institutions", tone: "bg-[var(--cd-tint)] text-[color:var(--cd-primary)]" },
    { key: "users", Icon: Users, value: stats.users.total, label: "System users", sub: `${Object.values(stats.users.by_role).reduce((a, b) => a + b, 0)} counted across platform roles`, href: "/dashboard/admin/users", tone: "bg-[#E6EFE9] text-[#3F7658]" },
    { key: "certificates", Icon: ScrollText, value: total, label: "Total certificates", sub: `${status.issued} issued · ${status.pending} pending · ${status.draft} draft`, href: "/dashboard/certificates", tone: "bg-[var(--cd-tint)] text-[#780110]" },
    { key: "verifications", Icon: FileCheck2, value: stats.verifications.total, label: "Verification checks", sub: "Platform-wide activity", href: "/dashboard/audit", tone: "bg-[var(--cd-tint)] text-[color:var(--cd-primary)]" },
  ];

  return <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5 pb-3">
      <WelcomeCard>
    <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start"><div><p className="text-[11px] font-bold uppercase tracking-[.14em] text-[#687B8E]">Super Admin · Platform Governance</p><h2 className="mt-1 font-serif text-3xl font-bold tracking-tight text-[color:var(--cd-primary)]">Intelligent Academic Credentialing Governance Console</h2><p className="mt-2 max-w-2xl text-sm text-[#687B8E]">Platform-wide oversight of institutions, credentials, verification activity and blockchain integrity.</p></div><div className="flex gap-2"><ActionButton href="/dashboard/admin/applications" className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--cd-line)] bg-white px-3.5 text-sm font-semibold text-[color:var(--cd-primary)] transition hover:-translate-y-0.5 hover:shadow-sm"><Gavel size={15} />Review applications</ActionButton><Link href="/dashboard/admin/anchor" className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--cd-accent)] bg-[var(--cd-tint)] px-3.5 text-sm font-semibold text-[color:var(--cd-accent)] transition hover:-translate-y-0.5 hover:shadow-sm"><Anchor size={15} />Anchor on-chain</Link></div></section>
    {error && <div className="rounded-lg bg-[#F3E4E2] px-4 py-3 text-sm text-[#A6423A]">{error}</div>}

    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({ key, value, label, sub, href }, index) => {
      const series = { institutions: [stats.institutions.active, pendingAnchors, stats.institutions.pending_applications], users: Object.values(stats.users.by_role), certificates: Object.values(status), verifications: trend.map(item => item.count) };
      const captions = { institutions: "Active ? awaiting anchor ? applications", users: "Accounts by role", certificates: "Issued ? pending ? draft ? revoked", verifications: "Verification checks ? last six months" };
      return <DashboardTooltip key={key} title={HELP[key][0]} detail={HELP[key][1]}><HeroTile href={href} label={label} value={loading ? "?" : value} detail={sub} index={index} points={series[key]} chartLabel={captions[key]} line={key === "verifications"} /></DashboardTooltip>;
    })}</section>

      </WelcomeCard>
    <CompletionGauges data={stats.completion} />
    <PlatformCharts stats={stats} loading={loading} />



    <section className="grid gap-4 xl:grid-cols-2"><article className="overflow-hidden rounded-xl border border-[var(--cd-line)] bg-white shadow-[0_7px_24px_rgba(20,43,65,.045)]"><PanelHead title="Pending applications" subtitle="Institution applications awaiting governance review" href="/dashboard/admin/applications" link="Review all" />{pending.length ? <div className="divide-y divide-[var(--cd-line)]">{pending.slice(0, 4).map(app => <div className="flex items-center justify-between gap-4 px-5 py-3" key={app.id}><div className="min-w-0"><p className="truncate text-sm font-semibold text-[color:var(--cd-primary)]">{app.institution_name}</p><p className="mt-0.5 truncate text-xs text-[#687B8E]">{app.country} · {app.contact_email}</p></div><Link className="shrink-0 text-xs font-bold text-[color:var(--cd-accent)] hover:underline" href="/dashboard/admin/applications">Review</Link></div>)}</div> : <div className="flex min-h-[145px] flex-col items-center justify-center p-6 text-center"><CheckCircle2 size={28} className="text-[#3F7658]" /><p className="mt-3 text-sm font-bold text-[color:var(--cd-primary)]">No pending applications</p><p className="mt-1 text-xs text-[#687B8E]">New institution applications requiring review will appear here.</p></div>}</article><article className="cd-scroll-card overflow-hidden rounded-xl border border-[var(--cd-line)] bg-white shadow-[0_7px_24px_rgba(20,43,65,.045)]"><PanelHead title="Recent audit activity" subtitle="Platform-wide administrative events" href="/dashboard/audit" link="Open logs" /><div className="cd-scroll-card-body divide-y divide-[var(--cd-line)]" tabIndex={0} role="region" aria-label="Recent audit activity entries">{audit.map(entry => <div className="flex gap-3 px-5 py-3" key={entry.id}><span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--cd-tint)] text-[color:var(--cd-primary)]"><History size={12} /></span><div className="min-w-0"><p className="truncate text-sm font-medium text-[color:var(--cd-primary)]">{action(entry.action)}</p><p className="mt-0.5 text-[11px] text-[#687B8E]">{date(entry.timestamp)} · {entry.actor_name || entry.actor_email || "System"}</p></div></div>)}{!audit.length && <Empty text="No audit activity recorded yet." />}</div></article></section>

    <section className="overflow-hidden rounded-xl border border-[var(--cd-line)] bg-white shadow-[0_7px_24px_rgba(20,43,65,.045)]"><PanelHead title="Recent certificates" subtitle="Latest credentials recorded across the platform" href="/dashboard/certificates" link="View all" /><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-[var(--cd-tint)] text-[10px] uppercase tracking-wide text-[#687B8E]"><tr>{["Student", "Institution", "Certificate ID", "Programme", "Status", "Recorded"].map(head => <th className="px-4 py-3 font-bold" key={head}>{head}</th>)}</tr></thead><tbody className="divide-y divide-[var(--cd-line)]">{stats.recent_certificates.slice(0, 6).map(cert => <tr className="transition hover:bg-[var(--cd-paper)]" key={cert.id}><td className="px-4 py-3 font-semibold text-[color:var(--cd-primary)]">{cert.student_name}</td><td className="px-4 py-3 text-[#687B8E]">{cert.institution_name}</td><td className="px-4 py-3 font-mono text-[11px] text-[#687B8E]">{cert.certificate_id}</td><td className="px-4 py-3 text-[#687B8E]">{cert.degree_title}</td><td className="px-4 py-3"><StatusBadge status={cert.status} /></td><td className="px-4 py-3 text-[#687B8E]">{date(cert.chain_issued_at || cert.created_at)}</td></tr>)}{!loading && !stats.recent_certificates.length && <tr><td colSpan={6}><Empty text="No certificates have been recorded yet." /></td></tr>}</tbody></table></div><div className="flex justify-between border-t border-[var(--cd-line)] px-4 py-3 text-[11px] text-[#687B8E]"><span>{loading ? "Loading platform data…" : `${total} certificate${total === 1 ? "" : "s"} in this dashboard view`}</span><span>Intelligent Academic Credentialing Platform</span></div></section>
    <Tooltip tip={tip} />
  </div>;
}

function PanelHead({ title, subtitle, href, link }) { return <div className="flex items-start justify-between gap-4 border-b border-[var(--cd-line)] px-5 py-4"><div><h3 className="font-serif text-lg font-bold text-[color:var(--cd-primary)]">{title}</h3><p className="mt-0.5 text-[11px] text-[#687B8E]">{subtitle}</p></div><Link href={href} className="mt-1 shrink-0 text-xs font-bold text-[color:var(--cd-accent)] hover:underline">{link} <ArrowRight className="inline" size={11} /></Link></div>; }
function Empty({ text }) { return <p className="p-7 text-center text-sm text-[#687B8E]">{text}</p>; }
