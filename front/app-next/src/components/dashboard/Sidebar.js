"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Building2, Users, UserCheck,
  ScrollText, BadgeCheck, Link2, History, BarChart3,
  Settings, LogOut, X, ShieldAlert, Gavel, Anchor, Share2,
} from "lucide-react";
import { api, jwtPayload } from "@/lib/api";

const COMMON = [
  { label: "Dashboard",  href: "/dashboard",          icon: LayoutDashboard },
  { label: "Audit Logs", href: "/dashboard/audit",    icon: History },
  { label: "Settings",   href: "/dashboard/settings", icon: Settings },
];

const SUPER_ADMIN_ITEMS = [
  // OVERVIEW
  { section: "OVERVIEW" },
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  
  // ADMINISTRATION
  { section: "ADMINISTRATION", badge: "CRUD" },
  { label: "Institutions", href: "/dashboard/admin/institutions", icon: Building2 },
  { label: "Applications", href: "/dashboard/admin/applications", icon: Gavel },
  { label: "Anchor On-Chain", href: "/dashboard/admin/anchor", icon: Anchor },
  { label: "All Users", href: "/dashboard/admin/users", icon: Users },
  
  // CERTIFICATES
  { section: "CERTIFICATES", badge: "READ ONLY" },
  { label: "All Certificates", href: "/dashboard/certificates", icon: ScrollText },
  
  // TRUST AND VERIFICATION
  { section: "TRUST AND VERIFICATION", badge: "READ ONLY" },
  { label: "Blockchain", href: "/dashboard/blockchain", icon: Link2 },
  { label: "Audit Logs", href: "/dashboard/audit", icon: History },
];

const INST_ADMIN_ITEMS = [
  // OVERVIEW
  { section: "OVERVIEW" },
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  
  // SETUP
  { section: "SETUP", badge: "CRUD" },
  { label: "Institution", href: "/dashboard/institution", icon: Building2 },
  { label: "Registrars", href: "/dashboard/registrars", icon: Users },
  { label: "Authorize Registrar", href: "/dashboard/registrars/authorize", icon: UserCheck },
  
  // CERTIFICATES
  { section: "CERTIFICATES", badge: "READ ONLY" },
  { label: "Certificates", href: "/dashboard/certificates", icon: ScrollText },
  { label: "Verification", href: "/dashboard/verification", icon: BadgeCheck },
  
  // TRUST AND VERIFICATION
  { section: "TRUST AND VERIFICATION", badge: "READ ONLY" },
  { label: "Blockchain Records", href: "/dashboard/blockchain", icon: Link2 },
  { label: "Audit Logs", href: "/dashboard/audit", icon: History },
  
  // INSIGHT
  { section: "INSIGHT", badge: "READ ONLY" },
  { label: "Reports", href: "/dashboard/reports", icon: BarChart3 },
];

const REGISTRAR_ITEMS = [
  // OVERVIEW
  { section: "OVERVIEW" },
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  
  // ISSUANCE
  { section: "ISSUANCE", badge: "CREATE + READ" },
  { label: "Issue Credential", href: "/dashboard/credentials/new", icon: ScrollText },
  { label: "Credentials", href: "/dashboard/credentials", icon: ScrollText, certificateTotal: true },
  
  // SETUP
  { section: "SETUP", badge: "CRUD" },
  { label: "Institution", href: "/dashboard/institution", icon: Building2 },
  { label: "Officers", href: "/dashboard/officers", icon: Users },
  
  // TRUST AND VERIFICATION
  { section: "TRUST AND VERIFICATION", badge: "READ ONLY" },
  { label: "Verification", href: "/dashboard/verification", icon: BadgeCheck },
  { label: "Blockchain Records", href: "/dashboard/blockchain", icon: Link2 },
  { label: "Audit Logs", href: "/dashboard/audit", icon: History },
  
  // INSIGHT
  { section: "INSIGHT", badge: "READ ONLY" },
  { label: "Reports", href: "/dashboard/reports", icon: BarChart3 },
];

const VC_ITEMS = [
  // OVERVIEW
  { section: "OVERVIEW" },
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  
  // APPROVALS
  { section: "APPROVALS", badge: "ACTION" },
  { label: "Approvals", href: "/dashboard/approvals", icon: UserCheck },
  
  // CERTIFICATES
  { section: "CERTIFICATES", badge: "READ ONLY" },
  { label: "Certificates", href: "/dashboard/certificates", icon: ScrollText },
];

const CHANCELLOR_ITEMS = [
  // OVERVIEW
  { section: "OVERVIEW" },
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  
  // APPROVALS
  { section: "APPROVALS", badge: "ACTION" },
  { label: "Approvals", href: "/dashboard/approvals", icon: Gavel },
  
  // CERTIFICATES
  { section: "CERTIFICATES", badge: "READ ONLY" },
  { label: "Certificates", href: "/dashboard/certificates", icon: ScrollText },
];

const STUDENT_ITEMS = [
  // MY CREDENTIALS
  { section: "MY CREDENTIALS" },
  { label: "My Certificates", href: "/dashboard/my-certificates", icon: ScrollText },
  { label: "Verifications", href: "/dashboard/verifications", icon: Share2 },
];

const roleIcon = {
  super_admin:         ShieldAlert,
  institutional_admin: Building2,
  registrar:           UserCheck,
  vc:                  BadgeCheck,
  chancellor:          Gavel,
  student:             BadgeCheck,
};

