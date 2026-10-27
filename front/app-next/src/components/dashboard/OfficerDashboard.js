"use client";
import { subscribeDashboardRefresh } from "@/lib/dashboardRefresh.mjs";
import styles from "./RoleDashboard.module.css";
import { ActionButton } from "@/components/ui/AnimatedControls";
import StatusDistribution from "./StatusDistribution";
import SignerCharts, { SignatureQueueCard } from "./SignerCharts";
import WelcomeCard from "./WelcomeCard";

import Link from "next/link";
import { loadDashboardRecords } from "@/lib/dashboardRecords";
import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Clock3, Gavel, Loader2, ScrollText } from "lucide-react";
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
  return <StatusDistribution description="Pending signatures and recent monthly approvals" items={[
    { label: "Awaiting your signature", count: pending, color: "#A9721F", detail: "Credentials currently waiting at your role's approval stage." },
    { label: "Recent monthly approvals", count: approved, color: "#2F6F4E", detail: "Approvals for this role in the current month, from the institution audit records. This comparison combines a current queue with recent activity; it is not a completion percentage." },
  ]} />;
}

export default function OfficerDashboard({ role }) {
  const [pending, setPending] = useState([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const [approvalTotal, setApprovalTotal] = useState(0);
  const [error, setError] = useState("");
  const [approved, setApproved] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const isVc = role === ROLES.VC;
  const title = isVc ? "Vice Chancellor" : "Chancellor";
  const statusFilter = isVc ? "pending_vc" : "pending_chancellor";
  const approvalAction = isVc ? "certificate.vc_approved" : "certificate.chancellor_approved";

  useEffect(() => {
    async function load() {
      try {
        const data = await loadDashboardRecords(`/certificates/?status=${statusFilter}`);
        const rows = data.results ?? data;
        setPending(rows);
        setQueueTotal(typeof data.count === "number" ? data.count : rows.length);
      } catch { setError("Unable to load your signature queue. Refresh the dashboard to try again."); }
      finally { setLoading(false); }
    }
    async function loadActivity() {
      try {
        const approvedData = await loadDashboardRecords(`/audit-logs/?action=${approvalAction}&ordering=-timestamp`);
        setApproved(approvedData.results ?? approvedData);
        setApprovalTotal(typeof approvedData.count === "number" ? approvedData.count : (approvedData.results ?? approvedData).length);
        setActivity(approvedData.results ?? approvedData);
      } catch {}
      finally { setActivityLoading(false); }
    }
    return subscribeDashboardRefresh(() => Promise.all([load(), loadActivity()]), { intervalMs: 0 });
  }, [approvalAction, statusFilter]);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={28} className="animate-spin text-[color:var(--cd-primary)]" /></div>;

  const pendingCount = queueTotal;
  const approvedThisMonth = monthCount(approved);

  return (
    <div className={`${styles.dashboard} mx-auto flex w-full max-w-[1400px] flex-col gap-5 pb-3`}>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <WelcomeCard compact>

      <section className={styles.summaryGrid}>
        <DashboardTooltip title="Ready for action" detail="Certificates at the approval stage assigned to your role.">
          <Link href="/dashboard/approvals" aria-label="Open certificates awaiting your signature" className="block h-full rounded-xl transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C59A3A] focus-visible:ring-offset-2">
            <StatCard compact icon={Clock3} value={pendingCount} label="Awaiting your signature" accent />
          </Link>
        </DashboardTooltip>
        <DashboardTooltip title="Completed this month" detail={`Recent institution approvals recorded for ${isVc ? "Vice Chancellor" : "Chancellor"} during the current calendar month.`}>
          <Link href="/dashboard/approvals" aria-label="Open the approval page" className="block h-full rounded-xl transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C59A3A] focus-visible:ring-offset-2">
            <StatCard compact icon={CheckCircle2} value={approvedThisMonth} label="Approvals this month" />
          </Link>
        </DashboardTooltip>
        <DashboardTooltip title="Total decisions" detail="All recorded institution approvals for this role. Monthly figures use the institution audit records.">
          <Link href="/dashboard/audit" aria-label="Open audit logs for all your approvals" className="block h-full rounded-xl transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C59A3A] focus-visible:ring-offset-2">
            <StatCard icon={Gavel} value={approvalTotal} label="Role approvals" />
          </Link>
        </DashboardTooltip>
      </section>
      <section className="cd-registrar-workflow rounded-xl cd-surface-dark bg-[var(--cd-primary)] px-4 py-3">
        <div><p className="text-[11px] font-bold uppercase tracking-[.14em] text-[#F8F7F2]/80">{title} workflow</p><h2 className="mt-1 text-lg font-semibold text-white">{pendingCount ? `${pendingCount} credentials awaiting your signature` : "Your signature queue is clear"}</h2><p className="mt-1 text-sm text-white/75">{isVc ? "Review the registrar's attestation and pass approved credentials to the Chancellor." : "Complete the final institutional approval so the Registrar can finalize the credential."}</p></div>
        <div className="flex flex-wrap items-center gap-3"><ActionButton href="/dashboard/approvals" tone="inverse" className={`cred-btn cred-btn-primary ${pendingCount > 0 ? styles.reviewAction : ""}`}>Pending signatures</ActionButton><ActionButton href="/dashboard/approvals" tone="inverse" className={`cred-btn cred-btn-primary ${pendingCount > 0 ? styles.reviewAction : ""}`}>Review &amp; approve credential</ActionButton></div>
        <div className="cd-workflow-status rounded-lg bg-white p-3"><ApprovalBars pending={pendingCount} approved={approvedThisMonth} /><div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[#4A5A68]"><span>Current stage: <strong>{isVc ? "Registrar to VC" : "VC to Chancellor"}</strong></span><span>Next: <strong>{isVc ? "Chancellor review" : "Registrar finalizes"}</strong></span></div></div>
      </section>
      </WelcomeCard>
      <SignerCharts pending={pending} approvals={approved} loading={activityLoading} activityCard={<ActivityFeed title="Recent approval activity" entries={activity} loading={activityLoading} empty="No approval activity recorded yet." viewAllHref="/dashboard/approval-activity" />} />




      <section className={styles.activityGrid}><SignatureQueueCard pending={pending} /><article className={`${pendingCount > 0 ? styles.pendingAttention : ""} cd-scroll-card overflow-hidden rounded-xl border border-[var(--cd-line)] bg-white shadow-[0_7px_24px_rgba(20,43,65,.045)]`}><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--cd-line)] px-5 py-4"><div><h3 className="font-serif text-lg font-bold text-[color:var(--cd-primary)]">Credentials awaiting signature</h3><p className="text-[11px] text-[#687B8E]">The queue is ordered for your next decision</p></div><ActionButton href="/dashboard/approvals" className="cred-btn cred-btn-primary">Review pending <ArrowRight size={14} aria-hidden="true" /></ActionButton></div><div className="cd-scroll-card-body divide-y divide-[var(--cd-line)]" tabIndex={0} role="region" aria-label="Credentials awaiting signature">{pending.map((cert) => <Link href="/dashboard/approvals" key={cert.id} className={`${styles.pendingRow} flex items-center justify-between gap-4 px-5 py-3.5 transition hover:bg-[var(--cd-tint)]`}><div className="flex min-w-0 items-center gap-3"><ScrollText size={15} className="shrink-0 text-[color:var(--cd-primary)]" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-[color:var(--cd-primary)]">{cert.student_name}</p><p className="truncate text-xs text-[#687B8E]">{cert.degree_title}</p></div></div><span className="flex shrink-0 items-center gap-2"><StatusBadge status={cert.status} /><ArrowRight size={15} aria-hidden="true" /></span></Link>)}{!pending.length && <p className="px-5 py-10 text-center text-sm text-[#687B8E]">Nothing waiting for your signature.</p>}</div></article></section>
    </div>
  );
}
