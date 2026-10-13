"use client";

import { ActionButton } from "@/components/ui/AnimatedControls";

import styles from "./RoleDashboard.module.css";
import StatusDistribution from "./StatusDistribution";
import WelcomeCard from "./WelcomeCard";
import CredentialCharts from "./CredentialCharts";

import Link from "next/link";
import { loadDashboardRecords } from "@/lib/dashboardRecords";
import { useEffect, useState } from "react";
import {
  ArrowRight, CheckCircle2,
  FilePlus2, Loader2,
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
    <div className="group relative flex h-full min-h-[80px] flex-col rounded-xl border border-[var(--cd-line)] bg-white px-3 py-2 shadow-[0_7px_24px_rgba(20,43,65,.035)] transition hover:-translate-y-0.5 hover:border-[var(--cd-accent)] hover:shadow-md sm:min-h-[80px] sm:px-3 sm:py-2">
      <strong className={`font-serif text-[26px] font-bold leading-none sm:text-[28px] ${accent ? "text-[color:var(--cd-accent)]" : "text-[color:var(--cd-primary)]"}`}>{value}</strong>
      <span className="mt-2 text-sm font-bold leading-tight text-[color:var(--cd-primary)] sm:text-sm">{label}</span>
    </div>
  );
  return href ? <Link href={href} className="flex h-full w-full flex-col pt-0">{content}</Link> : content;
}

function StatusAnalytics({ counts, total }) {
  return (
    <article className="rounded-xl border border-[var(--cd-line)] bg-white p-5 shadow-[0_7px_24px_rgba(20,43,65,.035)]">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div><h3 className="font-serif text-xl font-bold text-[color:var(--cd-primary)]">Certificates by status</h3><p className="mt-1 text-xs text-[#687B8E]">Current credential portfolio</p></div>
        <DashboardTooltip title="Portfolio status" detail="Issued credentials are anchored, while pending credentials are still moving through the approval workflow."><span tabIndex={0} className="grid h-5 w-5 place-items-center rounded-full border border-[var(--cd-line)] text-[10px] text-[#687B8E]">i</span></DashboardTooltip>
      </div>
      <StatusDistribution description="Institution credential statuses" items={STATUS_META.map(item => ({ label: item.label, count: counts[item.key], color: { issued: "#2F6F4E", pending: "#A9721F", draft: "#9AA8B4", revoked: "#A23B34" }[item.key], detail: { issued: "Issued and anchored credentials.", pending: "Credentials progressing through approval and finalization.", draft: "Saved credentials still being prepared.", revoked: "Credentials that have been revoked." }[item.key] }))} />
      <p className="mt-2 text-xs text-[#4A5A68]">Total: <strong>{total}</strong></p>
    </article>
  );
}

