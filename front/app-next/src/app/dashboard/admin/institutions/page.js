"use client";
import { useState, useEffect } from "react";
import { Building2, Loader2, CheckCircle2, XCircle, Link2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth, ROLES } from "@/lib/useAuth";

export default function AllInstitutionsPage() {
  const { role, loading: authLoading } = useAuth();
  const [insts,   setInsts]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    if (authLoading || role !== ROLES.SUPER_ADMIN) return;
    api.get("/institutions/")
      .then(data => setInsts(data.results ?? data))
      .catch(() => setError("Failed to load institutions."))
      .finally(() => setLoading(false));
  }, [authLoading, role]);

  if (authLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={26} className="text-[#022448] animate-spin" />
      </div>
    );
  }

  if (role !== ROLES.SUPER_ADMIN) {
    return <p className="text-[#C62828] text-sm">Super Admin access only.</p>;
  }

  return (
    <div className="flex flex-col gap-6 max-w-[1280px]">
      <div>
        <h2 className="text-[#022448] font-bold text-2xl">All Institutions</h2>
        <p className="text-[#43474e] text-sm mt-0.5">{insts.length} registered institutions</p>
      </div>

      {error && <div className="bg-[#ffdad6] text-[#93000a] text-sm px-4 py-3 rounded-lg">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={26} className="text-[#022448] animate-spin" /></div>
      ) : (
        <div className="bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-[#c4c6cf]/15">
                  {["ID", "Name", "Country", "Wallet", "On-Chain", "Active"].map(h => (
                    <th key={h} className="text-left px-5 py-3.5 text-[#43474e] text-xs font-semibold uppercase tracking-wider bg-[#FAF7F2]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#c4c6cf]/10">
                {insts.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-12 text-[#43474e] text-sm">No institutions found.</td></tr>
                )}
                {insts.map(inst => (
                  <tr key={inst.id} className="hover:bg-[#FAF7F2] transition-colors">
                    <td className="px-5 py-4 font-mono text-[#022448] text-sm">{inst.institution_id}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <Building2 size={15} className="text-[#022448] shrink-0" />
                        <span className="text-[#022448] text-sm font-medium">{inst.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-[#43474e] text-sm">{inst.country}</td>
                    <td className="px-5 py-4 font-mono text-[#43474e] text-xs">
                      {inst.wallet_address ? inst.wallet_address.slice(0, 14) + "…" : "—"}
                    </td>
                    <td className="px-5 py-4">
                      {inst.is_chain_active
                        ? <CheckCircle2 size={16} className="text-[#2E7D32]" />
                        : <XCircle size={16} className="text-[#74777f]" />}
                    </td>
                    <td className="px-5 py-4">
                      {inst.is_active
                        ? <CheckCircle2 size={16} className="text-[#2E7D32]" />
                        : <XCircle size={16} className="text-[#C62828]" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
