"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Clock3, FileCheck2, Gavel, Loader2, ScrollText } from "lucide-react";
import { api } from "@/lib/api";
import { ROLES } from "@/lib/useAuth";
import StatCard from "@/components/dashboard/StatCard";
import StatusBadge from "@/components/dashboard/StatusBadge";
import ActivityFeed from "@/components/dashboard/ActivityFeed";
import DashboardTooltip from "@/components/dashboard/DashboardTooltip";

function monthCount(entries) {
  const now = new Date();
  return entries.filter((entry) => {
    const date = new Date(entry.timestamp);
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }).length;
}

function ApprovalBars({ pending, approved }) {
  const total = pending + approved || 1;
  return (
    <div className="space-y-3">
      <div className="flex h-3 overflow-hidden rounded-full bg-[#EDF0F2]"><div className="bg-[#C59A3A]" style={{ width: `${(pending / total) * 100}%` }} /><div className="bg-[#3F7658]" style={{ width: `${(approved / total) * 100}%` }} /></div>
      <div className="flex justify-between gap-4 text-xs"><span className="flex items-center gap-1.5 text-[#687B8E]"><i className="h-2 w-2 rounded-full bg-[#C59A3A]" />Awaiting your signature <b className="text-[#142B41]">{pending}</b></span><span className="flex items-center gap-1.5 text-[#687B8E]"><i className="h-2 w-2 rounded-full bg-[#3F7658]" />Approved this month <b className="text-[#142B41]">{approved}</b></span></div>
    </div>
  );
}

