"use client";
import NavigationButton from "@/components/ui/NavigationButton";

import { ActionButton } from "@/components/ui/AnimatedControls";

import { Suspense, useState, useEffect, useCallback } from "react";
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
    setLoading(true);
    setError("");
    try {
      let url = `/certificates/?page=${page}&page_size=${PAGE_SIZE}&ordering=-created_at`;
      if (filter !== "all") url += `&status=${filter}`;
      if (search.trim()) url += `&search=${encodeURIComponent(search.trim())}`;
      if (isSuperAdmin && institution) url += `&institution=${encodeURIComponent(institution)}`;
      const data = await api.get(url);
      setCerts(data.results ?? data);
      setCount(data.count ?? (data.results ?? data).length);
    } catch {
      setError("Failed to load certificates.");
    } finally {
      setLoading(false);
    }
  }, [page, filter, search, institution, isSuperAdmin]);

  useEffect(() => { load(); }, [load]);


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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-[#08283F] font-bold text-2xl">Certificates</h2>
          <p className="text-[#4A5A68] text-sm mt-0.5">
            {count} certificate{count !== 1 ? "s" : ""} · lists are off-chain reads
          </p>
        </div>
        {canIssue && (
          <ActionButton href="/dashboard/certificates/new"
            className="flex items-center gap-2 bg-[#08283F] text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-all self-start">
            <Plus size={15} /> Issue Certificate
          </ActionButton>
        )}
      </div>

      {/* Search + filter bar */}
      <div className="bg-white rounded-xl border border-[#E4E1D6] px-4 py-3 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="dash-search flex-1 min-w-0">
          <Search size={14} className="text-[#8A929C] shrink-0" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name, ID, email, or degree…" />
        </div>
        {isSuperAdmin && (
          <select data-dropdown="compact"
            value={institution}
            onChange={e => { setInstitutionOverride(e.target.value); setPage(1); }}
            className="rounded-lg border border-[#DDE3EA] bg-white px-3 py-2 text-sm text-[#08283F] outline-none focus:border-[#08283F] max-w-[240px]"
          >
            <option value="">All institutions</option>
            {institutions.map(inst => (
              <option key={inst.id} value={inst.id}>{inst.name}</option>
            ))}
          </select>
        )}
        <div className="flex items-center gap-1.5 flex-wrap">
          {STATUS_FILTERS.map(s => (
            <button key={s} onClick={() => { setFilter(s); setPage(1); }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all whitespace-nowrap ${
                filter === s ? "bg-[#08283F] text-white" : "bg-[#EAF2FB] text-[#4A5A68] hover:bg-[#08283F]/10"
              }`}>
              {s === "all" ? "All" : (STATUS_LABELS[s] || s.replace(/_/g, " "))}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="dash-error">{error}</div>}

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#E4E1D6] overflow-hidden w-full">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px]">
            <thead>
              <tr>
                {["Certificate ID", "Student", "Degree", "Year", ...(isSuperAdmin ? ["Institution"] : []), "Status", "Date", "Tx Hash", ""].map(h => (
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
                  <td className="dash-td font-mono text-sm font-semibold text-[#08283F]">{cert.certificate_id}</td>
                  <td className="dash-td">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-[#08283F]/10 flex items-center justify-center text-[#08283F] text-xs font-bold shrink-0">
                        {cert.student_name?.split(" ").map(n => n[0]).join("").slice(0, 2) ?? "?"}
                      </div>
                      <span className="text-[#08283F] text-sm font-medium whitespace-nowrap">{cert.student_name}</span>
                    </div>
                  </td>
                  <td className="dash-td text-[#4A5A68] text-sm max-w-[180px] truncate">{cert.degree_title}</td>
                  <td className="dash-td text-[#4A5A68] text-sm">{cert.graduation_year}</td>
                  {isSuperAdmin && (
                    <td className="dash-td text-[#4A5A68] text-sm max-w-[160px] truncate">{cert.institution_name}</td>
                  )}
                  <td className="dash-td"><StatusBadge status={cert.status} /></td>
                  <td className="dash-td text-[#4A5A68] text-sm whitespace-nowrap">
                    {cert.created_at ? new Date(cert.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="dash-td font-mono text-[#4A5A68] text-xs">
                    {cert.tx_hash ? `${cert.tx_hash.slice(0, 10)}…` : "—"}
                  </td>
                  <td className="dash-td">
                    <div className="flex items-center gap-2">
                      <ActionButton
                        href={verificationPath(cert.certificate_id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[#4A5A68] text-xs font-semibold hover:underline"
                        title="Open the public verification page for this certificate"
                      >
                        Verify <ExternalLink size={11} />
                      </ActionButton>
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
        <div className="px-5 py-3 border-t border-[#E4E1D6] flex items-center justify-between">
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
