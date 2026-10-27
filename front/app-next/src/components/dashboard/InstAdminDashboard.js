"use client";
import { subscribeDashboardRefresh } from "@/lib/dashboardRefresh.mjs";
import { loadDashboardRecords } from "@/lib/dashboardRecords";
import WelcomeCard from "./WelcomeCard";
import HeroTile from "./HeroTile";
import CredentialCharts from "./CredentialCharts";
import { useEffect, useState } from "react";
import {
  Building2, Users, Palette, Settings, Link2,
  ShieldCheck, ArrowRight, Loader2,
} from "lucide-react";
import Link        from "next/link";
import { api, jwtPayload }  from "@/lib/api";

export default function InstAdminDashboard() {
  const [officers, setOfficers] = useState([]);
  const [audit,  setAudit]  = useState([]);
  const [inst,   setInst]   = useState(null);
  const [busy,   setBusy]   = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [userData, auditData] = await Promise.all([
          api.get("/users/?page_size=100"),
          loadDashboardRecords("/audit-logs/?ordering=-timestamp"),
        ]);
        setOfficers((userData.results ?? userData).filter(user => ["institutional_admin", "registrar", "vc", "chancellor"].includes(user.role)));
        setAudit(auditData);

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
    return subscribeDashboardRefresh(load, { intervalMs: 0 });
  }, []);


  if (busy) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="text-[#022448] animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 w-full">

      <WelcomeCard>
      {/* Institution status */}
      <Link href="/dashboard/institution" aria-label="Manage institution profile" className="bg-white rounded-xl shadow-card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-[#E4E1D6]/50 hover:border-[#780110] transition-colors">
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
          <span className="inline-flex items-center gap-1.5 bg-[#780110]/5 text-[#780110] text-xs font-semibold px-3 py-1.5 rounded-full border border-[#780110]/20 self-start sm:self-auto">
            <ShieldCheck size={12} /> Verified On-Chain
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 bg-[#F5EBDB] text-[#A9721F] text-xs font-semibold px-3 py-1.5 rounded-full border border-[#A9721F]/20 self-start sm:self-auto">
            Awaiting on-chain anchor
          </span>
        )}
      </Link>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          { icon: Building2, label: "Update institution", detail: "Edit your institution profile and contact details.", href: "/dashboard/institution" },
          { icon: Users, label: "Manage officers", detail: "Add officers and manage signer authorization.", href: "/dashboard/officers" },
          { icon: Palette, label: "System branding", detail: "Manage the institution's system appearance.", href: "/dashboard/settings?tab=System%20Branding" },
          { icon: Settings, label: "Account settings", detail: "Update your profile, password and notifications.", href: "/dashboard/settings" },
        ].map(({ icon, label, detail, href }, index) => <HeroTile key={label} href={href} label={label} actionLabel={label} detail={detail} icon={icon} index={index} />)}
      </div>

      </WelcomeCard>
      <CredentialCharts>
        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] items-start gap-4">
          <article className="rounded-xl border border-[#E4E1D6] bg-white overflow-hidden">
            <div className="flex justify-between items-center px-5 py-4 border-b border-[#E4E1D6]"><h3 className="text-lg font-semibold text-[#08283F]">Officer directory</h3><Link href="/dashboard/officers" className="cred-btn cred-btn-secondary shrink-0">Manage officers</Link></div>
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[#F8F7F2] text-[#4A5A68] text-xs"><tr><th className="px-5 py-3">Officer</th><th className="px-5 py-3">Role</th><th className="px-5 py-3">Account</th></tr></thead><tbody>{officers.slice(0, 5).map(officer => <tr key={officer.id} className="border-t border-[#E4E1D6]"><td className="px-5 py-3 text-[#08283F] font-medium">{officer.full_name || officer.email}</td><td className="px-5 py-3 capitalize text-[#4A5A68]">{officer.role.replaceAll("_", " ")}</td><td className="px-5 py-3"><span className="rounded bg-[#F8F7F2] px-2 py-1 text-xs">{officer.is_active ? "Active" : "Inactive"}</span></td></tr>)}</tbody></table>{!officers.length && <p className="p-5 text-sm text-[#4A5A68]">No officers recorded.</p>}</div>
          </article>
          <article className="cd-scroll-card rounded-xl border border-[#E4E1D6] bg-white overflow-hidden">
            <div className="flex justify-between items-center px-5 py-4 border-b border-[#E4E1D6]"><h3 className="text-lg font-semibold text-[#08283F]">Audit activity</h3><Link href="/dashboard/audit" className="cred-btn cred-btn-secondary shrink-0">View audit log</Link></div>
            <div className="cd-scroll-card-body" tabIndex={0} role="region" aria-label="Audit activity entries">{audit.map(item => <div key={item.id} className="flex gap-3 px-5 py-3 border-b last:border-0 border-[#E4E1D6]"><span className="mt-2 h-1.5 w-1.5 rounded-full shrink-0 bg-[#780110]" /><div className="min-w-0"><p className="text-sm font-medium text-[#08283F]">{item.action.replaceAll(".", " ? ").replaceAll("_", " ")}</p><p className="mt-1 text-xs text-[#4A5A68]">{item.timestamp ? new Date(item.timestamp).toLocaleString() : ""}</p></div></div>)}
            {!audit.length && <p className="p-5 text-sm text-[#4A5A68]">No activity yet.</p>}</div>
          </article>
        </div>
      </CredentialCharts>
    </div>
  );
}