export default function OfficerDashboard({ role }) {
  const [pending, setPending] = useState([]);
  const [approved, setApproved] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const isVc = role === ROLES.VC;
  const title = isVc ? "Vice Chancellor" : "Dean";
  const statusFilter = isVc ? "pending_vc" : "pending_chancellor";
  const approvalAction = isVc ? "certificate.vc_approved" : "certificate.chancellor_approved";

  useEffect(() => {
    async function load() {
      try {
        const data = await api.get(`/certificates/?status=${statusFilter}`);
        setPending((data.results ?? data).slice(0, 8));
      } catch {}
      finally { setLoading(false); }
    }
    async function loadActivity() {
      try {
        const [approvedData, allData] = await Promise.all([
          api.get(`/audit-logs/?action=${approvalAction}&ordering=-timestamp&page_size=50`),
          api.get("/audit-logs/?ordering=-timestamp&page_size=8"),
        ]);
        setApproved(approvedData.results ?? approvedData);
        setActivity((allData.results ?? allData).slice(0, 8));
      } catch {}
      finally { setActivityLoading(false); }
    }
    load();
    loadActivity();
  }, [approvalAction, statusFilter]);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={28} className="animate-spin text-[#142B41]" /></div>;

  const pendingCount = pending.length;
  const approvedThisMonth = monthCount(approved);
  const next = pending[0];

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 pb-3">
      <section className="flex flex-col justify-between gap-5 rounded-xl border border-[#D8BF84] bg-[#142B41] px-5 py-5 shadow-[0_10px_28px_rgba(20,43,65,.12)] sm:flex-row sm:items-center"><div><p className="text-[11px] font-bold uppercase tracking-[.14em] text-[#E9DAB8]">{title} · Decision workspace</p><h2 className="mt-1 font-serif text-3xl font-bold tracking-tight text-white">Your signature queue</h2><p className="mt-2 max-w-2xl text-sm text-white/65">{pendingCount ? `${pendingCount} certificate${pendingCount === 1 ? " is" : "s are"} waiting for your review and secure on-chain signature.` : "Your signature queue is clear. Check recent activity for the latest institution progress."}</p></div><Link href="/dashboard/approvals" className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#C59A3A] px-3.5 text-sm font-bold text-[#142B41] transition hover:brightness-105">{pendingCount ? "Review next certificate" : "Open approval queue"} <ArrowRight size={15} /></Link></section>
+
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <DashboardTooltip title="Ready for action" detail="Certificates at the approval stage assigned to your role.">
          <Link href="/dashboard/approvals" aria-label="Open certificates awaiting your signature" className="block h-full rounded-xl transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C59A3A] focus-visible:ring-offset-2">
            <StatCard icon={Clock3} value={pendingCount} label="Awaiting your signature" accent />
          </Link>
        </DashboardTooltip>
        <DashboardTooltip title="Completed this month" detail={`Certificates you approved as ${isVc ? "Vice Chancellor" : "Dean"} during the current calendar month.`}>
          <Link href="/dashboard/audit" aria-label="Open audit logs for your approval activity" className="block h-full rounded-xl transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C59A3A] focus-visible:ring-offset-2">
            <StatCard icon={CheckCircle2} value={approvedThisMonth} label="Approved this month" />
          </Link>
        </DashboardTooltip>
        <DashboardTooltip title="Total decisions" detail="All recorded approvals for your role in the audit trail.">
          <Link href="/dashboard/audit" aria-label="Open audit logs for all your approvals" className="block h-full rounded-xl transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C59A3A] focus-visible:ring-offset-2">
            <StatCard icon={Gavel} value={approved.length} label="Total approved" />
          </Link>
        </DashboardTooltip>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <article className="rounded-xl border border-[#E4E0D5] bg-white p-5 shadow-[0_7px_24px_rgba(20,43,65,.045)]"><div className="mb-5 flex items-start justify-between gap-4"><div><h3 className="font-serif text-lg font-bold text-[#142B41]">Decision workload</h3><p className="text-[11px] text-[#687B8E]">A quick read before you open the queue</p></div><DashboardTooltip title="Approval context" detail="This chart keeps workload visible without taking focus away from the certificate requiring your decision."><span tabIndex={0} className="grid h-5 w-5 place-items-center rounded-full border border-[#E4E0D5] text-[10px] text-[#687B8E]">i</span></DashboardTooltip></div><ApprovalBars pending={pendingCount} approved={approvedThisMonth} /><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-lg bg-[#FCFBF8] p-3"><p className="text-[11px] text-[#687B8E]">Current stage</p><p className="mt-1 text-sm font-bold text-[#142B41]">{isVc ? "Registrar → VC" : "VC → Dean"}</p></div><div className="rounded-lg bg-[#FCFBF8] p-3"><p className="text-[#11px] text-[#687B8E]">After approval</p><p className="mt-1 text-sm font-bold text-[#142B41]">{isVc ? "Dean review" : "Registrar finalizes"}</p></div></div></article>
        <article className="rounded-xl border border-[#E4E0D5] bg-white p-5 shadow-[0_7px_24px_rgba(20,43,65,.045)]"><div className="mb-4 flex items-center justify-between"><div><h3 className="font-serif text-lg font-bold text-[#142B41]">What needs review</h3><p className="text-[11px] text-[#687B8E]">Open a certificate preview before signing</p></div><FileCheck2 size={17} className="text-[#C59A3A]" /></div>{next ? <Link href="/dashboard/approvals" className="group block rounded-lg border border-[#E4E0D5] p-4 transition hover:border-[#D8BF84] hover:bg-[#FCFBF8]"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><ScrollText size={16} className="mt-0.5 shrink-0 text-[#142B41]" /><div className="min-w-0"><p className="truncate text-sm font-bold text-[#142B41]">{next.student_name}</p><p className="mt-1 truncate text-xs text-[#687B8E]">{next.degree_title}</p><p className="mt-2 font-mono text-[10px] text-[#687B8E]">{next.certificate_id}</p></div></div><ArrowRight size={17} className="shrink-0 text-[#C59A3A] transition group-hover:translate-x-1" /></div><div className="mt-3"><StatusBadge status={next.status} /></div></Link> : <div className="flex min-h-[116px] flex-col items-center justify-center rounded-lg bg-[#E7F1EB] p-4 text-center"><CheckCircle2 size={24} className="text-[#3F7658]" /><p className="mt-2 text-sm font-bold text-[#142B41]">No certificates waiting</p><p className="mt-1 text-xs text-[#687B8E]">New submissions will appear here.</p></div>}</article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]"><article className="overflow-hidden rounded-xl border border-[#E4E0D5] bg-white shadow-[0_7px_24px_rgba(20,43,65,.045)]"><div className="flex items-center justify-between border-b border-[#E4E0D5] px-5 py-4"><div><h3 className="font-serif text-lg font-bold text-[#142B41]">Pending signatures</h3><p className="text-[11px] text-[#687B8E]">The queue is ordered for your next decision</p></div><Link href="/dashboard/approvals" className="text-xs font-bold text-[#C59A3A] hover:underline">Open queue <ArrowRight className="inline" size={11} /></Link></div><div className="divide-y divide-[#E4E0D5]">{pending.slice(0, 6).map((cert) => <Link href="/dashboard/approvals" key={cert.id} className="flex items-center justify-between gap-4 px-5 py-3.5 transition hover:bg-[#FCFBF8]"><div className="flex min-w-0 items-center gap-3"><ScrollText size={15} className="shrink-0 text-[#142B41]" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#142B41]">{cert.student_name}</p><p className="truncate text-xs text-[#687B8E]">{cert.degree_title}</p></div></div><StatusBadge status={cert.status} /></Link>)}{!pending.length && <p className="px-5 py-10 text-center text-sm text-[#687B8E]">Nothing waiting for your signature.</p>}</div></article><ActivityFeed title="Recent approval activity" entries={activity} loading={activityLoading} empty="No approval activity recorded yet." /></section>
    </div>
  );
}