function VerificationActivity({ entries, loading }) {
  const verificationEntries = entries.filter((entry) => entry.action === "certificate.verified");
  return (
    <article className="cd-scroll-card overflow-hidden rounded-xl border border-[var(--cd-line)] bg-white shadow-[0_7px_24px_rgba(20,43,65,.035)]">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--cd-line)] px-5 py-4"><div><h3 className="font-serif text-xl font-bold text-[color:var(--cd-primary)]">Verification activity</h3><p className="mt-1 text-xs text-[#687B8E]">Recent public certificate checks</p></div><Link href="/dashboard/audit" className="cred-btn cred-btn-secondary shrink-0">Audit logs <ArrowRight className="inline" size={11} /></Link></div>
      <div className="cd-scroll-card-body divide-y divide-[var(--cd-line)]" tabIndex={0} role="region" aria-label="Verification activity entries">
        {loading && <p className="px-5 py-10 text-center text-sm text-[#687B8E]">Loading verification activityâ€¦</p>}
        {!loading && verificationEntries.map((entry) => <div key={entry.id} className="flex gap-3 px-5 py-4"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#E7F1EB] text-[#3F7658]"><CheckCircle2 size={14} /></span><div className="min-w-0"><p className="break-words text-sm font-semibold text-[color:var(--cd-primary)]">{entry.detail || "Certificate verification completed"}</p><p className="mt-1 text-xs text-[#687B8E]">{entry.timestamp ? new Date(entry.timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Recent check"}</p></div></div>)}
        {!loading && !verificationEntries.length && <div className="px-5 py-10 text-center"><CheckCircle2 size={24} className="mx-auto text-[#3F7658]" /><p className="mt-3 text-sm font-bold text-[color:var(--cd-primary)]">No verification activity yet</p><p className="mt-1 text-xs text-[#687B8E]">Public certificate checks will appear here.</p><Link href="/dashboard/audit" className="cred-btn cred-btn-secondary shrink-0">Open audit logs <ArrowRight className="inline" size={11} /></Link></div>}
      </div>
    </article>
  );
}

export default function RegistrarDashboard() {
  const [certificates, setCertificates] = useState([]);
  const [activity, setActivity] = useState([]);
  const [institution, setInstitution] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      try {
        let page = 1;
        const allCertificates = [];
        let response;
        do { response = await api.get(`/certificates/?ordering=-created_at&page_size=100&page=${page++}`); allCertificates.push(...listFrom(response)); } while (response.next);
        const certificateResponse = allCertificates;
        const group = field => Object.entries(allCertificates.reduce((totals, cert) => { const name = cert[field] || "Unspecified"; totals[name] = (totals[name] || 0) + 1; return totals; }, {})).map(([name, count]) => ({ [field]: name, count }));
        setAnalytics({ total: allCertificates.length, statuses: statusCounts(allCertificates), programmes: group("degree_title"), departments: group("department"), stages: group("status") });
        setCertificates(listFrom(certificateResponse));
        const payload = jwtPayload();
        if (payload?.institution) {
          try { setInstitution(await api.get(`/institutions/${payload.institution}/`)); } catch {}
        }
      } catch (error) {
        setError("Unable to load the credential overview. Refresh the dashboard to try again.");
      } finally {
        setLoading(false);
      }
    }

    async function loadActivity() {
      try {
        const response = await loadDashboardRecords("/audit-logs/?ordering=-timestamp");
        setActivity(listFrom(response));
      } catch {}
      finally { setActivityLoading(false); }
    }

    loadDashboard();
    loadActivity();
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={28} className="animate-spin text-[color:var(--cd-primary)]" /></div>;

  const counts = analytics?.statuses ?? statusCounts(certificates);
  const total = analytics?.total ?? certificates.length;
  const pendingApproval = counts.pending;
  const verificationChecks = analytics?.verifications ?? activity.filter((entry) => entry.action === "certificate.verified").length;
  const actionLabel = pendingApproval ? `${pendingApproval} certificate${pendingApproval === 1 ? " is" : "s are"} moving through approval` : "Your certificate workflow is clear";
  const actionDetail = pendingApproval ? "Follow VC and Chancellor review, then finalize credentials when all required approvals are recorded." : "Issue a new credential or review the current certificate portfolio.";

  return (
    <div className={`${styles.dashboard} mx-auto flex w-full max-w-[1500px] flex-col gap-5 pb-3`}>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <WelcomeCard compact>
      <section className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-serif text-xl font-bold tracking-tight text-[color:var(--cd-primary)]">{institution?.name ?? "Your institution"}</h2><p className="mt-1 text-xs text-[#687B8E]">Institution ID&nbsp; {institution?.institution_id ?? "â€”"}</p></div><span className={`inline-flex items-center gap-2 self-start rounded-full px-4 py-2 text-xs font-bold ${institution?.is_chain_active ? "bg-[var(--cd-tint)] text-[#780110]" : "bg-[#EDF0F2] text-[#687B8E]"}`}><span className={`h-2 w-2 rounded-full ${institution?.is_chain_active ? "bg-[#C59A3A]" : "bg-[#9AA8B4]"}`} />{institution?.is_chain_active ? "Anchored on-chain" : "Awaiting on-chain anchor"}</span></section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4"><DashboardTooltip title="Certificate portfolio" detail="All credential records for your institution."><span className="flex h-full w-full flex-col"><Metric value={total} label="Total certificates" detail="Institution portfolio" href="/dashboard/certificates" /></span></DashboardTooltip><DashboardTooltip title="Issued credentials" detail="Certificates that completed approval and finalization."><span className="flex h-full w-full flex-col"><Metric value={counts.issued} label="Issued credentials" detail="All anchored on-chain" href="/dashboard/certificates" /></span></DashboardTooltip><DashboardTooltip title="Pending approval" detail="Credentials waiting for VC or Chancellor approval."><span className="flex h-full w-full flex-col"><Metric value={pendingApproval} label="Pending approval" detail="Awaiting officer review" accent href="/dashboard/certificates" /></span></DashboardTooltip><DashboardTooltip title="Verification checks" detail="Recorded institution verification checks."><span className="flex h-full w-full flex-col"><Metric value={verificationChecks} label="Verification checks" detail="Institution audit records" href="/dashboard/audit" /></span></DashboardTooltip></section>

      <section className="cd-registrar-workflow rounded-xl cd-surface-dark bg-[var(--cd-primary)] px-4 py-3 shadow-[0_10px_28px_rgba(20,43,65,.12)] "><div><p className="text-[11px] font-bold uppercase tracking-[.14em] text-[#F8F7F2]/80">Credential workflow</p><h3 className="mt-1 text-xl font-bold text-white">{actionLabel}</h3><p className="mt-1 text-sm text-white/65">{actionDetail}</p></div><div className="flex flex-wrap items-center gap-3"><ActionButton href="/dashboard/certificates/new" tone="inverse" className="cred-btn cred-btn-primary gap-2"><FilePlus2 size={16} />Issue credential</ActionButton><Link href="/dashboard/certificates" className="cred-btn cred-btn-secondary cred-btn-inverse gap-2">Track pending<ArrowRight size={15} aria-hidden="true" /></Link></div><div className="cd-workflow-status cd-workflow-status-compact"><StatusAnalytics counts={counts} total={total} /></div></section>
      </WelcomeCard>




      <section className="grid gap-4 xl:grid-cols-[1.28fr_.72fr]"><article className="cd-scroll-card overflow-hidden rounded-xl border border-[var(--cd-line)] bg-white shadow-[0_7px_24px_rgba(20,43,65,.035)]"><div className="flex items-center justify-between border-b border-[var(--cd-line)] px-5 py-4"><h3 className="font-serif text-xl font-bold text-[color:var(--cd-primary)]">Recent certificates</h3><Link href="/dashboard/certificates" className="cred-btn cred-btn-secondary shrink-0">View all <ArrowRight className="inline" size={11} /></Link></div><div className="cd-scroll-card-body" tabIndex={0} role="region" aria-label="Recent certificate records"><table className="w-full min-w-[620px] text-left"><thead className="bg-[var(--cd-tint)] text-[10px] uppercase tracking-wider text-[#687B8E]"><tr>{["Student", "Programme", "Certificate ID", "Status", "Issued"].map((heading) => <th key={heading} className="px-4 py-3 font-bold">{heading}</th>)}</tr></thead><tbody className="divide-y divide-[var(--cd-line)]">{certificates.map((certificate) => <tr key={certificate.id} className="transition hover:bg-[var(--cd-tint)]"><td className="px-4 py-3 text-sm font-semibold text-[color:var(--cd-primary)]">{certificate.student_name}</td><td className="px-4 py-3 text-xs text-[#687B8E]">{certificate.degree_title}</td><td className="px-4 py-3 font-mono text-[10px] text-[#687B8E]">{certificate.certificate_id}</td><td className="px-4 py-3"><StatusBadge status={certificate.status} /></td><td className="px-4 py-3 text-xs text-[#687B8E]">{certificate.created_at ? new Date(certificate.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "â€”"}</td></tr>)}{!certificates.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-[#687B8E]">No certificates yet.</td></tr>}</tbody></table></div></article><VerificationActivity entries={activity} loading={activityLoading} /></section>

      <CredentialCharts initialData={analytics} />
    </div>
  );
}
