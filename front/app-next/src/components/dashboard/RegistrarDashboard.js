"use client";
import Link from "next/link";
import {
  ScrollText, Users, BadgeCheck, Link2,
  UserPlus, Eye, Database, FileText,
  ShieldCheck, ArrowRight, Loader2,
} from "lucide-react";
import { useEffect, useState } from "react";
import StatCard    from "@/components/dashboard/StatCard";
import StatusBadge from "@/components/dashboard/StatusBadge";
import { api, jwtPayload } from "@/lib/api";

/**
 * Registrar = institution head (anchored on-chain issuer).
 * Prepares certificates; adds VC & Chancellor; does not final-issue alone.
 */
export default function RegistrarDashboard() {
  const [certs,  setCerts]  = useState([]);
  const [stats,  setStats]  = useState({ total: "—", pending: "—", officers: "—" });
  const [inst,   setInst]   = useState(null);
  const [busy,   setBusy]   = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const certData = await api.get("/certificates/?ordering=-created_at");
        const list = certData.results ?? certData;
        setCerts(list.slice(0, 5));
        const pending = list.filter(c =>
          c.status === "pending_vc" || c.status === "pending_chancellor" || c.status === "pending"
        ).length;
        setStats(prev => ({
          ...prev,
          total: certData.count ?? list.length,
          pending,
        }));

        try {
          const [vcs, chans] = await Promise.all([
            api.get("/users/?role=vc"),
            api.get("/users/?role=chancellor"),
          ]);
          const n = (vcs.results ?? vcs).length + (chans.results ?? chans).length;
          setStats(prev => ({ ...prev, officers: n }));
        } catch {}

        const p = jwtPayload();
        if (p?.institution) {
          try {
            setInst(await api.get(`/institutions/${p.institution}/`));
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

  if (busy) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="text-[#022448] animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 max-w-[1280px]">
      <div className="bg-white rounded-[14px] shadow-card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-[#c4c6cf]/10">
        <div>
          <p className="text-[#74777f] text-xs font-semibold uppercase tracking-widest mb-1">Registrar · Institution Head</p>
          <h2 className="text-[#022448] font-bold text-xl mb-0.5">{inst?.name ?? "Your Institution"}</h2>
          <p className="text-[#43474e] text-sm">ID: {inst?.institution_id ?? "—"}</p>
        </div>
        {inst?.is_chain_active ? (
          <span className="inline-flex items-center gap-1.5 bg-[#7b5900]/10 text-[#7b5900] text-xs font-bold px-3 py-1.5 rounded-full border border-[#7b5900]/20">
            <ShieldCheck size={12} /> Anchored On-Chain
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 bg-[#ED8A19]/10 text-[#ED8A19] text-xs font-bold px-3 py-1.5 rounded-full border border-[#ED8A19]/20">
            Awaiting on-chain anchor
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard icon={ScrollText} value={stats.total}    label="Certificates" />
        <StatCard icon={BadgeCheck} value={stats.pending}  label="Awaiting Approval" accent />
        <StatCard icon={Users}      value={stats.officers} label="VC + Chancellor" />
      </div>

      <div>
        <h3 className="text-[#022448] font-semibold text-sm uppercase tracking-widest mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link href="/dashboard/certificates/new"
            className="bg-[#022448] text-white h-12 rounded-[12px] flex items-center justify-center gap-2 text-sm font-semibold hover:opacity-90"
          >
            <ScrollText size={16} /> Issue Certificate
          </Link>
          <Link href="/dashboard/officers"
            className="border border-[#022448] text-[#022448] h-12 rounded-[12px] flex items-center justify-center gap-2 text-sm font-semibold hover:bg-[#022448]/5"
          >
            <UserPlus size={16} /> Add Officers
          </Link>
          <Link href="/dashboard/certificates"
            className="border border-[#022448] text-[#022448] h-12 rounded-[12px] flex items-center justify-center gap-2 text-sm font-semibold hover:bg-[#022448]/5"
          >
            <Eye size={16} /> Certificates
          </Link>
          <Link href="/dashboard/reports"
            className="border border-[#022448] text-[#022448] h-12 rounded-[12px] flex items-center justify-center gap-2 text-sm font-semibold hover:bg-[#022448]/5"
          >
            <FileText size={16} /> Reports
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#c4c6cf]/15">
          <h3 className="text-[#022448] font-semibold text-sm">Recent Certificates</h3>
          <Link href="/dashboard/certificates" className="text-[#7b5900] text-xs font-semibold flex items-center gap-1 hover:underline">
            View all <ArrowRight size={12} />
          </Link>
        </div>
        <div className="divide-y divide-[#c4c6cf]/15">
          {certs.length === 0 && (
            <p className="px-6 py-8 text-[#43474e] text-sm text-center">No certificates yet.</p>
          )}
          {certs.map(cert => (
            <div key={cert.id} className="flex items-center justify-between px-6 py-4">
              <div className="min-w-0">
                <p className="text-[#022448] text-sm font-semibold truncate">{cert.student_name}</p>
                <p className="text-[#43474e] text-xs truncate">{cert.degree_title}</p>
              </div>
              <StatusBadge status={cert.status} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
