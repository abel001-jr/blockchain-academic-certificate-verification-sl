"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Anchor, ArrowRight, Building2, CheckCircle2, FileCheck2, Gavel, History, ScrollText, Users } from "lucide-react";
import { api } from "@/lib/api";
import StatusBadge from "./StatusBadge";

const STATUS = {
  issued: { label: "Issued", color: "#3f7658" },
  pending: { label: "Pending", color: "#c59a3a" },
  draft: { label: "Draft", color: "#9aa8b4" },
  revoked: { label: "Revoked", color: "#a6423a" },
};
const HELP = {
  institutions: ["Institutions", "Registered institutions currently active on the Credence platform."],
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
const monthLabel = ({ year, month }) => new Date(year, month - 1, 1).toLocaleDateString("en-GB", { month: "short" });
const action = value => (value || "").replace(/^certificate\./, "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

function Tooltip({ tip }) {
  if (!tip) return null;
  return <div role="tooltip" className="fixed z-[70] max-w-[220px] rounded-lg border border-white/10 bg-[#142B41]/[.97] px-3 py-2 text-[11px] leading-relaxed text-[#D8E0E7] shadow-xl pointer-events-none" style={{ left: tip.x, top: tip.y }}><strong className="block text-xs text-white">{tip.title}</strong>{tip.detail}</div>;
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
  const byInstitution = stats.by_institution;
  const maxInstitution = Math.max(...byInstitution.map(item => item.total), 1);
  const maxTrend    = Math.max(...trend.map(item => item.count), 1);
  const latest      = trend.at(-1)?.count ?? 0;
  const previous    = trend.at(-2)?.count ?? 0;
  const change      = previous ? Math.round((latest - previous) / previous * 100) : null;
  const pendingAnchors = stats.institutions.pending_anchor;

  function showTip(event, title, detail) {
    setTip({ x: Math.max(10, Math.min(event.clientX + 12, window.innerWidth - 235)), y: Math.max(10, Math.min(event.clientY + 12, window.innerHeight - 90)), title, detail });
  }
  function focusTip(event, title, detail) {
    const rect = event.currentTarget.getBoundingClientRect();
    setTip({ x: Math.min(rect.right + 10, window.innerWidth - 235), y: rect.top, title, detail });
  }
  function showDonutTip(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const angle = (Math.atan2(event.clientY - rect.top - rect.height / 2, event.clientX - rect.left - rect.width / 2) * 180 / Math.PI + 450) % 360;
    const ordered = ["issued", "pending", "draft", "revoked"];
    let boundary = 0;
    const key = ordered.find(key => {
      boundary += total ? status[key] / total * 360 : 360;
      return angle <= boundary;
    }) ?? "issued";
    const meta = STATUS[key];
    showTip(event, `${meta.label} certificates`, `${status[key]} certificate${status[key] === 1 ? "" : "s"} (${total ? Math.round(status[key] / total * 100) : 0}% of the portfolio).`);
  }

  const metrics = [
    { key: "institutions", Icon: Building2, value: stats.institutions.total, label: "Institutions", sub: `${stats.institutions.active} active · ${pendingAnchors} awaiting anchor`, href: "/dashboard/admin/institutions", tone: "bg-[#EFF3F6] text-[#142B41]" },
    { key: "users", Icon: Users, value: stats.users.total, label: "System users", sub: `${Object.values(stats.users.by_role).reduce((a, b) => a + b, 0)} counted across platform roles`, href: "/dashboard/admin/users", tone: "bg-[#E6EFE9] text-[#3F7658]" },
    { key: "certificates", Icon: ScrollText, value: total, label: "Total certificates", sub: `${status.issued} issued · ${status.pending} pending · ${status.draft} draft`, href: "/dashboard/certificates", tone: "bg-[#F2E8D2] text-[#8A6A22]" },
    { key: "verifications", Icon: FileCheck2, value: stats.verifications.total, label: "Verification checks", sub: "Platform-wide activity", href: "/dashboard/audit", tone: "bg-[#EFF3F6] text-[#142B41]" },
  ];

  return <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5 pb-3">
    <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start"><div><p className="text-[11px] font-bold uppercase tracking-[.14em] text-[#687B8E]">Super Admin · Platform Governance</p><h2 className="mt-1 font-serif text-3xl font-bold tracking-tight text-[#142B41]">Credence Governance Console</h2><p className="mt-2 max-w-2xl text-sm text-[#687B8E]">Platform-wide oversight of institutions, credentials, verification activity and blockchain integrity.</p></div><div className="flex gap-2"><Link href="/dashboard/admin/applications" className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#E4E0D5] bg-white px-3.5 text-sm font-semibold text-[#142B41] transition hover:-translate-y-0.5 hover:shadow-sm"><Gavel size={15} />Review applications</Link><Link href="/dashboard/admin/anchor" className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#D8BF84] bg-[#F2E8D2] px-3.5 text-sm font-semibold text-[#795A18] transition hover:-translate-y-0.5 hover:shadow-sm"><Anchor size={15} />Anchor on-chain</Link></div></section>
    {error && <div className="rounded-lg bg-[#F3E4E2] px-4 py-3 text-sm text-[#A6423A]">{error}</div>}

    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({ key, Icon, value, label, sub, href, tone }) => <Link key={key} href={href} onMouseEnter={e => showTip(e, ...HELP[key])} onMouseMove={e => showTip(e, ...HELP[key])} onMouseLeave={() => setTip(null)} onFocus={e => focusTip(e, ...HELP[key])} onBlur={() => setTip(null)} className="group relative min-h-[126px] rounded-xl border border-[#E4E0D5] bg-white px-4 py-4 shadow-[0_7px_24px_rgba(20,43,65,.045)] transition hover:-translate-y-0.5 hover:border-[#D6C69F] hover:shadow-md"><span className="absolute right-3 top-3 grid h-[18px] w-[18px] place-items-center rounded-full border border-[#E4E0D5] text-[10px] text-[#687B8E]" aria-hidden="true">i</span><span className={`mb-3 grid h-8 w-8 place-items-center rounded-lg ${tone}`}><Icon size={16} /></span><p className="font-serif text-[28px] font-bold leading-none text-[#142B41]">{loading ? "—" : value}</p><p className="mt-1 text-sm font-semibold text-[#142B41]">{label}</p><p className="mt-1 text-[11px] text-[#687B8E]">{sub}</p><ArrowRight size={15} className="absolute bottom-3 right-4 text-[#C59A3A] transition-transform group-hover:translate-x-1" /></Link>)}</section>

    <section className="grid gap-4 xl:grid-cols-[.9fr_1.35fr]">
      <article className="overflow-hidden rounded-xl border border-[#E4E0D5] bg-white shadow-[0_7px_24px_rgba(20,43,65,.045)]"><PanelHead title="Certificate status" subtitle="Current platform credential portfolio" href="/dashboard/certificates" link="View all" /><div className="flex min-h-[250px] flex-col items-center justify-center gap-7 p-5 sm:flex-row"><div className="relative h-40 w-40 shrink-0 cursor-help rounded-full" onMouseMove={showDonutTip} onMouseLeave={() => setTip(null)} style={{ background: total ? `conic-gradient(#3f7658 0 ${status.issued / total * 100}%, #c59a3a 0 ${(status.issued + status.pending) / total * 100}%, #9aa8b4 0 ${(status.issued + status.pending + status.draft) / total * 100}%, #a6423a 0)` : "#edf0f2" }}><div className="absolute inset-[30px] grid place-items-center rounded-full bg-white text-center"><strong className="block font-serif text-3xl text-[#142B41]">{loading ? "—" : total}</strong><span className="text-[10px] text-[#687B8E]">Certificates</span></div></div><div className="min-w-[145px] space-y-3">{Object.entries(STATUS).map(([key, meta]) => <button type="button" key={key} onMouseEnter={e => showTip(e, `${meta.label} certificates`, `${status[key]} certificate${status[key] === 1 ? "" : "s"} currently ${key === "pending" ? "awaiting action" : `in ${meta.label.toLowerCase()} status`}.`)} onMouseLeave={() => setTip(null)} onFocus={e => focusTip(e, `${meta.label} certificates`, `${status[key]} certificate${status[key] === 1 ? "" : "s"}.`)} onBlur={() => setTip(null)} className="flex w-full items-center justify-between gap-6 text-left text-xs"><span className="flex items-center gap-2 text-[#687B8E]"><i className="h-2 w-2 rounded-full" style={{ background: meta.color }} />{meta.label}</span><b className="text-[#142B41]">{status[key]}</b></button>)}</div></div><div className="mx-5 flex justify-between border-t border-[#E4E0D5] py-3 text-xs text-[#687B8E]"><span>Issued rate</span><strong className="text-[#3F7658]">{stats.certificates.issued_rate}%</strong></div></article>
      <article className="overflow-hidden rounded-xl border border-[#E4E0D5] bg-white shadow-[0_7px_24px_rgba(20,43,65,.045)]"><PanelHead title="Verification activity" subtitle="Verification checks over the last six months" href="/dashboard/audit" link="Open audit logs" /><div className="p-5"><div className="relative flex h-[205px] items-end gap-3 border-b border-[#E4E0D5] bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_40px,rgba(228,224,213,.75)_41px,rgba(228,224,213,.75)_42px)] px-2 pb-7">{trend.map(point => <div key={`${point.year}-${point.month}`} className="group relative flex h-full flex-1 items-end" onMouseEnter={e => showTip(e, monthLabel(point), `${point.count} verification check${point.count === 1 ? "" : "s"} recorded.`)} onMouseMove={e => showTip(e, monthLabel(point), `${point.count} verification check${point.count === 1 ? "" : "s"} recorded.`)} onMouseLeave={() => setTip(null)}><div className="w-full rounded-t bg-[#142B41] transition-opacity group-hover:opacity-80" style={{ height: `${Math.max(point.count ? 7 : 0, point.count / maxTrend * 100)}%` }} /><span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-[#687B8E]">{monthLabel(point)}</span></div>)}</div><div className="mt-4 flex flex-wrap gap-7"><Summary value={stats.verifications.total} label="Total checks" /><Summary value={latest} label="Latest month" /><Summary value={change === null ? "—" : `${change >= 0 ? "+" : ""}${change}%`} label="Month-on-month" /></div></div></article>
    </section>

    <section className="grid gap-4 xl:grid-cols-[1.35fr_.85fr]"><article className="overflow-hidden rounded-xl border border-[#E4E0D5] bg-white shadow-[0_7px_24px_rgba(20,43,65,.045)]"><PanelHead title="Certificates by institution" subtitle="Credential volume across registered institutions" href="/dashboard/admin/institutions" link="View institutions" /><div className="space-y-4 p-5">{byInstitution.length === 0 ? <Empty text="No institutions or certificates recorded yet." /> : byInstitution.map(item => <Link key={item.institution_id} href={`/dashboard/certificates?institution=${item.institution_id}`} className="grid grid-cols-[minmax(110px,160px)_1fr_30px] items-center gap-3 text-xs rounded-md py-0.5 px-1 -mx-1 hover:bg-[#F8F7F2] transition-colors"><span className="truncate text-[#142B41]" title={item.name}>{item.name}</span><div className="h-2 overflow-hidden rounded-full bg-[#EDF0F2]"><div className="h-full rounded-full bg-[#142B41]" onMouseEnter={e => showTip(e, item.name, `${item.total} certificate${item.total === 1 ? "" : "s"} recorded.`)} onMouseMove={e => showTip(e, item.name, `${item.total} certificate${item.total === 1 ? "" : "s"} recorded.`)} onMouseLeave={() => setTip(null)} style={{ width: `${item.total / maxInstitution * 100}%` }} /></div><b className="text-right text-[#142B41]">{item.total}</b></Link>)}</div></article><article className="overflow-hidden rounded-xl border border-[#E4E0D5] bg-white shadow-[0_7px_24px_rgba(20,43,65,.045)]"><PanelHead title="Blockchain health" subtitle="Credential anchoring infrastructure" href="/dashboard/blockchain" link="Details" /><div className="p-5"><div className="flex items-center justify-between border-b border-[#E4E0D5] pb-3"><span className="flex items-center gap-2 text-sm font-bold text-[#142B41]"><i className="h-2 w-2 rounded-full bg-[#3F7658] shadow-[0_0_0_4px_#E6EFE9]" />Platform healthy</span><span className="text-xs font-bold text-[#3F7658]">Operational</span></div><div className="mt-4 space-y-3 text-xs">{[["Network", "Ethereum"], ["On-chain credentials", status.issued], ["Pending anchors", pendingAnchors], ["Storage", "IPFS · Pinata"], ["Backend", "Django REST"]].map(([label, value]) => <div className="flex justify-between gap-4" key={label}><span className="text-[#687B8E]">{label}</span><strong className="text-right text-[#142B41]">{value}</strong></div>)}</div></div></article></section>

    <section className="grid gap-4 xl:grid-cols-2"><article className="overflow-hidden rounded-xl border border-[#E4E0D5] bg-white shadow-[0_7px_24px_rgba(20,43,65,.045)]"><PanelHead title="Pending applications" subtitle="Institution applications awaiting governance review" href="/dashboard/admin/applications" link="Review all" />{pending.length ? <div className="divide-y divide-[#E4E0D5]">{pending.slice(0, 4).map(app => <div className="flex items-center justify-between gap-4 px-5 py-3" key={app.id}><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#142B41]">{app.institution_name}</p><p className="mt-0.5 truncate text-xs text-[#687B8E]">{app.country} · {app.contact_email}</p></div><Link className="shrink-0 text-xs font-bold text-[#C59A3A] hover:underline" href="/dashboard/admin/applications">Review</Link></div>)}</div> : <div className="flex min-h-[145px] flex-col items-center justify-center p-6 text-center"><CheckCircle2 size={28} className="text-[#3F7658]" /><p className="mt-3 text-sm font-bold text-[#142B41]">No pending applications</p><p className="mt-1 text-xs text-[#687B8E]">New institution applications requiring review will appear here.</p></div>}</article><article className="overflow-hidden rounded-xl border border-[#E4E0D5] bg-white shadow-[0_7px_24px_rgba(20,43,65,.045)]"><PanelHead title="Recent audit activity" subtitle="Platform-wide administrative events" href="/dashboard/audit" link="Open logs" /><div className="divide-y divide-[#E4E0D5]">{audit.slice(0, 4).map(entry => <div className="flex gap-3 px-5 py-3" key={entry.id}><span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#EFF3F6] text-[#142B41]"><History size={12} /></span><div className="min-w-0"><p className="truncate text-sm font-medium text-[#142B41]">{action(entry.action)}</p><p className="mt-0.5 text-[11px] text-[#687B8E]">{date(entry.timestamp)} · {entry.actor_name || entry.actor_email || "System"}</p></div></div>)}{!audit.length && <Empty text="No audit activity recorded yet." />}</div></article></section>

    <section className="overflow-hidden rounded-xl border border-[#E4E0D5] bg-white shadow-[0_7px_24px_rgba(20,43,65,.045)]"><PanelHead title="Recent certificates" subtitle="Latest credentials recorded across the platform" href="/dashboard/certificates" link="View all" /><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-[#FCFBF8] text-[10px] uppercase tracking-wide text-[#687B8E]"><tr>{["Student", "Institution", "Certificate ID", "Programme", "Status", "Recorded"].map(head => <th className="px-4 py-3 font-bold" key={head}>{head}</th>)}</tr></thead><tbody className="divide-y divide-[#E4E0D5]">{stats.recent_certificates.slice(0, 6).map(cert => <tr className="transition hover:bg-[#F8F7F2]" key={cert.id}><td className="px-4 py-3 font-semibold text-[#142B41]">{cert.student_name}</td><td className="px-4 py-3 text-[#687B8E]">{cert.institution_name}</td><td className="px-4 py-3 font-mono text-[11px] text-[#687B8E]">{cert.certificate_id}</td><td className="px-4 py-3 text-[#687B8E]">{cert.degree_title}</td><td className="px-4 py-3"><StatusBadge status={cert.status} /></td><td className="px-4 py-3 text-[#687B8E]">{date(cert.chain_issued_at || cert.created_at)}</td></tr>)}{!loading && !stats.recent_certificates.length && <tr><td colSpan={6}><Empty text="No certificates have been recorded yet." /></td></tr>}</tbody></table></div><div className="flex justify-between border-t border-[#E4E0D5] px-4 py-3 text-[11px] text-[#687B8E]"><span>{loading ? "Loading platform data…" : `${total} certificate${total === 1 ? "" : "s"} in this dashboard view`}</span><span>Credence Platform</span></div></section>
    <Tooltip tip={tip} />
  </div>;
}

function PanelHead({ title, subtitle, href, link }) { return <div className="flex items-start justify-between gap-4 border-b border-[#E4E0D5] px-5 py-4"><div><h3 className="font-serif text-lg font-bold text-[#142B41]">{title}</h3><p className="mt-0.5 text-[11px] text-[#687B8E]">{subtitle}</p></div><Link href={href} className="mt-1 shrink-0 text-xs font-bold text-[#C59A3A] hover:underline">{link} <ArrowRight className="inline" size={11} /></Link></div>; }
function Summary({ value, label }) { return <div><strong className="block font-serif text-lg text-[#142B41]">{value}</strong><span className="text-[11px] text-[#687B8E]">{label}</span></div>; }
function Empty({ text }) { return <p className="p-7 text-center text-sm text-[#687B8E]">{text}</p>; }
