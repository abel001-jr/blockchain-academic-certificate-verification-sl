"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import TopHeader from "./TopHeader";
import DashboardLoader from "./DashboardLoader";
import { api, clearSession, jwtPayload } from "@/lib/api";
import DashboardThemeProvider from "./DashboardThemeProvider";

export default function DashboardShell({ children }) {
  return <DashboardThemeProvider><DashboardContent>{children}</DashboardContent></DashboardThemeProvider>;
}

function DashboardContent({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const shellRef = useRef(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!sidebarOpen || window.innerWidth >= 1024) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = document.getElementById("dashboard-sidebar");
    const focusable = () => [...panel.querySelectorAll('a[href], button:not(:disabled)')].filter(item => item.getClientRects().length > 0);
    focusable()[0]?.focus();
    const keydown = event => {
      if (event.key === "Escape") { setSidebarOpen(false); return; }
      if (event.key !== "Tab") return;
      const controls = focusable(), first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const resize = () => { if (window.innerWidth >= 1024) setSidebarOpen(false); };
    document.addEventListener("keydown", keydown); window.addEventListener("resize", resize);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", keydown); window.removeEventListener("resize", resize); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [sidebarOpen]);

  useEffect(() => {
    let disposed = false;
    let checkId = 0;
    let expiryTimer;
    const hide = () => {
      if (shellRef.current) shellRef.current.style.visibility = "hidden";
    };
    const endSession = () => {
      ++checkId;
      hide();
      window.location.replace("/login");
    };
    const verify = async () => {
      const currentCheck = ++checkId;
      // Revalidate navigation without blanking the persistent dashboard layout.
      // pagehide and session-ended still conceal protected content immediately.
      clearTimeout(expiryTimer);
      const claims = jwtPayload();
      if (!claims) {
        endSession();
        return;
      }
      if (!claims.exp || claims.exp * 1000 <= Date.now()) {
        clearSession();
        return;
      }
      if (claims.token_use === "officer_setup") {
        hide();
        window.location.replace("/setup");
        return;
      }
      try {
        await api.get("/auth/me/");
        if (disposed || currentCheck !== checkId || !jwtPayload()) return;
        setAllowed(true);
        if (shellRef.current) shellRef.current.style.visibility = "visible";
        expiryTimer = setTimeout(verify, Math.min(claims.exp * 1000 - Date.now(), 2147483647));
      } catch {
        if (!disposed && currentCheck === checkId) clearSession();
      }
    };
    const onStorage = event => {
      if (event.key === "access_token" || event.key === null) void verify();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void verify();
    };
    window.addEventListener("credence:session-ended", endSession);
    window.addEventListener("storage", onStorage);
    window.addEventListener("pageshow", verify);
    window.addEventListener("pagehide", hide);
    window.addEventListener("focus", verify);
    document.addEventListener("visibilitychange", onVisibility);
    void verify();
    return () => {
      disposed = true;
      clearTimeout(expiryTimer);
      window.removeEventListener("credence:session-ended", endSession);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pageshow", verify);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("focus", verify);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pathname]);

  if (!allowed) {
    return <DashboardLoader label="Checking dashboard session" />;
    /*
    return (
      <div className="min-h-screen bg-[#F8F7F2] flex items-center justify-center text-[#4A5A68] text-sm">
        Checking session…
      </div>
    );
    */
  }

  return (
    <div ref={shellRef} className="min-h-screen bg-[#F8F7F2] flex">

      {/* Sidebar */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} collapsed={sidebarCollapsed} onToggleCollapsed={() => setSidebarCollapsed(previous => !previous)} />

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/25 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main area */}
      <div className="cd-dashboard-main flex-1 flex flex-col min-w-0 min-h-screen" style={{ "--dashboard-sidebar-width": sidebarCollapsed ? "72px" : "288px" }}>
        <TopHeader onMenuClick={() => setSidebarOpen(true)} sidebarOpen={sidebarOpen} />
        <main className="flex-1 px-4 sm:px-6 md:px-10 py-5 sm:py-8 w-full min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
