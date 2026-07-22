"use client";
import { useState, useEffect, useCallback } from "react";
import { Link2, ShieldCheck, Loader2, Search } from "lucide-react";
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
      // Only show issued certs (those with a tx_hash)
      let url = `/certificates/?page=${page}&status=issued&ordering=-chain_issued_at`;
      if (search.trim()) url += `&search=${encodeURIComponent(search.trim())}`;
      const data = await api.get(url);
      const list = (data.results ?? data).filter(c => c.tx_hash);
      setCerts(list);
      setCount(data.count ?? list.length);
    } catch {
      setError("Failed to load blockchain records.");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const pageSize   = 20;
  const totalPages = Math.ceil(count / pageSize);

  return (
    <div className="flex flex-col gap-6 max-w-[1280px]">
      <div>
        <h2 className="text-[#022448] font-bold text-2xl">Blockchain Records</h2>
        <p className="text-[#43474e] text-sm mt-0.5">On-chain certificate transactions from the database</p>
      </div>

      {/* Network status banner */}
      <div className="bg-[#022448] rounded-[14px] p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-[#7b5900]/20 rounded-full blur-3xl" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck size={16} className="text-[#ffdea4]" />
            <span className="text-white/70 text-xs font-semibold uppercase tracking-widest">Network</span>
          </div>
          <p className="text-white font-bold text-xl">Ethereum</p>
          <p className="text-white/60 text-xs mt-0.5">
            {process.env.NEXT_PUBLIC_ETH_RPC_URL ?? "http://127.0.0.1:8545"}
          </p>
        </div>
        <div className="relative z-10 flex gap-8">
          <div className="text-right">
            <p className="text-[#ffdea4] font-bold text-lg">{count}</p>
            <p className="text-white/60 text-xs">On-Chain Certs</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#2E7D32] animate-pulse" />
            <span className="text-white/70 text-xs">Active</span>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 p-4">
        <div className="flex items-center gap-2 bg-[#eef4ff] rounded-[10px] px-3 py-2.5 max-w-md border border-transparent focus-within:border-[#022448] transition-colors">
          <Search size={15} className="text-[#74777f] shrink-0" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by certificate ID or student name…"
            className="bg-transparent text-sm text-[#121c28] outline-none placeholder:text-[#74777f] w-full" />
        </div>
      </div>

      {error && <div className="bg-[#ffdad6] text-[#93000a] text-sm px-4 py-3 rounded-lg">{error}</div>}

      <div className="bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-[#c4c6cf]/15">
          <h3 className="text-[#022448] font-semibold text-sm">Certificate Transactions</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-[#c4c6cf]/15">
                {["Certificate ID", "Student", "Tx Hash", "Block", "IPFS JSON", "Date"].map(h => (
                  <th key={h} className="text-left px-5 py-3.5 text-[#43474e] text-xs font-semibold uppercase tracking-wider bg-[#FAF7F2]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c4c6cf]/10">
              {loading && (
                <tr><td colSpan={6} className="text-center py-12">
                  <Loader2 size={22} className="text-[#022448] animate-spin mx-auto" />
                </td></tr>
              )}
              {!loading && certs.length === 0 && (
                <tr><td colSpan={6} className="text-center py-12 text-[#43474e] text-sm">No on-chain records yet.</td></tr>
              )}
              {!loading && certs.map(cert => (
                <tr key={cert.id} className="hover:bg-[#FAF7F2] transition-colors">
                  <td className="px-5 py-4 font-mono text-[#022448] text-sm font-medium">{cert.certificate_id}</td>
                  <td className="px-5 py-4 text-[#022448] text-sm">{cert.student_name}</td>
                  <td className="px-5 py-4 font-mono text-[#43474e] text-xs">
                    {cert.tx_hash ? cert.tx_hash.slice(0, 14) + "…" : "—"}
                  </td>
                  <td className="px-5 py-4 font-mono text-[#43474e] text-sm">
                    {cert.block_number ? `#${cert.block_number}` : "—"}
                  </td>
                  <td className="px-5 py-4 font-mono text-[#43474e] text-xs">
                    {cert.ipfs_cid_json
                      ? <a href={`https://gateway.pinata.cloud/ipfs/${cert.ipfs_cid_json}`} target="_blank" rel="noopener noreferrer"
                          className="text-[#7b5900] hover:underline flex items-center gap-1">
                          {cert.ipfs_cid_json.slice(0, 12)}… <Link2 size={11} />
                        </a>
                      : "—"}
                  </td>
                  <td className="px-5 py-4 text-[#43474e] text-sm whitespace-nowrap">
                    {cert.chain_issued_at ? new Date(cert.chain_issued_at).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-[#c4c6cf]/15 flex items-center justify-between">
          <p className="text-[#43474e] text-xs">Page {page} of {totalPages || 1} · {count} total</p>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 rounded-lg bg-[#eef4ff] text-[#43474e] text-xs font-medium hover:bg-[#022448]/10 disabled:opacity-40 transition-colors">Previous</button>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded-lg bg-[#eef4ff] text-[#43474e] text-xs font-medium hover:bg-[#022448]/10 disabled:opacity-40 transition-colors">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
