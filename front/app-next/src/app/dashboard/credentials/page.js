"use client";
import { subscribeDashboardRefresh } from "@/lib/dashboardRefresh.mjs";
import DeleteButton from "@/components/ui/DeleteButton";
import NavigationButton from "@/components/ui/NavigationButton";

import { DownloadButton, ActionButton } from "@/components/ui/AnimatedControls";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  Plus, 
  Search, 
  Filter, 
  FileText, 
  ScrollText,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  Eye,
  Pencil,
  ShieldCheck,
} from "lucide-react";
import { loadDashboardRecords } from "@/lib/dashboardRecords";
import { api } from "@/lib/api";
import { useAuth, ROLES } from "@/lib/useAuth";
import { verificationPath } from "@/lib/parseCertificateScan";
import FloatingDetailDialog from "@/components/dashboard/FloatingDetailDialog";
import styles from "@/components/dashboard/DashboardRecords.module.css";

function StatusBadge({ status }) {
  const styles = {
    draft:              { bg: "bg-[#4A5A68]/10", text: "text-[#1B2734]", label: "Draft" },
    pending_vc:         { bg: "bg-[#F5EBDB]", text: "text-[#A9721F]", label: "Pending VC" },
    pending_dean:       { bg: "bg-[#E9DAB8]", text: "text-[#B98A28]", label: "Pending Chancellor" },
    pending_chancellor: { bg: "bg-[#E9DAB8]", text: "text-[#B98A28]", label: "Pending Chancellor" },
    pending_finalize:   { bg: "bg-[#EAF2FB]", text: "text-[#08283F]", label: "Pending Finalize" },
    issued:             { bg: "bg-[#08283F]/8", text: "text-[#08283F]", label: "Issued" },
    approved:           { bg: "bg-[#E7F1EB]", text: "text-[#2F6F4E]", label: "Approved" },
    verified:           { bg: "bg-[#E7F1EB]", text: "text-[#2F6F4E]", label: "Verified" },
    revoked:            { bg: "bg-[#F5E5E3]", text: "text-[#A23B34]", label: "Revoked" },
  };

  const key = status?.toLowerCase() ?? "draft";
  const style = styles[key] ?? styles.draft;

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
}

