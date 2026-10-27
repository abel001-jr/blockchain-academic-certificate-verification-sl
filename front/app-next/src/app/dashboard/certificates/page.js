"use client";
import { subscribeDashboardRefresh } from "@/lib/dashboardRefresh.mjs";
import tableStyles from "@/components/dashboard/RecordTable.module.css";
import RecordPageHero from "@/components/dashboard/RecordPageHero";
import NavigationButton from "@/components/ui/NavigationButton";

import { ActionButton } from "@/components/ui/AnimatedControls";

import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { Search, Plus, Loader2, Pencil, ExternalLink } from "lucide-react";
import StatusBadge from "@/components/dashboard/StatusBadge";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth, ROLES } from "@/lib/useAuth";
import { revokeCertificateOnChain } from "@/lib/walletActions";
import { verificationPath } from "@/lib/parseCertificateScan";
import CertLoaderOverlay from "@/components/dashboard/CertLoaderOverlay";

const STATUS_FILTERS = ["all", "draft", "pending_vc", "pending_chancellor", "pending_finalize", "issued", "revoked"];
const STATUS_LABELS = { pending_vc: "Pending VC", pending_chancellor: "Pending Chancellor", pending_finalize: "Pending finalization", issued: "Issued", revoked: "Revoked" };
const PAGE_SIZE = 20;

