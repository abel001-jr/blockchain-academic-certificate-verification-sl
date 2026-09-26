"use client";
import { useState, useEffect } from "react";
import { Download, TrendingUp, ScrollText, BadgeCheck, XCircle, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

export default function ReportsPage() {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [allData, issuedData, revokedData] = await Promise.all([
          api.get("/certificates/"),
          api.get("/certificates/?status=issued"),
          api.get("/certificates/?status=revoked"),
        ]);
        const total   = allData.count   ?? (allData.results   ?? allData).length;
        const issued  = issuedData.count  ?? (issuedData.results  ?? issuedData).length;
        const revoked = revokedData.count ?? (revokedData.results ?? revokedData).length;
        const pending = total - issued - revoked;
        const onChain = (issuedData.results ?? issuedData).filter(c => c.tx_hash).length;
        const allList = allData.results ?? allData;
        const byYear  = {};
        allList.forEach(c => {
          const yr = c.graduation_year ?? new Date(c.created_at ?? "").getFullYear();
          if (yr) byYear[yr] = (byYear[yr] ?? 0) + 1;
        });
        setStats({ total, issued, revoked, pending, onChain, byYear });
      } catch (err) { 
        console.error("Reports error:", err);
        setError(err?.detail || "Failed to load report data. Please ensure the backend is running and accessible."); 
      }
      finally  { setLoading(false); }
    }
    load();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-48"><Loader2 size={26} className="text-[#08283F] animate-spin" /></div>;
  if (error)   return <div className="dash-error max-w-md">{error}</div>;

  const yearEntries = Object.entries(stats?.byYear ?? {}).sort(([a], [b]) => a - b);
  const maxVal      = Math.max(...yearEntries.map(([, v]) => v), 1);

  return (
    <div className="flex flex-col gap-5 w-full">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[#08283F] font-bold text-2xl">Reports</h2>
          <p className="text-[#4A5A68] text-sm mt-0.5">Certificate issuance analytics</p>
        </div>
        <button onClick={() => window.print()}
          className="flex items-center gap-2 border border-[#E4E1D6] text-[#08283F] px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#08283F] hover:text-white transition-all">
          <Download size={15} /> Export
        </button>
      </div>

      {/* KPI row — inline, compact */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: ScrollText, value: stats.total,   label: "Total",    color: "text-[#08283F]", bg: "bg-[#08283F]/6" },
          { icon: TrendingUp, value: stats.issued,  label: "Issued",   color: "text-[#08283F]", bg: "bg-[#08283F]/6" },
          { icon: BadgeCheck, value: stats.onChain, label: "On-Chain", color: "text-[#2F6F4E]", bg: "bg-[#E7F1EB]" },
          { icon: XCircle,    value: stats.revoked, label: "Revoked",  color: "text-[#A23B34]", bg: "bg-[#F5E5E3]" },
        ].map(({ icon: Icon, value, label, color, bg }) => (
          <div key={label} className="bg-white rounded-xl border border-[#E4E1D6] px-4 py-3 flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${bg}`}>
              <Icon size={15} className={color} strokeWidth={1.8} />
            </div>
            <div>
              <p className={`text-xl font-bold leading-none ${color}`}>{value}</p>
              <p className="text-[#4A5A68] text-xs font-medium mt-1">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Bar chart — graduation year */}
      {yearEntries.length > 0 && (
        <div className="dash-card p-5">
          <h3 className="text-[#08283F] font-semibold text-sm mb-4">Certificates by Graduation Year</h3>
          <div className="flex items-end gap-3" style={{ height: "120px" }}>
            {yearEntries.map(([year, count]) => (
              <div key={year} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <span className="text-[#08283F] text-xs font-bold">{count}</span>
                <div className="w-full bg-[#EAF2FB] rounded-t-md overflow-hidden" style={{ height: "80px" }}>
                  <div className="w-full bg-[#08283F] rounded-t-md transition-all"
                    style={{ height: `${(count / maxVal) * 100}%` }} />
                </div>
                <span className="text-[#4A5A68] text-xs">{year}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status breakdown */}
      <div className="dash-card p-5">
        <h3 className="text-[#08283F] font-semibold text-sm mb-4">Status Breakdown</h3>
        <div className="flex flex-col gap-3">
          {[
            { label: "Issued",  value: stats.issued,  color: "bg-[#08283F]" },
            { label: "Pending", value: stats.pending, color: "bg-[#B98A28]" },
            { label: "Revoked", value: stats.revoked, color: "bg-[#A23B34]" },
          ].map(({ label, value, color }) => {
            const pct = stats.total > 0 ? Math.round((value / stats.total) * 100) : 0;
            return (
              <div key={label}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-[#08283F] font-medium">{label}</span>
                  <span className="text-[#4A5A68]">{value} <span className="text-[#8A929C]">({pct}%)</span></span>
                </div>
                <div className="w-full bg-[#EAF2FB] rounded-full h-2">
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