function FlowBadge({ flowType }) {
  const flows = {
    system_designed:      { icon: ScrollText, label: "System Designed", color: "text-[#C59A3A] bg-[#C59A3A]/10" },
    external_upload:      { icon: FileText, label: "External Upload", color: "text-[#4A5A68] bg-[#4A5A68]/10" },
    transcript_then_cert: { icon: FileText, label: "Transcript First", color: "text-[#2F6F4E] bg-[#2F6F4E]/10" },
    full_upload:          { icon: FileText, label: "Full Upload", color: "text-[#08283F] bg-[#08283F]/10" },
  };

  const flow = flows[flowType] ?? flows.system_designed;
  const Icon = flow.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${flow.color}`}>
      <Icon size={12} />
      {flow.label}
    </span>
  );
}

function CredentialRow({ credential, canIssue, onRemove, role }) {
  const hasTranscript = credential.has_transcript;
  const canResume = canIssue && credential.status === "draft" && [
    "system_designed",
    "full_upload",
    "transcript_then_cert",
  ].includes(credential.flow_type);
  const actionHref = canResume
    ? `/dashboard/certificates/new?flow=${encodeURIComponent(credential.flow_type)}&draft=${encodeURIComponent(credential.id)}`
    : `/dashboard/certificates/${credential.id}`;

  return (
    <div className={`${styles.credentialRow} group flex items-start justify-between gap-4 border-b border-[#E4E0D5] px-6 py-4 transition hover:bg-[#FCFBF8]`}>
      <div className={styles.credentialIdentity}>
        <h3 className="font-semibold text-[#142B41]">{credential.student_name}</h3>
        <p className="mt-2 font-mono text-xs text-[#687B8E] break-all">{credential.certificate_id}</p>
      </div>
      <div className={styles.credentialData} tabIndex={0} role="region" aria-label={"Scrollable details for " + credential.student_name}>
        <div className={styles.credentialDataContent}>
          <div><span className="text-xs text-[#687B8E]">Award</span><p className="mt-1 text-sm text-[#142B41]">{credential.degree_title}</p></div>
          <div><span className="text-xs text-[#687B8E]">Year</span><p className="mt-1 text-sm">{credential.graduation_year}</p></div>
          {credential.grade && <div><span className="text-xs text-[#687B8E]">Classification</span><p className="mt-1 text-sm">{credential.grade}</p></div>}
          <FlowBadge flowType={credential.flow_type} />
          <StatusBadge status={credential.status} />
          {hasTranscript && <span className="inline-flex items-center gap-1 rounded-full bg-[#2F6F4E]/10 px-2 py-1 text-xs text-[#2F6F4E]"><FileText size={11} />With transcript</span>}
        </div>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {canIssue && credential.status === "draft" && !credential.tx_hash && !credential.cert_hash && <DeleteButton iconOnly type="button" onClick={() => onRemove(credential)} aria-label={`Remove draft ${credential.certificate_id}`} title="Remove draft" >Remove draft</DeleteButton>}
        <NavigationButton
          iconOnly
          aria-label={canResume ? "Continue issuing" : "View credential"}
          href={actionHref}
          title={canResume ? "Continue issuing" : "View credential"}
          className={`flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#E4E0D5] text-[#4A5A68] transition hover:border-[#C59A3A] hover:bg-[#C59A3A]/5 hover:text-[#C59A3A] ${
            "px-3 text-xs font-semibold"
          }`}
        >
          {canResume ? "Continue issuing" : "View credential"}
        </NavigationButton>
        {credential.status === "issued" && credential.ipfs_url_pdf && (
          <DownloadButton iconOnly aria-label="Download credential document" as="a"
            href={credential.ipfs_url_pdf}
            target="_blank"
            rel="noopener noreferrer"
            title="Download credential document"
          >Download</DownloadButton>
        )}
        {credential.status?.startsWith("pending") && <Link href={(["vc", "chancellor"].includes(role) && credential.status === (role === "vc" ? "pending_vc" : "pending_chancellor")) ? "/dashboard/approvals" : "/dashboard/certificates/" + credential.id} title="Review credential signature process" aria-label="Review credential signature process" className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--cd-line)] text-[#08283F]"><Pencil size={16} /></Link>}
        {credential.status === "issued" && credential.certificate_id && (
          <Link
            href={verificationPath(credential.certificate_id)}
            target="_blank"
            rel="noopener noreferrer"
            title="Verify credential"
            aria-label="Verify credential"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[#E4E0D5] text-xs font-semibold text-[#4A5A68] transition hover:border-[#780110] hover:text-[#780110]"
          >
            <ShieldCheck size={16} aria-hidden="true" />
          </Link>
        )}
      </div>
    </div>
  );
}

export default function CredentialsPage() {
  const { role } = useAuth();
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [documentFilter, setDocumentFilter] = useState("all");
  const [institution, setInstitution] = useState("");
  const [institutions, setInstitutions] = useState([]);
  const [removing, setRemoving] = useState(null);
  const [removalBusy, setRemovalBusy] = useState(false);
  const [removalError, setRemovalError] = useState("");
  async function removeDraft() {
    setRemovalBusy(true); setRemovalError("");
    try {
      await api.post(`/certificates/${removing.id}/abandon/`, {});
      setCredentials(previous => previous.filter(item => item.id !== removing.id));
      setRemoving(null);
    } catch (error) { setRemovalError(error?.detail || "Unable to remove this draft."); }
    finally { setRemovalBusy(false); }
  }

  // Issuing is registrar-only; the API returns 403 for everyone else, so the
  // CTA is hidden rather than left to fail.
  const canIssue = role === ROLES.REGISTRAR;
  const isSuperAdmin = role === ROLES.SUPER_ADMIN;

  useEffect(() => {
    async function loadCredentials() {
      try {
        let url = "/certificates/?page_size=100";
        if (isSuperAdmin && institution) url += `&institution=${encodeURIComponent(institution)}`;
        const response = await loadDashboardRecords(url);
        setCredentials(Array.isArray(response) ? response : response.results ?? []);
      } catch (error) {
        console.error("Failed to load credentials:", error);
      } finally {
        setLoading(false);
      }
    }
    return subscribeDashboardRefresh(loadCredentials, { intervalMs: 0 });
  }, [institution, isSuperAdmin]);

  useEffect(() => {
    if (!isSuperAdmin || institutions.length) return;
    api.get("/institutions/?page_size=100")
      .then(data => setInstitutions(data.results ?? data ?? []))
      .catch(() => setInstitutions([]));
  }, [isSuperAdmin, institutions.length]);

  const filteredCredentials = credentials.filter((cred) => {
    const matchesSearch = 
      cred.student_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cred.certificate_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cred.degree_title?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || cred.status === statusFilter;

    const hasTranscript = Boolean(cred.has_transcript || cred.transcript_hash || cred.ipfs_cid_transcript);
    const matchesDocuments = documentFilter === "all" || (documentFilter === "paired" ? hasTranscript : !hasTranscript);
    return matchesSearch && matchesStatus && matchesDocuments;
  });

  const stats = {
    total: credentials.length,
    issued: credentials.filter(c => c.status === "issued").length,
    pending: credentials.filter(c => c.status?.includes("pending")).length,
    withTranscript: credentials.filter(c => c.has_transcript).length,
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 size={32} className="animate-spin text-[#C59A3A]" />
      </div>
    );
  }

  return (
    <div className={`${styles.page} w-full pb-4`}>
      {removing && <FloatingDetailDialog title="Remove credential draft?" onClose={() => { if (!removalBusy) setRemoving(null); }}><p className="mb-4">Remove {removing.certificate_id} for {removing.student_name} and its saved documents? This cannot be undone.</p>{removalError && <p role="alert" className="mb-4 text-red-700">{removalError}</p>}<div className="flex gap-3"><button type="button" className="cd-btn-secondary" disabled={removalBusy} onClick={() => setRemoving(null)}>Cancel</button><DeleteButton type="button" disabled={removalBusy}  onClick={removeDraft}>{removalBusy ? "Removing..." : "Remove draft"}</DeleteButton></div></FloatingDetailDialog>}
      <header className={styles.credentialHero}>
        <div><span>Credential workspace</span><h1>Credentials</h1><p>Manage certificates and transcripts together, from preparation through signatures and issuance.</p></div>
        {canIssue && <ActionButton href="/dashboard/credentials/new" tone="inverse"><Plus size={18} /> Issue credential</ActionButton>}
      </header>

      {/* Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-[#E4E0D5] bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#687B8E]">Total Credentials</p>
              <p className="mt-1 font-serif text-2xl font-bold text-[#142B41]">{stats.total}</p>
            </div>
            <ScrollText size={24} className="text-[#C59A3A]" />
          </div>
        </div>
        <div className="rounded-xl border border-[#E4E0D5] bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#687B8E]">Issued</p>
              <p className="mt-1 font-serif text-2xl font-bold text-[#142B41]">{stats.issued}</p>
            </div>
            <CheckCircle2 size={24} className="text-[#2F6F4E]" />
          </div>
        </div>
        <div className="rounded-xl border border-[#E4E0D5] bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#687B8E]">Pending Approval</p>
              <p className="mt-1 font-serif text-2xl font-bold text-[#142B41]">{stats.pending}</p>
            </div>
            <Clock size={24} className="text-[#B98A28]" />
          </div>
        </div>
        <div className="rounded-xl border border-[#E4E0D5] bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#687B8E]">With Transcript</p>
              <p className="mt-1 font-serif text-2xl font-bold text-[#142B41]">{stats.withTranscript}</p>
            </div>
            <FileText size={24} className="text-[#08283F]" />
          </div>
        </div>
      </div>

      <section className={styles.credentialFilters} aria-label="Credential filters">
        <div className="relative"><Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#687B8E]" /><input type="search" aria-label="Search credentials" placeholder="Search student, credential ID or award" className="cd-input pl-10" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} /></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label>Credential stage<select className="cd-input mt-1" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">All stages</option><optgroup label="Preparation"><option value="draft">Draft</option></optgroup><optgroup label="Signature process"><option value="pending_vc">Awaiting Vice-Chancellor signature</option><option value="pending_chancellor">Awaiting Chancellor signature</option><option value="pending_finalize">Awaiting finalization</option></optgroup><optgroup label="Issued records"><option value="issued">Issued</option><option value="revoked">Revoked</option></optgroup></select></label>
          <label>Document support<select className="cd-input mt-1" value={documentFilter} onChange={event => setDocumentFilter(event.target.value)}><option value="all">All document sets</option><option value="paired">Certificate with transcript</option><option value="missing">Transcript not attached</option></select></label>
          {isSuperAdmin && <label>Institution<select className="cd-input mt-1" value={institution} onChange={event => setInstitution(event.target.value)}><option value="">All institutions</option>{institutions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-[#687B8E]">{filteredCredentials.length} matching credentials</p><button type="button" className="cd-btn-secondary" onClick={() => { setSearchQuery(""); setStatusFilter("all"); setDocumentFilter("all"); setInstitution(""); }}>Clear filters</button></div>
      </section>

      {/* Credentials List */}
      <div className="overflow-hidden rounded-xl border border-[#E4E0D5] bg-white">
        {filteredCredentials.length > 0 ? (
          filteredCredentials.map((credential) => (
            <CredentialRow key={credential.id} credential={credential} role={role} canIssue={canIssue} onRemove={item => { setRemoving(item); setRemovalError(""); }} />
          ))
        ) : (
          <div className="flex min-h-[300px] flex-col items-center justify-center p-8 text-center">
            <AlertCircle size={48} className="text-[#9AA8B4]" />
            <h3 className="mt-4 font-semibold text-[#142B41]">No credentials found</h3>
            <p className="mt-1 text-sm text-[#687B8E]">
              {searchQuery || statusFilter !== "all"
                ? "Try adjusting your filters"
                : "Start by issuing your first credential"}
            </p>
            {!searchQuery && statusFilter === "all" && canIssue && (
              <ActionButton
                href="/dashboard/credentials/new"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#C59A3A] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
              >
                <Plus size={16} />
                Issue Credential
              </ActionButton>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
