"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import AnimatedBrandMark from "../ui/AnimatedBrandMark";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Building2, Users, UserCheck,
  ScrollText, BadgeCheck, Link2, History, BarChart3,
  Settings, LogOut, X, Gavel, Anchor, Share2, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { clearSession, api } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import styles from "./Sidebar.module.css";
import ProfileAvatar from "./ProfileAvatar";

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
  { label: "Credentials", href: "/dashboard/credentials", icon: ScrollText },
  { label: "Verification", href: "/dashboard/verification", icon: BadgeCheck },
  
  // TRUST AND VERIFICATION
  { section: "TRUST AND VERIFICATION", badge: "READ ONLY" },
  { label: "Blockchain", href: "/dashboard/blockchain", icon: Link2 },
  { label: "Audit Logs", href: "/dashboard/audit", icon: History },
  
  // INSIGHT
  { section: "INSIGHT", badge: "READ ONLY" },
  { label: "Reports", href: "/dashboard/reports", icon: BarChart3 },
];

const INST_ADMIN_ITEMS = [
  // OVERVIEW
  { section: "OVERVIEW" },
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  
  // SETUP
  { section: "SETUP", badge: "CRUD" },
  { label: "Institution", href: "/dashboard/institution", icon: Building2 },
  { label: "Officers", href: "/dashboard/officers", icon: Users },
  
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
  { section: "ACTIVITY" },
  { label: "Audit Logs", href: "/dashboard/audit", icon: History },
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
  { section: "ACTIVITY" },
  { label: "Audit Logs", href: "/dashboard/audit", icon: History },
];

const STUDENT_ITEMS = [
  // MY CREDENTIALS
  { section: "MY CREDENTIALS" },
  { label: "My Certificates", href: "/dashboard/my-certificates", icon: ScrollText },
  { label: "Verifications", href: "/dashboard/verifications", icon: Share2 },
];

const roleLabel = {
  super_admin:         "Super Admin",
  institutional_admin: "Inst. Admin",
  registrar:           "Registrar",
  vc:                  "Vice Chancellor",
  chancellor:          "Chancellor",
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

function subscribeViewport(callback) {
  const query = window.matchMedia("(min-width: 1024px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

export default function Sidebar({ open, onClose, collapsed = false, onToggleCollapsed }) {
  const desktop = useSyncExternalStore(subscribeViewport, () => window.matchMedia("(min-width: 1024px)").matches, () => true);
  const pathname = usePathname();
  const { user, role: currentRole } = useAuth();
  const [certificateTotal, setCertificateTotal] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  function showTooltip(event) {
    if (!collapsed || (!desktop && !open)) return;
    const target = event.target.closest("[data-nav-label]");
    if (!target) { setTooltip(null); return; }
    const rect = target.getBoundingClientRect();
    const theme = getComputedStyle(event.currentTarget);
    setTooltip({ label: target.dataset.navLabel, left: rect.right + 12, top: Math.max(8, Math.min(rect.top + rect.height / 2 - 18, window.innerHeight - 48)), primary: theme.getPropertyValue("--cd-primary"), accent: theme.getPropertyValue("--cd-accent") });
  }


  const role     = currentRole ?? "—";
  const fullName = user?.full_name || "User";
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
    <aside id="dashboard-sidebar" inert={!desktop && !open} role={!desktop && open ? "dialog" : undefined} aria-modal={!desktop && open ? true : undefined} aria-label="Dashboard navigation panel" onMouseOver={showTooltip} onMouseLeave={() => setTooltip(null)} onFocus={showTooltip} onBlur={() => setTooltip(null)} onScrollCapture={() => setTooltip(null)} className={`${styles.sidebar} ${collapsed ? styles.collapsed : ""} cd-theme-sidebar
        fixed top-0 left-0 h-dvh w-72 z-40 flex flex-col
        bg-white border-r border-[#E4E1D6]
        shadow-[2px_0_12px_rgba(8,40,63,0.06)]
        transition-transform duration-300
        ${open ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0
      `}
    >
      {/* Logo */}
      <div className={`${styles.brand} flex items-center justify-between border-b border-[#E4E1D6] shrink-0`}>
        <button type="button" onClick={() => { setTooltip(null); onToggleCollapsed?.(); }} className={`${styles.collapseToggle} grid text-[#08283F]`} aria-label={collapsed ? "Expand sidebar" : "Minimize sidebar"} title={collapsed ? "Expand sidebar" : "Minimize sidebar"} aria-expanded={!collapsed}>{collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}</button>
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <AnimatedBrandMark src="/fav.png" size={32} />
          <span className="text-[#08283F] font-bold text-lg tracking-tight">Intelligent Academic Credentialing</span>
        </Link>
        <button
          onClick={onClose}
          className="lg:hidden text-[#4A5A68] hover:text-[#08283F] p-1 rounded-lg hover:bg-[#EAF2FB] transition-colors"
          aria-label="Close navigation"
        >
          <X size={20} />
        </button>
      </div>

      {/* Nav */}
      <nav aria-label="Dashboard navigation" className={`${styles.nav} flex-1 min-h-0 overflow-y-auto flex flex-col`}>
        {navItems.map((item, index) => {
          // Render section header
          if (item.section) {
            return (
              <div key={`section-${index}`} className={`flex items-center justify-between px-3 ${index > 0 ? 'mt-4' : 'mt-0'} mb-2`}>
                <span className="cd-sidebar-section text-[10px] font-bold uppercase tracking-wider text-[#9AA8B4]">
                  {item.section}
                </span>
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
              data-nav-label={label}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              onClick={() => { setTooltip(null); onClose(); }}
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
      <div className={`${styles.footer} cd-sidebar-footer border-t border-[#E4E1D6] shrink-0 bg-white space-y-1`}>
        <Link
          href="/dashboard/settings"
          data-nav-label="Settings"
          aria-label="Settings"
          aria-current={pathname === "/dashboard/settings" ? "page" : undefined}
          onClick={onClose}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            pathname === "/dashboard/settings"
              ? "bg-[#B98A28]/10 text-[#B98A28] font-semibold"
              : "text-[#4A5A68] hover:bg-[#EAF2FB] hover:text-[#08283F]"
          }`}
        >
          <Settings size={17} strokeWidth={pathname === "/dashboard/settings" ? 2.2 : 1.7} className="shrink-0" />
          <span>Settings</span>
        </Link>
        <button
          data-nav-label="Sign out"
          aria-label="Sign out"
          onClick={() => { clearSession(); window.location.replace("/login"); }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-[#A23B34] hover:bg-[#F5E5E3] transition-colors"
        >
          <LogOut size={17} strokeWidth={1.7} className="shrink-0" />
          <span>Sign out</span>
        </button>
      </div>
      <Link href="/dashboard/settings" onClick={onClose} data-nav-label={fullName} aria-label="Profile settings" className={styles.user}>
        <ProfileAvatar user={user} size={44} />
        <div className={styles.profileText}>
          <p>{fullName}</p>
          <p>{user?.email || roleLabel[role] || role}</p>
          <span>{roleLabel[role] ?? role}</span>
        </div>
      </Link>
      {collapsed && tooltip && createPortal(<span role="tooltip" className={styles.iconTooltip} style={{ left: tooltip.left, top: tooltip.top, background: tooltip.primary || "#08283F", borderColor: tooltip.accent || "#B98A28" }}>{tooltip.label}</span>, document.body)}
    </aside>
  );
}