const roleLabel = {
  super_admin:         "Super Admin",
  institutional_admin: "Inst. Admin",
  registrar:           "Registrar",
  vc:                  "Vice Chancellor",
  chancellor:          "Dean",
  student:             "Student",
};

function getNavItems(role) {
  switch (role) {
    case "super_admin":         return SUPER_ADMIN_ITEMS;
    case "institutional_admin": return INST_ADMIN_ITEMS;
    case "registrar":           return REGISTRAR_ITEMS;
    case "vc":                  return VC_ITEMS;
    case "chancellor":          return CHANCELLOR_ITEMS;
    case "student":             return STUDENT_ITEMS;
    default:                    return COMMON;
  }
}

export default function Sidebar({ open, onClose }) {
  const pathname = usePathname();
  const [payload, setPayload] = useState(null);
  const [certificateTotal, setCertificateTotal] = useState(null);

  useEffect(() => { setPayload(jwtPayload()); }, []);

  const role     = payload?.role ?? "—";
  const fullName = payload?.full_name ?? "User";
  const initials = fullName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const RoleIcon = roleIcon[role] ?? Building2;
  const navItems = getNavItems(role);

  useEffect(() => {
    if (role !== "registrar") return;
    let cancelled = false;

    api.get("/certificates/?page_size=1")
      .then((data) => {
        if (!cancelled) {
          setCertificateTotal(typeof data?.count === "number"
            ? data.count
            : (data?.results ?? data ?? []).length);
        }
      })
      .catch(() => {
        if (!cancelled) setCertificateTotal(null);
      });

    return () => { cancelled = true; };
  }, [role, pathname]);

  return (
    <aside className={`
        fixed top-0 left-0 h-full w-72 z-40 flex flex-col
        bg-white border-r border-[#E4E1D6]
        shadow-[2px_0_12px_rgba(8,40,63,0.06)]
        transition-transform duration-300
        ${open ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0
      `}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-5 h-16 border-b border-[#E4E1D6] shrink-0">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="Credence" width={28} height={28} className="rounded-lg" />
          <span className="text-[#08283F] font-bold text-lg tracking-tight">Credence</span>
        </Link>
        <button
          onClick={onClose}
          className="lg:hidden text-[#4A5A68] hover:text-[#08283F] p-1 rounded-lg hover:bg-[#EAF2FB] transition-colors"
          aria-label="Close navigation"
        >
          <X size={20} />
        </button>
      </div>

      {/* User info */}
      <div className="px-4 py-3.5 border-b border-[#E4E1D6] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#08283F] flex items-center justify-center text-white text-sm font-bold shrink-0 leading-none">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[#08283F] text-sm font-semibold truncate leading-tight">{fullName}</p>
            <p className="text-[#4A5A68] text-xs truncate mt-0.5">{roleLabel[role] ?? role}</p>
          </div>
        </div>
        {/* Role badge */}
        <div className="mt-2.5 flex items-center gap-1.5 bg-[#B98A28]/10 text-[#B98A28] text-xs font-semibold px-2.5 py-1 rounded-full w-fit">
          <RoleIcon size={11} />
          {roleLabel[role] ?? role}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-0.5">
        {navItems.map((item, index) => {
          // Render section header
          if (item.section) {
            return (
              <div key={`section-${index}`} className={`flex items-center justify-between px-3 ${index > 0 ? 'mt-4' : 'mt-0'} mb-2`}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#9AA8B4]">
                  {item.section}
                </span>
                {item.badge && (
                  <span className="text-[9px] font-bold uppercase tracking-wider text-[#C59A3A]">
                    {item.badge}
                  </span>
                )}
              </div>
            );
          }
          
          // Render nav item
          const { label, href, icon: Icon, certificateTotal: showCertificateTotal } = item;
          const active =
            pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(href + "/"));
          return (
            <Link
              key={href + label}
              href={href}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                active
                  ? "bg-[#B98A28]/10 text-[#B98A28] font-semibold"
                  : "text-[#4A5A68] hover:bg-[#EAF2FB] hover:text-[#08283F]"
              }`}
            >
              <Icon size={17} strokeWidth={active ? 2.2 : 1.7} className="shrink-0" />
              <span className="truncate">{label}</span>
              {showCertificateTotal && certificateTotal !== null && (
                <span className={`ml-auto min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold ${
                  active ? "bg-[#B98A28] text-white" : "bg-[#EAF2FB] text-[#4A5A68]"
                }`}>
                  {certificateTotal}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Sign out — always visible at bottom */}
      <div className="px-3 py-3 border-t border-[#E4E1D6] shrink-0 bg-white space-y-1">
        <Link
          href="/dashboard/settings"
          onClick={onClose}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            pathname === "/dashboard/settings"
              ? "bg-[#B98A28]/10 text-[#B98A28] font-semibold"
              : "text-[#4A5A68] hover:bg-[#EAF2FB] hover:text-[#08283F]"
          }`}
        >
          <Settings size={17} strokeWidth={pathname === "/dashboard/settings" ? 2.2 : 1.7} className="shrink-0" />
          Settings
        </Link>
        <button
          onClick={() => { localStorage.clear(); window.location.href = "/login"; }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-[#A23B34] hover:bg-[#F5E5E3] transition-colors"
        >
          <LogOut size={17} strokeWidth={1.7} className="shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