function CertificatesContent() {

  const { role } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const isSuperAdmin = role === ROLES.SUPER_ADMIN;

  const [certs, setCerts] = useState([]);
  const [count, setCount] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [submission, setSubmission] = useState("all");
  const [documents, setDocuments] = useState("all");
  const [ordering, setOrdering] = useState("-created_at");
  const requestId = useRef(0);
  const [page, setPage] = useState(1);
  // Seeded from ?institution=<uuid> so the dashboard's per-institution bar
  // drill-down lands pre-filtered. `institutionOverride` is null until the
  // registrar picks something, which keeps the URL as the source of truth on
  // first paint without a setState-in-effect round trip.
  const institutionFromUrl = searchParams.get("institution") || "";
  const [institutionOverride, setInstitutionOverride] = useState(null);
  const institution = institutionOverride ?? institutionFromUrl;
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState(false); // view overlay
  const [error, setError] = useState("");
  const [revoking, setRevoking] = useState(null);

  const canIssue = role === ROLES.REGISTRAR;
  const canRevoke = [ROLES.REGISTRAR, ROLES.SUPER_ADMIN].includes(role);

  useEffect(() => {
    if (!isSuperAdmin || institutions.length) return;
    api.get("/institutions/?page_size=100")
      .then(data => setInstitutions(data.results ?? data ?? []))
      .catch(() => setInstitutions([]));
  }, [isSuperAdmin, institutions.length]);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setError("");
    try {
      let url = `/certificates/?page=${page}&page_size=${PAGE_SIZE}&ordering=${ordering}`;
      if (filter !== "all") url += `&status=${filter}`;
      if (search.trim()) url += `&search=${encodeURIComponent(search.trim())}`;
      if (isSuperAdmin && institution) url += `&institution=${encodeURIComponent(institution)}`;
      if (submission !== "all") url += "&submission=" + submission;
      if (documents !== "all") url += "&documents=" + documents;
      const data = await api.get(url);
      if (currentRequest !== requestId.current) return;
      setCerts(data.results ?? data);
      setCount(data.count ?? (data.results ?? data).length);
    } catch {
      if (currentRequest === requestId.current) setError("Failed to load credentials.");
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [page, filter, search, institution, isSuperAdmin, submission, documents, ordering]);

  useEffect(() => subscribeDashboardRefresh(load, { intervalMs: 0 }), [load]);


  async function handleRevoke(cert) {
    const reason = prompt(`Reason for revoking ${cert.certificate_id}?`);
    if (!reason) return;
    if (!confirm("Revoke on-chain via MetaMask (gas required), then record in INTELLIGENT ACADEMIC CREDENTIALING?")) return;
    setRevoking(cert.id);
    setError("");
    try {
      const { hash } = await revokeCertificateOnChain(cert.certificate_id, reason);
      await api.post(`/certificates/${cert.id}/revoke/`, {
        reason,
        revocation_tx_hash: hash,
      });
      load();
    } catch (e) {
      setError(e?.reason || e?.shortMessage || e?.message || JSON.stringify(e));
    } finally {
      setRevoking(null);
    }
  }

  const totalPages = Math.ceil(count / PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4 w-full">
      <RecordPageHero eyebrow="Credential workspace" title="Credentials" description="Browse complete credential records, including certificates, transcripts and signature progress." count={count} countLabel="matching credentials">
        {canIssue && <ActionButton href="/dashboard/certificates/new" tone="inverse"><Plus size={15} /> Issue credential</ActionButton>}
      </RecordPageHero>

      <section className="rounded-2xl border border-[var(--cd-line)] bg-white p-5 space-y-4" aria-label="Credential filters">
        <div className="dash-search w-full"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Search credentials" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Search student, credential ID, email or award" /></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-semibold text-[#08283F]">Credential stage<select className="cd-input mt-1" value={filter} onChange={event => { setFilter(event.target.value); setPage(1); if (["draft", "issued", "revoked"].includes(event.target.value)) setSubmission("all"); }}><option value="all">All stages</option><optgroup label="Preparation"><option value="draft">Draft</option></optgroup><optgroup label="Signatures"><option value="pending_vc">Awaiting Vice-Chancellor</option><option value="pending_chancellor">Awaiting Chancellor</option><option value="pending_finalize">Awaiting finalization</option></optgroup><optgroup label="Issued records"><option value="issued">Issued</option><option value="revoked">Revoked</option></optgroup></select></label>
          <label className="text-xs font-semibold text-[#08283F]">Pending submission<select className="cd-input mt-1" value={submission} onChange={event => { setSubmission(event.target.value); setPage(1); if (event.target.value !== "all" && ["draft", "issued", "revoked"].includes(filter)) setFilter("all"); }}><option value="all">All records</option><option value="submitted">Submitted on-chain</option><option value="not_submitted">Registrar submission needed</option></select></label>
          <label className="text-xs font-semibold text-[#08283F]">Document support<select className="cd-input mt-1" value={documents} onChange={event => { setDocuments(event.target.value); setPage(1); }}><option value="all">All document sets</option><option value="paired">Transcript attached</option><option value="missing_transcript">Transcript not attached</option></select></label>
          <label className="text-xs font-semibold text-[#08283F]">Sort records<select className="cd-input mt-1" value={ordering} onChange={event => { setOrdering(event.target.value); setPage(1); }}><option value="-created_at">Newest first</option><option value="created_at">Oldest first</option><option value="certificate_id">Credential ID</option><option value="-graduation_year">Graduation year</option></select></label>
          {isSuperAdmin && <label className="text-xs font-semibold text-[#08283F]">Institution<select className="cd-input mt-1" value={institution} onChange={event => { setInstitutionOverride(event.target.value); setPage(1); }}><option value="">All institutions</option>{institutions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        </div>
        <div className="flex flex-wrap justify-between items-center gap-3"><p className="text-xs text-[#687B8E]">{loading ? "Updating results..." : count + " matching credentials"}{submission !== "all" && " ? Pending workflow records only"}</p><button type="button" className="cd-btn-secondary" onClick={() => { setSearch(""); setFilter("all"); setSubmission("all"); setDocuments("all"); setOrdering("-created_at"); setInstitutionOverride(""); setPage(1); }}>Clear filters</button></div>
      </section>

      {error && <div className="dash-error">{error}</div>}

      {/* Table */}
      <div className={tableStyles.frame}>
        <div className={tableStyles.heading}><h3>Credential records</h3><span>{count} matching records &middot; {certs.length} on this page</span></div>
        <div className={tableStyles.scroll}>
          <table className={tableStyles.fixedIdentity}>
            <thead>
              <tr>
                {["Certificate ID", "Student", "Degree", "Year", ...(isSuperAdmin ? ["Institution"] : []), "Status", "Date", "Tx Hash", "Actions"].map(h => (
                  <th key={h} className="dash-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E1D6]">
              {loading && (
                <tr><td colSpan={9} className="text-center py-10">
                  <Loader2 size={20} className="text-[#08283F] animate-spin mx-auto" />
                </td></tr>
              )}
              {!loading && certs.length === 0 && (
                <tr><td colSpan={9} className="text-center py-10 text-[#4A5A68] text-sm">
                  No certificates found.
                </td></tr>
              )}
              {!loading && certs.map(cert => (
                <tr key={cert.id} className="hover:bg-[#F8F7F2] transition-colors">
                  <td data-label="Certificate ID" className={`dash-td font-mono font-semibold text-[#08283F] ${tableStyles.identifier}`}>{cert.certificate_id}</td>
                  <td data-label="Student" className="dash-td">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-[#08283F]/10 flex items-center justify-center text-[#08283F] text-xs font-bold shrink-0">
                        {cert.student_name?.split(" ").map(n => n[0]).join("").slice(0, 2) ?? "?"}
                      </div>
                      <span className="text-[#08283F] text-sm font-medium whitespace-nowrap">{cert.student_name}</span>
                    </div>
                  </td>
                  <td data-label="Degree" className="dash-td text-[#4A5A68] text-sm min-w-[160px]">{cert.degree_title}</td>
                  <td data-label="Year" className="dash-td text-[#4A5A68] text-sm">{cert.graduation_year}</td>
                  {isSuperAdmin && (
                    <td data-label="Institution" className="dash-td text-[#4A5A68] text-sm">{cert.institution_name}</td>
                  )}
                  <td data-label="Status" className="dash-td"><StatusBadge status={cert.status} /></td>
                  <td data-label="Created" className="dash-td text-[#4A5A68] text-sm whitespace-nowrap">
                    {cert.created_at ? new Date(cert.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td data-label="Transaction" className="dash-td font-mono text-[#4A5A68] text-xs" title={cert.tx_hash}>
                    {cert.tx_hash ? `${cert.tx_hash.slice(0, 10)}…` : "—"}
                  </td>
                  <td data-label="Actions" className="dash-td">
                    <div className={tableStyles.actions}>
                      {cert.status === "issued" && <ActionButton
                        href={verificationPath(cert.certificate_id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[#4A5A68] text-xs font-semibold hover:underline"
                        title="Open the public verification page for this certificate"
                      >
                        Verify <ExternalLink size={11} />
                      </ActionButton>}
                      {cert.status?.startsWith("pending") && <Link href={((role === ROLES.VC && cert.status === "pending_vc") || (role === ROLES.CHANCELLOR && cert.status === "pending_chancellor")) && cert.tx_hash ? "/dashboard/approvals" : "/dashboard/certificates/" + cert.id} className="cd-btn-secondary" title="Review or track the credential signature process">Signatures</Link>}
                      <button
                        onClick={() => { setViewing(true); router.push(`/dashboard/certificates/${cert.id}`); }}
                        className="text-[#B98A28] text-xs font-semibold hover:underline"
                      >
                        View
                      </button>

                      {canIssue && cert.status === "draft" && cert.flow_type === "system_designed" && (
                        <NavigationButton href={`/dashboard/certificates/new?flow=system_designed&draft=${encodeURIComponent(cert.id)}`}
                          className="inline-flex items-center gap-1 text-[#08283F] text-xs font-semibold hover:underline">
                          <Pencil size={12} /> Continue issuing
                        </NavigationButton>
                      )}
                      {/* The upload flows are resumable too — their documents are
                          saved to the draft as they are chosen — so a draft
                          created by one of them must be re-enterable rather than
                          stranded in the list with no way back into the wizard. */}
                      {canIssue && cert.status === "draft"
                        && (cert.flow_type === "full_upload" || cert.flow_type === "transcript_then_cert") && (
                        <NavigationButton href={`/dashboard/certificates/new?flow=${encodeURIComponent(cert.flow_type)}&draft=${encodeURIComponent(cert.id)}`}
                          className="inline-flex items-center gap-1 text-[#08283F] text-xs font-semibold hover:underline">
                          <Pencil size={12} /> Continue upload
                        </NavigationButton>
                      )}
                      {canRevoke && cert.status === "issued" && (
                        <button onClick={() => handleRevoke(cert)} disabled={!!revoking}
                          className="text-[#A23B34] text-xs font-semibold hover:underline disabled:opacity-50">
                          {revoking === cert.id ? "…" : "Revoke"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={tableStyles.pagination}>
          <p className="text-[#4A5A68] text-sm">Page {page} of {totalPages || 1} · {count} total</p>
          <div className="flex gap-2">
            <NavigationButton direction="back" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="dash-pagination-btn">Previous</NavigationButton>
            <NavigationButton disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="dash-pagination-btn">Next →</NavigationButton>
          </div>
        </div>
      </div>
      <CertLoaderOverlay variant="view" open={viewing} />
    </div>
  );
}

export default function CertificatesPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><Loader2 size={20} className="text-[#08283F] animate-spin" /></div>}>
      <CertificatesContent />
    </Suspense>
  );
}
