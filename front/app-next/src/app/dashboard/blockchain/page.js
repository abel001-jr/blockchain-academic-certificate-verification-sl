"use client";
import { useState, useEffect, useCallback } from "react";
import { Link2, ShieldCheck, Loader2, Search, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";

export default function BlockchainPage() {
  const [certs,   setCerts]   = useState([]);
  const [count,   setCount]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [search,  setSearch]  = useState("");
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      let url = `/certificates/?page=${page}&status=issued&ordering=-chain_issued_at`;
      if (search.trim()) url += `&search=${encodeURIComponent(search.trim())}`;
      const data = await api.get(url);
      const list = data.results ?? data;
      setCerts(list);
      setCount(data.count ?? list.length);
    } catch (err) {
      console.error("Blockchain records error:", err);
      setError(err?.detail || "Failed to load blockchain records. Please ensure the backend is running and accessible.");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const pageSize   = 20;
  const totalPages = Math.ceil(count / pageSize);

  return (
    <div className="flex flex-col gap-7 w-full">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="dash-page-title">Blockchain Records</h2>
          <p className="dash-page-sub">On-chain certificate transactions anchored to Ethereum</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 border border-[#E4E1D6] text-[#08283F] px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#EAF2FB] transition-colors"
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/* Network status banner */}
      <div className="bg-[#08283F] rounded-xl p-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute -right-12 -bottom-12 w-56 h-56 bg-[#B98A28]/15 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex items-center gap-5">
          <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
            <ShieldCheck size={22} className="text-[#E9DAB8]" />
          </div>
          <div>
            <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-0.5">Network</p>
            <p className="text-white font-bold text-2xl leading-tight">Ethereum</p>
            <p className="text-white/60 text-sm mt-0.5">
              {process.env.NEXT_PUBLIC_ETH_RPC_URL ?? "Credence Local"}
            </p>
          </div>
        </div>
        <div className="relative z-10 flex items-center gap-10">
          <div className="text-center">
            <p className="text-[#E9DAB8] font-bold text-3xl leading-none">{count}</p>
            <p className="text-white/60 text-sm mt-1.5">On-Chain Certificates</p>
          </div>
          <div className="flex items-center gap-2.5 bg-white/10 px-4 py-2.5 rounded-xl">
            <span className="w-2.5 h-2.5 rounded-full bg-[#2F6F4E] animate-pulse shrink-0" />
            <span className="text-white/80 text-sm font-medium">Node Active</span>
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div className="dash-card p-5">
        <label className="block text-sm font-semibold text-[#08283F] mb-2.5">Search Records</label>
        <div className="dash-search max-w-xl">
          <Search size={16} className="text-[#8A929C] shrink-0" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by certificate ID or student name…"
          />
        </div>
      </div>

      {error && <div className="dash-error">{error}</div>}

      {/* Table */}
      <div className="dash-card">
        <div className="dash-card-header">
          <h3 className="dash-section-title flex items-center gap-2">
            <Link2 size={17} className="text-[#B98A28]" />
            Certificate Transactions
          </h3>
          <span className="text-sm text-[#4A5A68]">{count} record{count !== 1 ? "s" : ""}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr>
                {["Certificate ID", "Student", "Degree", "Issued On-Chain", "Status", ""].map(h => (
                  <th key={h} className="dash-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E1D6]">
              {loading && (
                <tr>
                  <td colSpan={6} className="text-center py-16">
                    <Loader2 size={26} className="text-[#08283F] animate-spin mx-auto" />
                  </td>
                </tr>
              )}
              {!loading && certs.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-16">
                    <Link2 size={28} className="text-[#B9C6D2] mx-auto mb-3" />
                    <p className="text-[#4A5A68] text-base">No on-chain records yet.</p>
                    <p className="text-[#8A929C] text-sm mt-1">Certificates will appear here once they are issued and anchored.</p>
                  </td>
                </tr>
              )}
              {!loading && certs.map(cert => (
                <tr key={cert.id} className="hover:bg-[#F8F7F2] transition-colors">
                  <td className="dash-td">
                    <span className="font-mono font-semibold text-[#08283F]">{cert.certificate_id}</span>
                  </td>
                  <td className="dash-td font-medium text-[#08283F]">{cert.student_name}</td>
                  <td className="dash-td text-[#4A5A68] text-sm">{cert.degree_title}</td>
                  <td className="dash-td text-[#4A5A68] whitespace-nowrap">
                    {cert.chain_issued_at
                      ? new Date(cert.chain_issued_at).toLocaleDateString("en-GB", {
                          day: "2-digit", month: "short", year: "numeric",
                        })
                      : <span className="text-[#B9C6D2]">—</span>}
                  </td>
                  <td className="dash-td">
                    <span className={`dash-badge text-xs font-semibold ${
                      cert.status === "issued"  ? "bg-[#E7F1EB] text-[#2F6F4E]" :
                      cert.status === "revoked" ? "bg-[#F5E5E3] text-[#A23B34]" :
                      "bg-[#EAF2FB] text-[#08283F]"
                    }`}>
                      {cert.status}
                    </span>
                  </td>
                  <td className="dash-td">
                    <a
                      href={`/dashboard/certificates/${cert.id}`}
                      className="flex items-center gap-1 text-[#B98A28] text-sm font-semibold hover:underline whitespace-nowrap"
                    >
                      View <Link2 size={12} />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 border-t border-[#E4E1D6] flex items-center justify-between">
          <p className="dash-pagination-text">
            Page {page} of {totalPages || 1} · {count} total record{count !== 1 ? "s" : ""}
          </p>
          <div className="flex gap-2.5">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="dash-pagination-btn"
            >
              ← Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="dash-pagination-btn"
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
