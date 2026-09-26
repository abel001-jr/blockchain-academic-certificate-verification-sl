"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, Bell, Search, ChevronDown, LogOut, Settings, User } from "lucide-react";
import Link from "next/link";
import { jwtPayload } from "@/lib/api";

const pageTitles = {
  "/dashboard":                          "Dashboard",
  "/dashboard/institution":              "Institution",
  "/dashboard/institution/bind-wallet":  "Bind Wallet",
  "/dashboard/registrars":               "Registrars",
  "/dashboard/registrars/authorize":     "Authorize Registrar",
  "/dashboard/officers":                 "Officers (VC / Dean)",
  "/dashboard/approvals":                "Approvals",
  "/dashboard/certificates":             "Certificates",
  "/dashboard/certificates/new":         "Issue Certificate",
  "/dashboard/credentials":              "Credentials",
  "/dashboard/credentials/new":          "Issue Credential",
  "/dashboard/transcripts":              "Transcripts",
  "/dashboard/my-certificates":          "My Certificates",
  "/dashboard/verification":             "Verification",
  "/dashboard/blockchain":               "Blockchain Records",
  "/dashboard/audit":                    "Audit Logs",
  "/dashboard/reports":                  "Reports",
  "/dashboard/settings":                 "Settings",
  "/dashboard/admin/institutions":       "All Institutions",
  "/dashboard/admin/applications":       "Applications",
  "/dashboard/admin/anchor":             "Anchor On-Chain",
  "/dashboard/admin/users":              "All Users",
};

export default function TopHeader({ onMenuClick }) {
  const pathname = usePathname();
  const [payload,      setPayload]      = useState(null);
  const [profileOpen,  setProfileOpen]  = useState(false);
  const profileRef = useRef(null);

  useEffect(() => { setPayload(jwtPayload()); }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fullName = payload?.full_name ?? "User";
  const role     = payload?.role ?? "";
  const initials = fullName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  let title = pageTitles[pathname] ?? "Dashboard";
  if (pathname?.startsWith("/dashboard/officers/") && pathname !== "/dashboard/officers") {
    title = "Officer details";
  }
  if (
    pathname?.startsWith("/dashboard/certificates/") &&
    pathname !== "/dashboard/certificates" &&
    pathname !== "/dashboard/certificates/new"
  ) {
    title = "Certificate details";
  }
  if (
    pathname?.startsWith("/dashboard/credentials/") &&
    pathname !== "/dashboard/credentials" &&
    pathname !== "/dashboard/credentials/new"
  ) {
    title = "Credential details";
  }
  if (pathname === "/dashboard" && role === "super_admin") {
    title = "Governance Console";
  }

  const roleLabel = role === "chancellor" ? "Dean" : role.replace(/_/g, " ");

  return (
    <header className="sticky top-0 z-20 h-16 shrink-0 bg-white border-b border-[#E4E1D6] flex items-center justify-between px-5 md:px-8">

      {/* Left — menu toggle + page title */}
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="lg:hidden text-[#08283F] p-1.5 hover:bg-[#EAF2FB] rounded-lg transition-colors"
          aria-label="Open navigation"
        >
          <Menu size={22} />
        </button>
        <div>
          <h1 className="text-[#08283F] font-semibold text-lg leading-tight">{title}</h1>
          {role && (
            <p className="text-[#8A929C] text-xs capitalize hidden sm:block">{roleLabel}</p>
          )}
        </div>
      </div>

      {/* Right — search, notifications, profile */}
      <div className="flex items-center gap-2">

        {/* Search */}
        <div className="hidden md:flex items-center gap-2 bg-[#EAF2FB] rounded-xl px-3 py-2 w-60 border border-transparent focus-within:border-[#08283F] transition-colors">
          <Search size={14} className="text-[#8A929C] shrink-0" />
          <input
            type="text"
            placeholder="Search…"
            className="bg-transparent text-sm text-[#1B2734] outline-none placeholder:text-[#8A929C] w-full"
          />
        </div>

        {/* Notifications — wired to show count when available */}
        <button
          className="relative p-2 rounded-xl hover:bg-[#EAF2FB] transition-colors text-[#08283F]"
          aria-label="Notifications"
        >
          <Bell size={19} strokeWidth={1.8} />
          {/* Dot only shown when there are real notifications — currently hidden */}
        </button>

        {/* Profile dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(prev => !prev)}
            className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl hover:bg-[#EAF2FB] transition-colors cursor-pointer"
            aria-label="Profile menu"
            aria-expanded={profileOpen}
          >
            <div className="w-8 h-8 rounded-full bg-[#08283F] flex items-center justify-center text-white text-xs font-bold shrink-0">
              {initials}
            </div>
            <span className="hidden md:block text-[#08283F] text-sm font-medium max-w-[120px] truncate">
              {fullName}
            </span>
            <ChevronDown
              size={14}
              className={`text-[#4A5A68] transition-transform duration-200 ${profileOpen ? "rotate-180" : ""}`}
            />
          </button>

          {/* Dropdown */}
          {profileOpen && (
            <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl border border-[#E4E1D6] shadow-modal z-50 overflow-hidden">
              {/* User info */}
              <div className="px-4 py-3 border-b border-[#E4E1D6]">
                <p className="text-[#08283F] text-sm font-semibold truncate">{fullName}</p>
                <p className="text-[#8A929C] text-xs capitalize truncate">{roleLabel}</p>
              </div>
              {/* Actions */}
              <div className="py-1">
                <Link
                  href="/dashboard/settings"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-[#1B2734] hover:bg-[#EAF2FB] transition-colors"
                >
                  <Settings size={15} className="text-[#4A5A68]" />
                  Settings
                </Link>
                <button
                  onClick={() => { localStorage.clear(); window.location.href = "/login"; }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#A23B34] hover:bg-[#F5E5E3] transition-colors"
                >
                  <LogOut size={15} />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
