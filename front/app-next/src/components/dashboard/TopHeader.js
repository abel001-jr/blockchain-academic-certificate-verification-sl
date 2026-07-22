"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, Bell, Search, ChevronDown, LogOut } from "lucide-react";
import { jwtPayload } from "@/lib/api";

const pageTitles = {
  "/dashboard":                          "Dashboard",
  "/dashboard/institution":              "Institution",
  "/dashboard/institution/bind-wallet":  "Bind Wallet",
  "/dashboard/registrars":               "Registrars",
  "/dashboard/registrars/authorize":     "Authorize Registrar",
  "/dashboard/officers":                 "Officers (VC / Chancellor)",
  "/dashboard/approvals":                "Approvals",
  "/dashboard/certificates":             "Certificates",
  "/dashboard/certificates/new":         "Issue Certificate",
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
  const [payload, setPayload] = useState(null);

  useEffect(() => { setPayload(jwtPayload()); }, []);

  const fullName = payload?.full_name ?? "User";
  const role     = payload?.role ?? "";
  const initials = fullName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  let title = pageTitles[pathname] ?? "Dashboard";
  if (pathname?.startsWith("/dashboard/officers/") && pathname !== "/dashboard/officers") {
    title = "Officer details";
  }
  if (pathname?.startsWith("/dashboard/certificates/") && pathname !== "/dashboard/certificates" && pathname !== "/dashboard/certificates/new") {
    title = "Certificate details";
  }
  if (pathname === "/dashboard" && role === "super_admin") {
    title = "Governance Console";
  }

  return (
    <header className="sticky top-0 z-20 h-16 shrink-0 bg-white/95 backdrop-blur-md border-b border-[#c4c6cf]/20 flex items-center justify-between px-5 md:px-8">

      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="lg:hidden text-[#022448] p-1 hover:bg-[#022448]/5 rounded-lg transition-colors"
        >
          <Menu size={22} />
        </button>
        <div>
          <h1 className="text-[#022448] font-semibold text-base leading-tight">{title}</h1>
          {role && (
            <p className="text-[#74777f] text-xs capitalize hidden sm:block">
              {role.replace(/_/g, " ")}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="hidden md:flex items-center gap-2 bg-[#eef4ff] rounded-[10px] px-3 py-2 w-52 border border-transparent focus-within:border-[#022448] transition-colors">
          <Search size={14} className="text-[#74777f] shrink-0" />
          <input
            type="text"
            placeholder="Search…"
            className="bg-transparent text-sm text-[#121c28] outline-none placeholder:text-[#74777f] w-full"
          />
        </div>

        {/* Notifications */}
        <button className="relative p-2 rounded-[10px] hover:bg-[#022448]/5 transition-colors text-[#022448]">
          <Bell size={19} strokeWidth={1.8} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#7b5900] rounded-full" />
        </button>

        {/* Profile menu */}
        <div className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-[10px] hover:bg-[#022448]/5 transition-colors cursor-pointer"
          onClick={() => { localStorage.clear(); window.location.href = "/login"; }}
          title="Sign out"
        >
          <div className="w-7 h-7 rounded-full bg-[#022448] flex items-center justify-center text-white text-xs font-bold">
            {initials}
          </div>
          <span className="hidden md:block text-[#022448] text-sm font-medium max-w-[120px] truncate">
            {fullName}
          </span>
          <LogOut size={13} className="text-[#43474e]" />
        </div>
      </div>
    </header>
  );
}
