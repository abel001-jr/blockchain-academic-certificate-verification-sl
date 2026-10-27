"use client";
import tableStyles from "@/components/dashboard/RecordTable.module.css";
import NavigationButton from "@/components/ui/NavigationButton";

import { useState, useEffect, useCallback } from "react";
import { Search, Loader2, ShieldCheck, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import { api } from "@/lib/api";
import styles from "@/app/dashboard/audit/AuditPage.module.css";

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

export default function AuditRecords({ approvalOnly = false }) {
  const { role } = useAuth();
  const [logs,    setLogs]    = useState([]);
  const [count,   setCount]   = useState(0);
  const [search,  setSearch]  = useState("");
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      let url = `/audit-logs/?page=${page}&page_size=20&ordering=-timestamp`;
      if (approvalOnly) url += "&action=" + (role === "vc" ? "certificate.vc_approved" : "certificate.chancellor_approved");
      if (search.trim()) url += `&search=${encodeURIComponent(search.trim())}`;
      const data = await api.get(url);
      setLogs(data.results ?? data);
      setCount(data.count ?? (data.results ?? data).length);
    } catch {
      setError("Failed to load audit logs.");
    } finally {
      setLoading(false);
    }
  }, [page, search, approvalOnly, role]);

  useEffect(() => { if (approvalOnly && !role) return; const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load, approvalOnly, role]);

  const pageSize   = 20;
  const totalPages = Math.ceil(count / pageSize);

  return (
    <div className={`${styles.page} flex flex-col gap-5 w-full`}>
      <header className={styles.hero}>
        <div className={styles.title}><ShieldCheck size={28} /><div><span className={styles.eyebrow}>Accountability &amp; activity</span><h2>{approvalOnly ? "Approval activity" : "Audit logs"}</h2><p>{approvalOnly ? "Recorded credential approvals for your signing role." : "Review recorded account, credential and blockchain actions."}</p></div></div>
        <div className={styles.summary}><strong>{count}</strong><span>matching entries</span><button type="button" onClick={load} disabled={loading} className={styles.refresh}><RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh</button></div>
      </header>
      {/* Search */}
      <div className={`dash-card p-4 ${styles.filters}`}>
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

      <div className={`${tableStyles.frame} ${styles.records}`}>
        <div className={styles.recordHeader}><h3>{approvalOnly ? "Recorded approvals" : "Recorded events"}</h3><span>Newest first &middot; {logs.length} entries on this page</span></div>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
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
                  <td data-label="When" className="dash-td text-[#4A5A68] text-xs">
                    {log.timestamp ? new Date(log.timestamp).toLocaleString() : "—"}
                  </td>
                  <td data-label="Actor" className="dash-td text-[#08283F]">{log.actor_email || "system"}</td>
                  <td data-label="Action" className="dash-td">
                    <span className={`px-2.5 py-1 rounded text-[11px] font-semibold ${actionColor[log.action] ?? "bg-[#8A929C]/10 text-[#4A5A68]"}`}>
                      {log.action?.split(".").pop()?.replaceAll("_", " ")}
                    </span><span className="mt-1 block text-[11px] text-[#687B8E] break-words">{log.action}</span>
                  </td>
                  <td data-label="Target" className="dash-td font-mono text-[#4A5A68] text-xs break-all">{log.target_id || "—"}</td>
                  <td data-label="Details" className="dash-td text-[#4A5A68] break-words"><details><summary className="cursor-pointer font-semibold text-[#08283F]">View event details</summary><p className="mt-2 leading-6">{log.detail || "No additional details recorded."}</p></details></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className={styles.pagination}>
          <p className="dash-pagination-text">Page {page} of {totalPages || 1} · {count} total</p>
          <div className="flex gap-2">
            <NavigationButton direction="back" disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="dash-pagination-btn">
              Previous
            </NavigationButton>
            <NavigationButton disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              className="dash-pagination-btn">
              Next
            </NavigationButton>
          </div>
        </div>
      </div>
    </div>
  );
}
