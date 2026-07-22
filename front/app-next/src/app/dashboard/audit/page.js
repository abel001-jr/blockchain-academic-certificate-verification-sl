"use client";
import { useState, useEffect, useCallback } from "react";
import { Search, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

const actionColor = {
  "certificate.issued":            "bg-[#022448]/10 text-[#022448]",
  "certificate.created":           "bg-[#43474e]/10 text-[#43474e]",
  "certificate.revoked":           "bg-[#C62828]/10 text-[#C62828]",
  "certificate.verified":          "bg-[#2E7D32]/10 text-[#2E7D32]",
  "certificate.prepared":          "bg-[#ED8A19]/10 text-[#7b4500]",
  "user.wallet_login":             "bg-[#7b5900]/10 text-[#7b5900]",
  "registrar.authorized_on_chain": "bg-[#2E7D32]/10 text-[#2E7D32]",
  "registrar.revoked_on_chain":    "bg-[#C62828]/10 text-[#C62828]",
  "institution.anchored_on_chain": "bg-[#022448]/10 text-[#022448]",
  "chain.issuer_registered":       "bg-[#2E7D32]/10 text-[#2E7D32]",
};

export default function AuditPage() {
  const [logs,    setLogs]    = useState([]);
  const [count,   setCount]   = useState(0);
  const [search,  setSearch]  = useState("");
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      let url = `/audit-logs/?page=${page}&ordering=-timestamp`;
      if (search.trim()) url += `&search=${encodeURIComponent(search.trim())}`;
      const data = await api.get(url);
      setLogs(data.results ?? data);
      setCount(data.count ?? (data.results ?? data).length);
    } catch {
      setError("Failed to load audit logs.");
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
        <h2 className="text-[#022448] font-bold text-2xl">Audit Logs</h2>
        <p className="text-[#43474e] text-sm mt-0.5">
          Immutable record of all system and on-chain actions · {count} total entries
        </p>
      </div>

      {/* Search */}
      <div className="bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 p-4">
        <div className="flex items-center gap-2 bg-[#eef4ff] rounded-[10px] px-3 py-2.5 max-w-md border border-transparent focus-within:border-[#022448] transition-colors">
          <Search size={15} className="text-[#74777f] shrink-0" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by actor, action, target…"
            className="bg-transparent text-sm text-[#121c28] outline-none placeholder:text-[#74777f] w-full"
          />
        </div>
      </div>

      {error && <div className="bg-[#ffdad6] text-[#93000a] text-sm px-4 py-3 rounded-lg">{error}</div>}

      <div className="bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-[#c4c6cf]/15">
                {["Timestamp", "Actor", "Action", "Target", "Detail"].map(h => (
                  <th key={h} className="text-left px-5 py-3.5 text-[#43474e] text-xs font-semibold uppercase tracking-wider bg-[#FAF7F2]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c4c6cf]/10">
              {loading && (
                <tr><td colSpan={5} className="text-center py-12">
                  <Loader2 size={22} className="text-[#022448] animate-spin mx-auto" />
                </td></tr>
              )}
              {!loading && logs.length === 0 && (
                <tr><td colSpan={5} className="text-center py-12 text-[#43474e] text-sm">No audit logs found.</td></tr>
              )}
              {!loading && logs.map(log => (
                <tr key={log.id} className="hover:bg-[#FAF7F2] transition-colors">
                  <td className="px-5 py-3.5 font-mono text-[#43474e] text-xs whitespace-nowrap">
                    {log.timestamp ? new Date(log.timestamp).toLocaleString() : "—"}
                  </td>
                  <td className="px-5 py-3.5 text-[#022448] text-sm">{log.actor_email || "system"}</td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2.5 py-1 rounded text-[11px] font-semibold ${actionColor[log.action] ?? "bg-[#74777f]/10 text-[#43474e]"}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-[#43474e] text-xs">{log.target_id || "—"}</td>
                  <td className="px-5 py-3.5 text-[#43474e] text-sm max-w-[280px] truncate" title={log.detail}>{log.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-5 py-3.5 border-t border-[#c4c6cf]/15 flex items-center justify-between">
          <p className="text-[#43474e] text-xs">Page {page} of {totalPages || 1} · {count} total</p>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 rounded-lg bg-[#eef4ff] text-[#43474e] text-xs font-medium hover:bg-[#022448]/10 disabled:opacity-40 transition-colors">
              Previous
            </button>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded-lg bg-[#eef4ff] text-[#43474e] text-xs font-medium hover:bg-[#022448]/10 disabled:opacity-40 transition-colors">
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
