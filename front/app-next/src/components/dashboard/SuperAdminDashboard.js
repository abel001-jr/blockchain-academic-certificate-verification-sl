"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2, Users, ScrollText, Gavel, Anchor,
  Link2, ShieldCheck, ArrowRight, Loader2,
  CheckCircle2, Clock, History, BarChart3,
} from "lucide-react";
import { api } from "@/lib/api";
import StatusBadge from "./StatusBadge";

export default function SuperAdminDashboard() {
  const [stats,       setStats]       = useState({ institutions: "—", users: "—", certificates: "—", pending: 0 });
  const [pending,     setPending]     = useState([]);
  const [recentCerts, setRecentCerts] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");

  useEffect(() => {
    async function load() {
      try {
        // Run all requests, handle individual failures gracefully
        const results = await Promise.allSettled([
          api.get("/institutions/"),
          api.get("/users/"),
          api.get("/certificates/"),
          api.get("/admin/institutions/pending/"),
        ]);

        const [instsRes, usersRes, certsRes, pendingRes] = results;

        const insts   = instsRes.status   === "fulfilled" ? (instsRes.value.results   ?? instsRes.value)   : [];
        const users   = usersRes.status   === "fulfilled" ? (usersRes.value.results   ?? usersRes.value)   : [];
        const certs   = certsRes.status   === "fulfilled" ? (certsRes.value.results   ?? certsRes.value)   : [];
        const pend    = pendingRes.status === "fulfilled" ? (pendingRes.value.results ?? pendingRes.value) : [];

        setStats({
          institutions: instsRes.status   === "fulfilled" ? (instsRes.value.count   ?? insts.length)  : "—",
          users:        usersRes.status   === "fulfilled" ? (usersRes.value.count   ?? users.length)  : "—",
          certificates: certsRes.status   === "fulfilled" ? (certsRes.value.count   ?? certs.length)  : "—",
          pending:      pendingRes.status === "fulfilled" ? (pendingRes.value.count ?? pend.length)   : 0,
        });

        setPending(pend.slice(0, 5));
        setRecentCerts(certs.slice(0, 6));
      } catch (e) {
        setError("Some data failed to load.");
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="flex flex-col gap-8 max-w-[1280px]">

      {/* Governance banner */}
      <div className="bg-[#022448] rounded-[14px] p-6 flex items-center justify-between flex-wrap gap-4 relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-[#7b5900]/20 rounded-full blur-3xl" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck size={18} className="text-[#ffdea4]" />
            <span className="text-white/70 text-xs font-semibold uppercase tracking-widest">Super Admin · Platform Governance</span>
          </div>
          <h2 className="text-white font-bold text-2xl">CREDENCE Governance Console</h2>
          <p className="text-white/60 text-sm mt-0.5">
            Institution onboarding · Blockchain anchor · Platform-wide oversight
          </p>
        </div>
        <div className="relative z-10 flex gap-3 flex-wrap">
          <Link href="/dashboard/admin/applications"
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2.5 rounded-[12px] text-sm font-semibold transition-all"
          >
            <Gavel size={15} />
            Review Applications
            {stats.pending > 0 && (
              <span className="bg-[#ED8A19] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {stats.pending}
              </span>
            )}
          </Link>
          <Link href="/dashboard/admin/anchor"
            className="flex items-center gap-2 bg-[#7b5900] hover:opacity-90 text-white px-4 py-2.5 rounded-[12px] text-sm font-semibold transition-all"
          >
            <Anchor size={15} /> Anchor On-Chain
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-[#ffdad6] text-[#93000a] text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      {/* KPI cards — clickable */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Building2,  value: stats.institutions, label: "Institutions",         href: "/dashboard/admin/institutions",   accent: false },
          { icon: Users,      value: stats.users,        label: "System Users",         href: "/dashboard/admin/users",          accent: false },
          { icon: ScrollText, value: stats.certificates, label: "Total Certificates",   href: "/dashboard/certificates",         accent: false },
          { icon: Gavel,      value: stats.pending,      label: "Pending Applications", href: "/dashboard/admin/applications",   accent: stats.pending > 0 },
        ].map(({ icon: Icon, value, label, href, accent }) => (
          <Link key={label} href={href}
            className="bg-white rounded-[14px] shadow-card p-5 flex flex-col gap-3 border border-[#c4c6cf]/10 hover:shadow-[0px_10px_30px_rgba(30,58,95,0.08)] transition-all"
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accent ? "bg-[#ED8A19]/10" : "bg-[#022448]/5"}`}>
              <Icon size={20} className={accent ? "text-[#ED8A19]" : "text-[#022448]"} strokeWidth={1.8} />
            </div>
            <div>
              <p className={`text-2xl font-bold ${accent ? "text-[#ED8A19]" : "text-[#022448]"}`}>
                {loading ? <span className="inline-block w-8 h-6 bg-[#eef4ff] rounded animate-pulse" /> : value}
              </p>
              <p className="text-[#43474e] text-xs font-semibold uppercase tracking-wider mt-0.5">{label}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Pending applications */}
        <div className="bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#c4c6cf]/15">
            <h3 className="text-[#022448] font-semibold text-sm flex items-center gap-2">
              <Gavel size={15} className="text-[#ED8A19]" />
              Pending Applications
            </h3>
            <Link href="/dashboard/admin/applications" className="text-[#7b5900] text-xs font-semibold flex items-center gap-1 hover:underline">
              Review all <ArrowRight size={12} />
            </Link>
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 size={22} className="text-[#022448] animate-spin" />
            </div>
          ) : pending.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10">
              <CheckCircle2 size={28} className="text-[#2E7D32]" />
              <p className="text-[#43474e] text-sm">No pending applications</p>
            </div>
          ) : (
            <div className="divide-y divide-[#c4c6cf]/10">
              {pending.map(app => (
                <div key={app.id} className="flex items-center justify-between px-6 py-4 hover:bg-[#FAF7F2] transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-[#ED8A19]/5 flex items-center justify-center shrink-0">
                      <Building2 size={16} className="text-[#ED8A19]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[#022448] text-sm font-semibold truncate">{app.institution_name}</p>
                      <p className="text-[#43474e] text-xs truncate">{app.contact_email} · {app.country}</p>
                      <p className="text-[#74777f] text-[10px] mt-0.5">
                        Submitted {new Date(app.submitted_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Link
                    href="/dashboard/admin/applications"
                    className="shrink-0 ml-3 flex items-center gap-1 bg-[#022448] text-white text-xs font-semibold px-3 py-1.5 rounded-[8px] hover:opacity-90 transition-all"
                  >
                    Review <ArrowRight size={11} />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent certificates */}
        <div className="bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#c4c6cf]/15">
            <h3 className="text-[#022448] font-semibold text-sm flex items-center gap-2">
              <ScrollText size={15} className="text-[#022448]" />
              Recent Certificates
            </h3>
            <Link href="/dashboard/certificates" className="text-[#7b5900] text-xs font-semibold flex items-center gap-1 hover:underline">
              View all <ArrowRight size={12} />
            </Link>
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 size={22} className="text-[#022448] animate-spin" />
            </div>
          ) : recentCerts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10">
              <ScrollText size={28} className="text-[#c4c6cf]" />
              <p className="text-[#43474e] text-sm">No certificates yet</p>
            </div>
          ) : (
            <div className="divide-y divide-[#c4c6cf]/10">
              {recentCerts.map(cert => (
                <div key={cert.id} className="flex items-center justify-between px-6 py-3.5 hover:bg-[#FAF7F2] transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[#022448]/5 flex items-center justify-center shrink-0">
                      <ScrollText size={14} className="text-[#022448]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[#022448] text-sm font-semibold truncate">{cert.student_name}</p>
                      <p className="text-[#43474e] text-xs truncate">{cert.degree_title}</p>
                    </div>
                  </div>
                  <div className="shrink-0 ml-3">
                    <StatusBadge status={cert.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions grid */}
      <div>
        <h3 className="text-[#022448] font-semibold text-sm uppercase tracking-widest mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "All Institutions", href: "/dashboard/admin/institutions", icon: Building2 },
            { label: "All Users",        href: "/dashboard/admin/users",        icon: Users },
            { label: "Blockchain",       href: "/dashboard/blockchain",         icon: Link2 },
            { label: "Audit Logs",       href: "/dashboard/audit",              icon: History },
          ].map(({ label, href, icon: Icon }) => (
            <Link key={label} href={href}
              className="border border-[#022448]/20 text-[#022448] h-12 rounded-[12px] flex items-center justify-center gap-2 text-sm font-semibold hover:bg-[#022448] hover:text-white transition-all"
            >
              <Icon size={16} /> {label}
            </Link>
          ))}
        </div>
      </div>

      {/* Platform stats footer */}
      <div className="bg-[#FAF7F2] rounded-[14px] border border-[#c4c6cf]/15 px-6 py-4 flex flex-wrap gap-6 text-sm text-[#43474e]">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#2E7D32] inline-block" />
          Django API: <strong className="text-[#022448]">http://127.0.0.1:8000</strong>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#2E7D32] inline-block" />
          Ethereum Node: <strong className="text-[#022448]">http://127.0.0.1:8545</strong>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#7b5900] inline-block" />
          IPFS: <strong className="text-[#022448]">Pinata Cloud</strong>
        </span>
      </div>
    </div>
  );
}
