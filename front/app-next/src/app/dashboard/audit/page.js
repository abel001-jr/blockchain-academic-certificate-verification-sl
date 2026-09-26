"use client";
import { useState, useEffect, useCallback } from "react";
import { Search, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

const actionColor = {
  "certificate.issued":            "bg-[#08283F]/10 text-[#08283F]",
  "certificate.created":           "bg-[#4A5A68]/10 text-[#4A5A68]",
  "certificate.revoked":           "bg-[#A23B34]/10 text-[#A23B34]",
  "certificate.verified":          "bg-[#2F6F4E]/10 text-[#2F6F4E]",
  "certificate.prepared":          "bg-[#A9721F]/10 text-[#7b4500]",
  "user.wallet_login":             "bg-[#B98A28]/10 text-[#B98A28]",
  "registrar.authorized_on_chain": "bg-[#2F6F4E]/10 text-[#2F6F4E]",
  "registrar.revoked_on_chain":    "bg-[#A23B34]/10 text-[#A23B34]",
  "institution.anchored_on_chain": "bg-[#08283F]/10 text-[#08283F]",
  "chain.issuer_registered":       "bg-[#2F6F4E]/10 text-[#2F6F4E]",
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
    <div className="flex flex-col gap-6 w-full">
      <div>
        <h2 className="dash-page-title">Audit Logs</h2>
        <p className="dash-page-sub">
          Immutable record of all system and on-chain actions · {count} total entries
        </p>
      </div>

      {/* Search */}
      <div className="dash-card p-4">
        <div className="dash-search max-w-md">
          <Search size={15} className="text-[#8A929C] shrink-0" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by actor, action, target…"
          />
        </div>
      </div>

      {error && <div className="dash-error">{error}</div>}

      <div className="dash-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr>
                {["Timestamp", "Actor", "Action", "Target", "Detail"].map(h => (
                  <th key={h} className="dash-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E1D6]">
              {loading && (
                <tr><td colSpan={5} className="text-center py-12">
                  <Loader2 size={22} className="text-[#08283F] animate-spin mx-auto" />
                </td></tr>
              )}
              {!loading && logs.length === 0 && (
                <tr><td colSpan={5} className="text-center py-12 text-[#4A5A68] text-sm">No audit logs found.</td></tr>
              )}
              {!loading && logs.map(log => (
                <tr key={log.id} className="hover:bg-[#F8F7F2] transition-colors">
                  <td className="dash-td font-mono text-[#4A5A68] text-xs whitespace-nowrap">
                    {log.timestamp ? new Date(log.timestamp).toLocaleString() : "—"}
                  </td>
                  <td className="dash-td text-[#08283F]">{log.actor_email || "system"}</td>
                  <td className="dash-td">
                    <span className={`px-2.5 py-1 rounded text-[11px] font-semibold ${actionColor[log.action] ?? "bg-[#8A929C]/10 text-[#4A5A68]"}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="dash-td font-mono text-[#4A5A68] text-xs">{log.target_id || "—"}</td>
                  <td className="dash-td text-[#4A5A68] max-w-[280px] truncate" title={log.detail}>{log.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-5 py-4 border-t border-[#E4E1D6] flex items-center justify-between">
          <p className="dash-pagination-text">Page {page} of {totalPages || 1} · {count} total</p>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="dash-pagination-btn">
              Previous
            </button>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              className="dash-pagination-btn">
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
