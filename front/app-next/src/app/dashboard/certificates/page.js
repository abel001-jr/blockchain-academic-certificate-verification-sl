"use client";
import { useState, useEffect, useCallback } from "react";
import { Search, Plus, Loader2 } from "lucide-react";
import StatusBadge from "@/components/dashboard/StatusBadge";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth, ROLES } from "@/lib/useAuth";
import { revokeCertificateOnChain } from "@/lib/walletActions";

const STATUS_FILTERS = ["all", "draft", "pending_vc", "pending_chancellor", "pending_finalize", "issued", "revoked"];

export default function CertificatesPage() {
  const { role } = useAuth();

  const [certs, setCerts] = useState([]);
  const [count, setCount] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revoking, setRevoking] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const canIssue = [ROLES.REGISTRAR, ROLES.INSTITUTIONAL_ADMIN].includes(role);
  const canRevoke = [ROLES.REGISTRAR, ROLES.INSTITUTIONAL_ADMIN, ROLES.SUPER_ADMIN].includes(role);
  const canDeleteDraft = canIssue;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let url = `/certificates/?page=${page}&ordering=-created_at`;
      if (filter !== "all") url += `&status=${filter}`;
      if (search.trim()) url += `&search=${encodeURIComponent(search.trim())}`;
      const data = await api.get(url);
      setCerts(data.results ?? data);
      setCount(data.count ?? (data.results ?? data).length);
    } catch {
      setError("Failed to load certificates.");
    } finally {
      setLoading(false);
    }
  }, [page, filter, search]);

  useEffect(() => { load(); }, [load]);

  async function handleDeleteDraft(cert) {
    if (!confirm(`Delete draft ${cert.certificate_id}? This cannot be undone.`)) return;
    setDeleting(cert.id);
    setError("");
    try {
      await api.delete(`/certificates/${cert.id}/`);
      load();
    } catch (e) {
      setError(e?.detail || JSON.stringify(e));
    } finally {
      setDeleting(null);
    }
  }

  async function handleRevoke(cert) {
    const reason = prompt(`Reason for revoking ${cert.certificate_id}?`);
    if (!reason) return;
    if (!confirm("Revoke on-chain via MetaMask (gas required), then record in CREDENCE?")) return;
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

  const pageSize = 20;
  const totalPages = Math.ceil(count / pageSize);

  return (
    <div className="flex flex-col gap-6 max-w-[1280px]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-[#022448] font-bold text-2xl">Certificates</h2>
          <p className="text-[#43474e] text-sm mt-0.5">
            {count} certificate{count !== 1 ? "s" : ""} · lists are off-chain reads
          </p>
        </div>
        {canIssue && (
          <Link
            href="/dashboard/certificates/new"
            className="flex items-center gap-2 bg-[#022448] text-white px-5 py-2.5 rounded-[12px] text-sm font-semibold hover:opacity-90 transition-all active:scale-95 self-start"
          >
            <Plus size={16} /> Issue Certificate
          </Link>
        )}
      </div>

      <div className="bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 p-4 flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 bg-[#eef4ff] rounded-[10px] px-3 py-2.5 flex-1 border border-transparent focus-within:border-[#022448] transition-colors">
          <Search size={15} className="text-[#74777f] shrink-0" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name, ID, or degree…"
            className="bg-transparent text-sm text-[#121c28] outline-none placeholder:text-[#74777f] w-full"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => { setFilter(s); setPage(1); }}
              className={`px-3 py-2 rounded-[8px] text-xs font-semibold capitalize transition-all ${
                filter === s ? "bg-[#022448] text-white" : "bg-[#eef4ff] text-[#43474e] hover:bg-[#022448]/10"
              }`}
            >
              {s === "all" ? "All" : s.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-[#ffdad6] text-[#93000a] text-sm px-4 py-3 rounded-lg break-all">{error}</div>
      )}

      <div className="bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-[#c4c6cf]/15">
                {["Certificate ID", "Student", "Degree", "Year", "Status", "Date", "Tx Hash", ""].map((h) => (
                  <th key={h} className="text-left px-5 py-3.5 text-[#43474e] text-xs font-semibold uppercase tracking-wider bg-[#FAF7F2]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c4c6cf]/10">
              {loading && (
                <tr>
                  <td colSpan={8} className="text-center py-12">
                    <Loader2 size={22} className="text-[#022448] animate-spin mx-auto" />
                  </td>
                </tr>
              )}
              {!loading && certs.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-[#43474e] text-sm">
                    No certificates found.
                  </td>
                </tr>
              )}
              {!loading && certs.map((cert) => (
                <tr key={cert.id} className="hover:bg-[#FAF7F2] transition-colors">
                  <td className="px-5 py-4">
                    <span className="font-mono text-[#022448] text-sm font-medium">{cert.certificate_id}</span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-[#022448]/10 flex items-center justify-center text-[#022448] text-xs font-bold shrink-0">
                        {cert.student_name?.split(" ").map(n => n[0]).join("").slice(0, 2) ?? "?"}
                      </div>
                      <span className="text-[#022448] text-sm font-medium">{cert.student_name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-[#43474e] text-sm max-w-[200px] truncate">{cert.degree_title}</td>
                  <td className="px-5 py-4 text-[#43474e] text-sm">{cert.graduation_year}</td>
                  <td className="px-5 py-4"><StatusBadge status={cert.status} /></td>
                  <td className="px-5 py-4 text-[#43474e] text-sm whitespace-nowrap">
                    {cert.created_at ? new Date(cert.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-5 py-4 font-mono text-[#43474e] text-xs">
                    {cert.tx_hash ? `${cert.tx_hash.slice(0, 10)}…` : "—"}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <Link href={`/dashboard/certificates/${cert.id}`} className="text-[#7b5900] text-xs font-semibold hover:underline">
                        View
                      </Link>
                      {canDeleteDraft && cert.status === "draft" && (
                        <button
                          onClick={() => handleDeleteDraft(cert)}
                          disabled={!!deleting}
                          className="text-[#C62828] text-xs font-semibold hover:underline disabled:opacity-50"
                        >
                          {deleting === cert.id ? "Deleting…" : "Delete"}
                        </button>
                      )}
                      {canRevoke && cert.status === "issued" && (
                        <button
                          onClick={() => handleRevoke(cert)}
                          disabled={!!revoking}
                          className="text-[#C62828] text-xs font-semibold hover:underline disabled:opacity-50"
                          title="Revoke on-chain (MetaMask gas)"
                        >
                          {revoking === cert.id ? "Revoking…" : "Revoke"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3.5 border-t border-[#c4c6cf]/15 flex items-center justify-between">
          <p className="text-[#43474e] text-xs">
            Page {page} of {totalPages || 1} · {count} total
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 rounded-lg bg-[#eef4ff] text-[#43474e] text-xs font-medium hover:bg-[#022448]/10 disabled:opacity-40 transition-colors"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded-lg bg-[#eef4ff] text-[#43474e] text-xs font-medium hover:bg-[#022448]/10 disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
