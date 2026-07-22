"use client";
import { useState, useEffect } from "react";
import { BarChart3, Download, TrendingUp, ScrollText, BadgeCheck, XCircle, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

export default function ReportsPage() {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    async function load() {
      try {
        // Fetch certificate counts by status
        const [allData, issuedData, revokedData] = await Promise.all([
          api.get("/certificates/"),
          api.get("/certificates/?status=issued"),
          api.get("/certificates/?status=revoked"),
        ]);

        const total   = allData.count   ?? (allData.results   ?? allData).length;
        const issued  = issuedData.count  ?? (issuedData.results  ?? issuedData).length;
        const revoked = revokedData.count ?? (revokedData.results ?? revokedData).length;

        // Pending + draft
        const pending = total - issued - revoked;

        // On-chain: certs with a tx_hash
        const onChain = (issuedData.results ?? issuedData).filter(c => c.tx_hash).length;

        // Yearly breakdown from returned results (rough estimate from available data)
        const allList = allData.results ?? allData;
        const byYear  = {};
        allList.forEach(c => {
          const yr = c.graduation_year ?? new Date(c.created_at ?? "").getFullYear();
          if (yr) byYear[yr] = (byYear[yr] ?? 0) + 1;
        });

        setStats({ total, issued, revoked, pending, onChain, byYear });
      } catch {
        setError("Failed to load report data.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="text-[#022448] animate-spin" />
      </div>
    );
  }

  if (error) {
    return <div className="bg-[#ffdad6] text-[#93000a] text-sm px-4 py-3 rounded-lg max-w-md">{error}</div>;
  }

  const yearEntries = Object.entries(stats?.byYear ?? {}).sort(([a], [b]) => a - b);
  const maxVal      = Math.max(...yearEntries.map(([, v]) => v), 1);

  return (
    <div className="flex flex-col gap-6 max-w-[1280px]">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[#022448] font-bold text-2xl">Reports</h2>
          <p className="text-[#43474e] text-sm mt-0.5">Certificate issuance analytics</p>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 border border-[#022448] text-[#022448] px-5 py-2.5 rounded-[12px] text-sm font-semibold hover:bg-[#022448] hover:text-white transition-all"
        >
          <Download size={16} /> Export / Print
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { icon: ScrollText, value: stats.total,   label: "Total Certificates", color: "text-[#022448]" },
          { icon: TrendingUp, value: stats.issued,  label: "Issued",             color: "text-[#022448]" },
          { icon: BadgeCheck, value: stats.onChain, label: "On-Chain",           color: "text-[#2E7D32]" },
          { icon: XCircle,    value: stats.revoked, label: "Revoked",            color: "text-[#C62828]" },
        ].map(({ icon: Icon, value, label, color }) => (
          <div key={label} className="bg-white rounded-[14px] shadow-card p-5 border border-[#c4c6cf]/10">
            <Icon size={20} className={`${color} mb-2`} strokeWidth={1.8} />
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-[#43474e] text-xs font-semibold uppercase tracking-wider mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Yearly breakdown */}
      {yearEntries.length > 0 && (
        <div className="bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 p-6">
          <h3 className="text-[#022448] font-semibold text-sm mb-5">Certificates by Graduation Year</h3>
          <div className="flex items-end gap-3 h-40">
            {yearEntries.map(([year, count]) => (
              <div key={year} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[#022448] text-xs font-bold">{count}</span>
                <div className="w-full bg-[#eef4ff] rounded-t-lg overflow-hidden" style={{ height: "100px" }}>
                  <div
                    className="w-full bg-[#022448] rounded-t-lg transition-all"
                    style={{ height: `${(count / maxVal) * 100}%` }}
                  />
                </div>
                <span className="text-[#43474e] text-xs">{year}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status breakdown */}
      <div className="bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 p-6">
        <h3 className="text-[#022448] font-semibold text-sm mb-5">Status Breakdown</h3>
        <div className="flex flex-col gap-3">
          {[
            { label: "Issued",  value: stats.issued,  total: stats.total, color: "bg-[#022448]" },
            { label: "Pending", value: stats.pending, total: stats.total, color: "bg-[#ED8A19]" },
            { label: "Revoked", value: stats.revoked, total: stats.total, color: "bg-[#C62828]" },
          ].map(({ label, value, total, color }) => {
            const pct = total > 0 ? Math.round((value / total) * 100) : 0;
            return (
              <div key={label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#022448] font-medium">{label}</span>
                  <span className="text-[#43474e]">{value} ({pct}%)</span>
                </div>
                <div className="w-full bg-[#eef4ff] rounded-full h-2">
                  <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
