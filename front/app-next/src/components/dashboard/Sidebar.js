"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Building2, Users, UserCheck,
  ScrollText, BadgeCheck, Link2, History, BarChart3,
  Settings, LogOut, X, ShieldAlert, Gavel, Anchor,
} from "lucide-react";
import { jwtPayload } from "@/lib/api";

// Nav items per role
const COMMON = [
  { label: "Dashboard",   href: "/dashboard",              icon: LayoutDashboard },
  { label: "Audit Logs",  href: "/dashboard/audit",        icon: History },
  { label: "Settings",    href: "/dashboard/settings",     icon: Settings },
];

const SUPER_ADMIN_ITEMS = [
  { label: "Overview",         href: "/dashboard",                        icon: LayoutDashboard },
  { label: "Institutions",     href: "/dashboard/admin/institutions",     icon: Building2 },
  { label: "Applications",     href: "/dashboard/admin/applications",     icon: Gavel },
  { label: "Anchor On-Chain",  href: "/dashboard/admin/anchor",           icon: Anchor },
  { label: "All Users",        href: "/dashboard/admin/users",            icon: Users },
  { label: "All Certificates", href: "/dashboard/certificates",           icon: ScrollText },
  { label: "Blockchain",       href: "/dashboard/blockchain",             icon: Link2 },
  { label: "Audit Logs",       href: "/dashboard/audit",                  icon: History },
  { label: "Settings",         href: "/dashboard/settings",               icon: Settings },
];

const INST_ADMIN_ITEMS = [
  { label: "Dashboard",           href: "/dashboard",                       icon: LayoutDashboard },
  { label: "Institution",         href: "/dashboard/institution",           icon: Building2 },
  { label: "Registrars",          href: "/dashboard/registrars",            icon: Users },
  { label: "Authorize Registrar", href: "/dashboard/registrars/authorize",  icon: UserCheck },
  { label: "Certificates",        href: "/dashboard/certificates",          icon: ScrollText },
  { label: "Verification",        href: "/dashboard/verification",          icon: BadgeCheck },
  { label: "Blockchain Records",  href: "/dashboard/blockchain",            icon: Link2 },
  { label: "Audit Logs",          href: "/dashboard/audit",                 icon: History },
  { label: "Reports",             href: "/dashboard/reports",               icon: BarChart3 },
  { label: "Settings",            href: "/dashboard/settings",              icon: Settings },
];

const REGISTRAR_ITEMS = [
  { label: "Dashboard",          href: "/dashboard",                  icon: LayoutDashboard },
  { label: "Institution",        href: "/dashboard/institution",      icon: Building2 },
  { label: "Officers (VC / Chancellor)", href: "/dashboard/officers", icon: Users },
  { label: "Issue Certificate",  href: "/dashboard/certificates/new", icon: ScrollText },
  { label: "Certificates",       href: "/dashboard/certificates",     icon: ScrollText },
  { label: "Verification",       href: "/dashboard/verification",     icon: BadgeCheck },
  { label: "Blockchain Records", href: "/dashboard/blockchain",       icon: Link2 },
  { label: "Audit Logs",         href: "/dashboard/audit",            icon: History },
  { label: "Reports",            href: "/dashboard/reports",          icon: BarChart3 },
  { label: "Settings",           href: "/dashboard/settings",         icon: Settings },
];

const VC_ITEMS = [
  { label: "Dashboard",    href: "/dashboard",                    icon: LayoutDashboard },
  { label: "Approvals",    href: "/dashboard/approvals",          icon: UserCheck },
  { label: "Certificates", href: "/dashboard/certificates",       icon: ScrollText },
  { label: "Settings",     href: "/dashboard/settings",           icon: Settings },
];

const CHANCELLOR_ITEMS = [
  { label: "Dashboard",    href: "/dashboard",                    icon: LayoutDashboard },
  { label: "Approvals",    href: "/dashboard/approvals",          icon: Gavel },
  { label: "Certificates", href: "/dashboard/certificates",       icon: ScrollText },
  { label: "Settings",     href: "/dashboard/settings",           icon: Settings },
];

const STUDENT_ITEMS = [
  { label: "My Certificates", href: "/dashboard/my-certificates", icon: ScrollText },
  { label: "Settings",        href: "/dashboard/settings",        icon: Settings },
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
  institutional_admin: "Registrar",
  registrar:           "Registrar",
  vc:                  "Vice Chancellor",
  chancellor:          "Chancellor",
  student:             "Student",
};

function getNavItems(role) {
  switch (role) {
    case "super_admin":         return SUPER_ADMIN_ITEMS;
    case "institutional_admin": return REGISTRAR_ITEMS;
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

  useEffect(() => {
    setPayload(jwtPayload());
  }, []);

  const role     = payload?.role ?? "—";
  const fullName = payload?.full_name ?? "User";
  const initials = fullName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const RoleIcon = roleIcon[role] ?? Building2;
  const navItems = getNavItems(role);

  return (
    <aside className={`
        fixed top-0 left-0 h-full w-64 z-40 flex flex-col
        bg-white border-r border-[#c4c6cf]/20
        shadow-[4px_0_20px_rgba(30,58,95,0.04)]
        transition-transform duration-300
        ${open ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0
      `}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-6 h-16 border-b border-[#c4c6cf]/20 shrink-0">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image src="/logo.png" alt="CREDENCE" width={28} height={28} className="rounded-lg" />
          <span className="text-[#022448] font-bold text-lg tracking-tight">CREDENCE</span>
        </Link>
        <button onClick={onClose} className="lg:hidden text-[#43474e] hover:text-[#022448] p-1">
          <X size={20} />
        </button>
      </div>

      {/* User info */}
      <div className="px-5 py-4 border-b border-[#c4c6cf]/20 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#022448] flex items-center justify-center text-white text-sm font-bold shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-[#022448] text-sm font-semibold truncate">{fullName}</p>
            <p className="text-[#43474e] text-xs truncate capitalize">
              {roleLabel[role] ?? role}
            </p>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1.5 bg-[#7b5900]/10 text-[#7b5900] text-[10px] font-bold px-2 py-1 rounded-full w-fit uppercase tracking-wider">
          <RoleIcon size={10} />
          {roleLabel[role] ?? role}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-0.5">
        {navItems.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));
          return (
            <Link
              key={href + label}
              href={href}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm font-medium transition-all ${
                active
                  ? "bg-[#7b5900]/10 text-[#7b5900] font-semibold"
                  : "text-[#43474e] hover:bg-[#022448]/5 hover:text-[#022448]"
              }`}
            >
              <Icon size={18} strokeWidth={active ? 2 : 1.7} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-[#c4c6cf]/20 shrink-0">
        <button
          onClick={() => { localStorage.clear(); window.location.href = "/login"; }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm font-medium text-[#ba1a1a] hover:bg-[#ffdad6]/40 transition-colors"
        >
          <LogOut size={18} strokeWidth={1.7} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
