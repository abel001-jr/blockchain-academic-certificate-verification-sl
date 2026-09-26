"use client";
import { useEffect, useState, useCallback } from "react";
import {
  ScrollText, Users, BadgeCheck, Link2,
  UserPlus, Eye, Database, FileText,
  ShieldCheck, ArrowRight, Loader2,
} from "lucide-react";
import StatCard    from "@/components/dashboard/StatCard";
import StatusBadge from "@/components/dashboard/StatusBadge";
import Link        from "next/link";
import { api, jwtPayload }  from "@/lib/api";
import { ROLES } from "@/lib/useAuth";

function dotColor(action) {
  if (action?.includes("issued"))   return "gold";
  if (action?.includes("login"))    return "navy";
  return "gray";
}

export default function InstAdminDashboard() {
  const [certs,  setCerts]  = useState([]);
  const [audit,  setAudit]  = useState([]);
  const [stats,  setStats]  = useState({ total: "—", registrars: "—", verifications: "—", txns: "—" });
  const [inst,   setInst]   = useState(null);
  const [busy,   setBusy]   = useState(true);
  const [role,   setRole]   = useState(null);

  useEffect(() => {
    const p = jwtPayload();
    setRole(p?.role);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [certData, auditData] = await Promise.all([
          api.get("/certificates/?ordering=-created_at"),
          api.get("/audit-logs/?ordering=-timestamp"),
        ]);

        const list = certData.results ?? certData;
        setCerts(list.slice(0, 5));
        setStats(prev => ({ ...prev, total: certData.count ?? list.length }));
        setAudit((auditData.results ?? auditData).slice(0, 5));

        // Try to get registrar count and institution
        try {
          const users = await api.get("/users/?role=registrar");
          setStats(prev => ({ ...prev, registrars: (users.results ?? users).length }));
        } catch {}

        const p = jwtPayload();
        if (p?.institution) {
          try {
            const instData = await api.get(`/institutions/${p.institution}/`);
            setInst(instData);
          } catch {}
        }
      } catch (e) {
        console.error(e);
      } finally {
        setBusy(false);
      }
    }
    load();
  }, []);

  const canAddRegistrar = [ROLES.SUPER_ADMIN, ROLES.INSTITUTIONAL_ADMIN].includes(role);

  if (busy) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="text-[#022448] animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 w-full">

      {/* Institution status */}
      <div className="bg-white rounded-xl shadow-card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-[#E4E1D6]/50">
        <div>
          <h2 className="text-[#08283F] font-bold text-xl mb-0.5">
            {inst?.name ?? "Your Institution"}
          </h2>
          <p className="text-[#4A5A68] text-sm">ID: {inst?.institution_id ?? "—"}</p>
          <div className="flex items-center gap-2 mt-2 text-sm text-[#4A5A68]">
            <Link2 size={14} />
            <span>Blockchain: <span className="text-[#08283F] font-medium">Ethereum</span></span>
          </div>
        </div>
        {inst?.is_chain_active ? (
          <span className="inline-flex items-center gap-1.5 bg-[#B98A28]/10 text-[#B98A28] text-xs font-semibold px-3 py-1.5 rounded-full border border-[#B98A28]/20 self-start sm:self-auto">
            <ShieldCheck size={12} /> Verified On-Chain
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 bg-[#F5EBDB] text-[#A9721F] text-xs font-semibold px-3 py-1.5 rounded-full border border-[#A9721F]/20 self-start sm:self-auto">
            Awaiting on-chain anchor
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={ScrollText} value={stats.total}      label="Total Certificates" />
        <StatCard icon={Users}      value={stats.registrars} label="Registrars" />
        <StatCard icon={BadgeCheck} value="—"                label="Verifications" accent />
        <StatCard icon={Link2}      value="—"                label="Blockchain Txns" />
      </div>

      {/* Quick actions */}
      <div>
        <h3 className="text-[#08283F] font-semibold text-sm uppercase tracking-wider mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {canAddRegistrar && (
            <Link href="/dashboard/registrars"
              className="bg-[#08283F] text-white h-12 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold hover:opacity-90 transition-all active:scale-95 shadow-card"
            >
              <UserPlus size={16} /> Add Registrar
            </Link>
          )}
          <Link href="/dashboard/certificates"
            className="border border-[#08283F] text-[#08283F] h-12 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold hover:bg-[#EAF2FB] transition-all"
          >
            <Eye size={16} /> Certificates
          </Link>
          <Link href="/dashboard/blockchain"
            className="border border-[#08283F] text-[#08283F] h-12 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold hover:bg-[#EAF2FB] transition-all"
          >
            <Database size={16} /> Blockchain
          </Link>
          <Link href="/dashboard/reports"
            className="border border-[#08283F] text-[#08283F] h-12 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold hover:bg-[#EAF2FB] transition-all"
          >
            <FileText size={16} /> Reports
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Recent certificates */}
        <div className="xl:col-span-2 bg-white rounded-xl shadow-card border border-[#E4E1D6]/50 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#E4E1D6]/40">
            <h3 className="text-[#08283F] font-semibold text-base">Recent Certificates</h3>
            <Link href="/dashboard/certificates" className="text-[#B98A28] text-sm font-semibold flex items-center gap-1 hover:underline">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-[#E4E1D6]/40">
            {certs.length === 0 && (
              <p className="px-6 py-8 text-[#4A5A68] text-sm text-center">No certificates yet.</p>
            )}
            {certs.map(cert => (
              <div key={cert.id} className="flex items-center justify-between px-6 py-4 hover:bg-[#F8F7F2] transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-[#08283F]/5 flex items-center justify-center shrink-0">
                    <ScrollText size={16} className="text-[#08283F]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[#08283F] text-sm font-semibold truncate">{cert.student_name}</p>
                    <p className="text-[#4A5A68] text-xs truncate">{cert.degree_title}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0 ml-4">
                  <StatusBadge status={cert.status} />
                  <span className="text-[#8A929C] text-xs">
                    {cert.created_at ? new Date(cert.created_at).toLocaleDateString() : "—"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6">

          {/* Blockchain status */}
          <div className="bg-[#08283F] rounded-xl p-6 shadow-card relative overflow-hidden">
            <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-[#B98A28]/20 rounded-full blur-2xl" />
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck size={16} className="text-[#E9DAB8]" />
                <span className="text-white/75 text-xs font-semibold uppercase tracking-widest">Network Status</span>
              </div>
              <p className="text-white text-xl font-bold">Ethereum</p>
              <p className="text-white/70 text-sm mt-0.5">Development Network</p>
              <div className="mt-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#2F6F4E] animate-pulse" />
                <span className="text-white/75 text-sm">Node Active</span>
              </div>
            </div>
          </div>

          {/* Audit timeline */}
          <div className="bg-white rounded-xl shadow-card border border-[#E4E1D6]/50 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-[#08283F] font-semibold text-base">Recent Activity</h3>
              <Link href="/dashboard/audit" className="text-[#B98A28] text-sm font-semibold hover:underline">View all</Link>
            </div>
            <div className="flex flex-col gap-0 relative">
              <div className="absolute left-[5px] top-0 bottom-0 w-px bg-[#E4E1D6]" />
              {audit.length === 0 && <p className="pl-6 text-[#4A5A68] text-sm">No activity yet.</p>}
              {audit.map((item, i) => (
                <div key={i} className="flex gap-4 pb-5 last:pb-0">
                  <div className="mt-1.5 shrink-0">
                    <div className={`w-3 h-3 rounded-full ring-4 ${
                      dotColor(item.action) === "gold"
                        ? "bg-[#B98A28] ring-[#B98A28]/10"
                        : dotColor(item.action) === "navy"
                        ? "bg-[#08283F] ring-[#08283F]/10"
                        : "bg-[#E4E1D6] ring-[#E4E1D6]/20"
                    }`} />
                  </div>
                  <div>
                    <p className="text-[#4A5A68] text-xs font-medium mb-0.5">
                      {item.timestamp ? new Date(item.timestamp).toLocaleString() : "—"}
                    </p>
                    <p className="text-[#08283F] text-sm font-semibold">{item.action}</p>
                    <p className="text-[#8A929C] text-xs mt-0.5 truncate max-w-[220px]">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
