"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight, BadgeCheck, BarChart3, Building2, CheckCircle2,
  FilePlus2, FileText, Loader2, ShieldCheck, UserPlus,
} from "lucide-react";
import { api, jwtPayload } from "@/lib/api";
import StatusBadge from "@/components/dashboard/StatusBadge";
import DashboardTooltip from "@/components/dashboard/DashboardTooltip";

const STATUS_META = [
  { key: "issued", label: "Issued", color: "bg-[#3F7658]", text: "text-[#3F7658]" },
  { key: "pending", label: "Pending", color: "bg-[#C59A3A]", text: "text-[#8A6A22]" },
  { key: "draft", label: "Draft", color: "bg-[#9AA8B4]", text: "text-[#687B8E]" },
  { key: "revoked", label: "Revoked", color: "bg-[#A6423A]", text: "text-[#A6423A]" },
];

function listFrom(response) {
  return response?.results ?? response ?? [];
}

function statusCounts(certificates) {
  return certificates.reduce((counts, certificate) => {
    const key = certificate.status === "issued" || certificate.status === "draft" || certificate.status === "revoked"
      ? certificate.status
      : "pending";
    counts[key] += 1;
    return counts;
  }, { issued: 0, pending: 0, draft: 0, revoked: 0 });
}

function Metric({ value, label, detail, accent, href }) {
  const content = (
    <div className="group relative flex min-h-[218px] flex-col rounded-xl border border-[#E4E0D5] bg-white px-7 py-7 shadow-[0_7px_24px_rgba(20,43,65,.035)] transition hover:-translate-y-0.5 hover:border-[#D8BF84] hover:shadow-md sm:min-h-[230px] sm:px-8 sm:py-8">
      <strong className={`font-serif text-[52px] font-bold leading-none sm:text-[58px] ${accent ? "text-[#B48623]" : "text-[#142B41]"}`}>{value}</strong>
      <span className="mt-6 text-lg font-bold leading-tight text-[#142B41] sm:text-xl">{label}</span>
      <span className="mt-4 max-w-[calc(100%-2rem)] pr-2 text-sm leading-snug text-[#687B8E] sm:text-base">{detail}</span>
      <ArrowRight size={18} className="absolute bottom-7 right-7 text-[#C59A3A] transition-transform group-hover:translate-x-1 sm:bottom-8 sm:right-8" />
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function StatusAnalytics({ counts, total }) {
  return (
    <article className="rounded-xl border border-[#E4E0D5] bg-white p-5 shadow-[0_7px_24px_rgba(20,43,65,.035)]">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div><h3 className="font-serif text-xl font-bold text-[#142B41]">Certificates by status</h3><p className="mt-1 text-xs text-[#687B8E]">Current credential portfolio</p></div>
        <DashboardTooltip title="Portfolio status" detail="Issued credentials are anchored, while pending credentials are still moving through the approval workflow."><span tabIndex={0} className="grid h-5 w-5 place-items-center rounded-full border border-[#E4E0D5] text-[10px] text-[#687B8E]">i</span></DashboardTooltip>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-[#EDF0F2]">
        {STATUS_META.map(({ key, color }) => counts[key] > 0 && <div key={key} className={`${color} transition-all duration-500`} style={{ width: `${(counts[key] / Math.max(total, 1)) * 100}%` }} />)}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        {STATUS_META.map(({ key, label, color, text }) => <div key={key} className="flex items-center gap-1.5 text-xs text-[#687B8E]"><span className={`h-2 w-2 rounded-full ${color}`} />{label}<b className={text}>{counts[key]}</b></div>)}
        <span className="ml-auto text-xs text-[#687B8E]">Total <b className="text-[#142B41]">{total}</b></span>
      </div>
    </article>
  );
}

function Donut({ counts, total }) {
  const issued = total ? (counts.issued / total) * 100 : 0;
  const pending = issued + (total ? (counts.pending / total) * 100 : 0);
  const draft = pending + (total ? (counts.draft / total) * 100 : 0);
  return (
    <div className="relative h-44 w-44 shrink-0 rounded-full" style={{ background: total ? `conic-gradient(#3F7658 0 ${issued}%, #C59A3A ${issued}% ${pending}%, #9AA8B4 ${pending}% ${draft}%, #A6423A ${draft}% 100%)` : "#EDF0F2" }}>
      <div className="absolute inset-8 grid place-items-center rounded-full bg-white text-center"><strong className="font-serif text-3xl text-[#142B41]">{total}</strong><span className="text-[11px] text-[#687B8E]">Total</span></div>
    </div>
  );
}

function VerificationActivity({ entries, loading }) {
  const verificationEntries = entries.filter((entry) => entry.action === "certificate.verified").slice(0, 4);
  return (
    <article className="overflow-hidden rounded-xl border border-[#E4E0D5] bg-white shadow-[0_7px_24px_rgba(20,43,65,.035)]">
      <div className="flex items-start justify-between gap-3 border-b border-[#E4E0D5] px-5 py-4"><div><h3 className="font-serif text-xl font-bold text-[#142B41]">Verification activity</h3><p className="mt-1 text-xs text-[#687B8E]">Recent public certificate checks</p></div><Link href="/dashboard/audit" className="mt-1 text-xs font-bold text-[#C59A3A] hover:underline">Audit logs <ArrowRight className="inline" size={11} /></Link></div>
      <div className="divide-y divide-[#E4E0D5]">
        {loading && <p className="px-5 py-10 text-center text-sm text-[#687B8E]">Loading verification activityâ€¦</p>}
        {!loading && verificationEntries.map((entry) => <div key={entry.id} className="flex gap-3 px-5 py-4"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#E7F1EB] text-[#3F7658]"><CheckCircle2 size={14} /></span><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#142B41]">{entry.detail || "Certificate verification completed"}</p><p className="mt-1 text-xs text-[#687B8E]">{entry.timestamp ? new Date(entry.timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Recent check"}</p></div></div>)}
        {!loading && !verificationEntries.length && <div className="px-5 py-10 text-center"><CheckCircle2 size={24} className="mx-auto text-[#3F7658]" /><p className="mt-3 text-sm font-bold text-[#142B41]">No verification activity yet</p><p className="mt-1 text-xs text-[#687B8E]">Public certificate checks will appear here.</p><Link href="/dashboard/audit" className="mt-4 inline-block text-xs font-bold text-[#C59A3A] hover:underline">Open audit logs <ArrowRight className="inline" size={11} /></Link></div>}
      </div>
    </article>
  );
}

export default function RegistrarDashboard() {
  const [certificates, setCertificates] = useState([]);
  const [activity, setActivity] = useState([]);
  const [institution, setInstitution] = useState(null);
  const [officers, setOfficers] = useState("â€”");
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const certificateResponse = await api.get("/certificates/?ordering=-created_at&page_size=100");
        setCertificates(listFrom(certificateResponse));
        const payload = jwtPayload();
        if (payload?.institution) {
          try { setInstitution(await api.get(`/institutions/${payload.institution}/`)); } catch {}
        }
        try {
          const [vcs, chancellors] = await Promise.all([api.get("/users/?role=vc"), api.get("/users/?role=chancellor")]);
          setOfficers(listFrom(vcs).length + listFrom(chancellors).length);
        } catch {}
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }

    async function loadActivity() {
      try {
        const response = await api.get("/audit-logs/?ordering=-timestamp&page_size=100");
        setActivity(listFrom(response));
      } catch {}
      finally { setActivityLoading(false); }
    }

    loadDashboard();
    loadActivity();
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={28} className="animate-spin text-[#142B41]" /></div>;

  const counts = statusCounts(certificates);
  const total = certificates.length;
  const pendingApproval = counts.pending;
  const verificationChecks = activity.filter((entry) => entry.action === "certificate.verified").length;
  const actionLabel = pendingApproval ? `${pendingApproval} certificate${pendingApproval === 1 ? " is" : "s are"} awaiting your approval` : "Your certificate workflow is clear";
  const actionDetail = pendingApproval ? "Review certificates before they can be issued and anchored on-chain." : "Issue a new credential or review the current certificate portfolio.";
  const programmes = Object.entries(certificates.reduce((result, certificate) => {
    const name = certificate.degree_title || "Other programmes";
    result[name] = (result[name] ?? 0) + 1;
    return result;
  }, {})).sort(([, first], [, second]) => second - first).slice(0, 4);
  const largestProgramme = Math.max(...programmes.map(([, count]) => count), 1);

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5 pb-3">
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start"><div><p className="text-[11px] font-bold uppercase tracking-[.14em] text-[#687B8E]">Registrar portal</p><h2 className="mt-1 font-serif text-4xl font-bold tracking-tight text-[#142B41]">{institution?.name ?? "Your institution"}</h2><p className="mt-2 text-sm text-[#687B8E]">Institution ID&nbsp; {institution?.institution_id ?? "â€”"}</p></div><span className={`inline-flex items-center gap-2 self-start rounded-full px-4 py-2 text-xs font-bold ${institution?.is_chain_active ? "bg-[#F2E8D2] text-[#8A6A22]" : "bg-[#EDF0F2] text-[#687B8E]"}`}><span className={`h-2 w-2 rounded-full ${institution?.is_chain_active ? "bg-[#C59A3A]" : "bg-[#9AA8B4]"}`} />{institution?.is_chain_active ? "Anchored on-chain" : "Awaiting on-chain anchor"}</span></section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"><DashboardTooltip title="Certificate portfolio" detail="All credentials currently recorded for your institution."><span><Metric value={total} label="Total certificates" detail="Current institution portfolio" href="/dashboard/certificates" /></span></DashboardTooltip><DashboardTooltip title="Issued credentials" detail="Certificates that completed approval and finalization."><span><Metric value={counts.issued} label="Issued credentials" detail="All anchored on-chain" href="/dashboard/certificates" /></span></DashboardTooltip><DashboardTooltip title="Pending approval" detail="Credentials waiting for VC or Dean approval."><span><Metric value={pendingApproval} label="Pending approval" detail="Awaiting officer review" accent href="/dashboard/certificates" /></span></DashboardTooltip><DashboardTooltip title="Verification checks" detail="Public verification events recorded since the institution joined."><span><Metric value={verificationChecks} label="Verification checks" detail="Since institution joined" href="/dashboard/audit" /></span></DashboardTooltip></section>

      <StatusAnalytics counts={counts} total={total} />

      <section className="flex flex-col justify-between gap-5 rounded-xl bg-[#142B41] px-5 py-5 shadow-[0_10px_28px_rgba(20,43,65,.12)] sm:flex-row sm:items-center"><div><p className="text-[11px] font-bold uppercase tracking-[.14em] text-[#E9DAB8]">Action required</p><h3 className="mt-1 text-xl font-bold text-white">{actionLabel}</h3><p className="mt-2 text-sm text-white/65">{actionDetail}</p></div><Link href="/dashboard/certificates" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[#C59A3A] px-4 py-3 text-sm font-bold text-[#142B41] transition hover:brightness-105">{pendingApproval ? "Review pending" : "Review portfolio"} <ArrowRight size={15} /></Link></section>

      <section><p className="mb-3 text-[11px] font-bold uppercase tracking-[.14em] text-[#687B8E]">Quick actions</p><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"><Link href="/dashboard/certificates/new" className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#142B41] text-sm font-bold text-white transition hover:-translate-y-0.5 hover:shadow-md"><FilePlus2 size={16} /> Issue certificate</Link><Link href="/dashboard/officers" className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-[#D8BF84] bg-white text-sm font-semibold text-[#142B41] transition hover:-translate-y-0.5 hover:bg-[#FCFBF8]"><UserPlus size={16} /> Add officer</Link><Link href="/dashboard/certificates" className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-[#E4E0D5] bg-white text-sm font-semibold text-[#142B41] transition hover:-translate-y-0.5 hover:bg-[#FCFBF8]"><BadgeCheck size={16} /> Review pending</Link><Link href="/dashboard/reports" className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-[#E4E0D5] bg-white text-sm font-semibold text-[#142B41] transition hover:-translate-y-0.5 hover:bg-[#FCFBF8]"><BarChart3 size={16} /> View reports</Link></div></section>

      <section className="grid gap-4 xl:grid-cols-[1.28fr_.72fr]"><article className="overflow-hidden rounded-xl border border-[#E4E0D5] bg-white shadow-[0_7px_24px_rgba(20,43,65,.035)]"><div className="flex items-center justify-between border-b border-[#E4E0D5] px-5 py-4"><h3 className="font-serif text-xl font-bold text-[#142B41]">Recent certificates</h3><Link href="/dashboard/certificates" className="text-xs font-bold text-[#C59A3A] hover:underline">View all <ArrowRight className="inline" size={11} /></Link></div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left"><thead className="bg-[#FCFBF8] text-[10px] uppercase tracking-wider text-[#687B8E]"><tr>{["Student", "Programme", "Certificate ID", "Status", "Issued"].map((heading) => <th key={heading} className="px-4 py-3 font-bold">{heading}</th>)}</tr></thead><tbody className="divide-y divide-[#E4E0D5]">{certificates.slice(0, 6).map((certificate) => <tr key={certificate.id} className="transition hover:bg-[#FCFBF8]"><td className="px-4 py-3 text-sm font-semibold text-[#142B41]">{certificate.student_name}</td><td className="px-4 py-3 text-xs text-[#687B8E]">{certificate.degree_title}</td><td className="px-4 py-3 font-mono text-[10px] text-[#687B8E]">{certificate.certificate_id}</td><td className="px-4 py-3"><StatusBadge status={certificate.status} /></td><td className="px-4 py-3 text-xs text-[#687B8E]">{certificate.created_at ? new Date(certificate.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "â€”"}</td></tr>)}{!certificates.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-[#687B8E]">No certificates yet.</td></tr>}</tbody></table></div></article><VerificationActivity entries={activity} loading={activityLoading} /></section>

      <section className="grid gap-4 xl:grid-cols-[1.25fr_.75fr]"><article className="overflow-hidden rounded-xl border border-[#E4E0D5] bg-white shadow-[0_7px_24px_rgba(20,43,65,.035)]"><div className="flex items-start justify-between gap-3 border-b border-[#E4E0D5] px-5 py-4"><div><h3 className="font-serif text-xl font-bold text-[#142B41]">Certificate analytics</h3><p className="mt-1 text-xs text-[#687B8E]">Current credential portfolio</p></div><Link href="/dashboard/certificates" className="text-xs font-bold text-[#C59A3A] hover:underline">View certificates <ArrowRight className="inline" size={11} /></Link></div><div className="grid gap-6 p-5 md:grid-cols-[190px_1fr]"><div className="flex items-center justify-center"><Donut counts={counts} total={total} /></div><div className="space-y-4"><h4 className="text-sm font-bold text-[#142B41]">Certificates by programme</h4>{programmes.length ? programmes.map(([name, count]) => <div key={name}><div className="mb-1.5 flex justify-between gap-3 text-xs"><span className="truncate text-[#687B8E]">{name}</span><b className="text-[#142B41]">{count}</b></div><div className="h-2 overflow-hidden rounded-full bg-[#EDF0F2]"><div className="h-full rounded-full bg-[#142B41]" style={{ width: `${(count / largestProgramme) * 100}%` }} /></div></div>) : <p className="text-sm text-[#687B8E]">No programme data yet.</p>}<div className="mt-5 space-y-3 border-t border-[#E4E0D5] pt-4 text-xs"><div className="flex justify-between text-[#687B8E]"><span>Issued credentials</span><b className="text-[#3F7658]">{counts.issued} of {total}</b></div><div className="flex justify-between text-[#687B8E]"><span>Awaiting approval</span><b className="text-[#8A6A22]">{counts.pending} of {total}</b></div></div></div></div></article><article className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-[#E4E0D5] bg-white p-6 text-center shadow-[0_7px_24px_rgba(20,43,65,.035)]"><Building2 size={25} className="text-[#C59A3A]" /><p className="mt-3 text-sm font-bold text-[#142B41]">{officers === "â€”" ? "Institution officers" : `${officers} institution officers`}</p><p className="mt-1 max-w-xs text-xs text-[#687B8E]">Actions performed by institution officers will appear in your audit logs.</p><Link href="/dashboard/audit" className="mt-4 text-xs font-bold text-[#C59A3A] hover:underline">Open audit logs <ArrowRight className="inline" size={11} /></Link></article></section>
    </div>
  );
}
