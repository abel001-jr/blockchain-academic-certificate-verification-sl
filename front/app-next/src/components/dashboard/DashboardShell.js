"use client";
import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import TopHeader from "./TopHeader";
import DashboardLoader from "./DashboardLoader";
import { jwtPayload } from "@/lib/api";

export default function DashboardShell({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const claims = jwtPayload();
    if (!claims) {
      window.location.href = "/login";
      return;
    }
    if (claims.token_use === "officer_setup") {
      window.location.href = "/setup";
      return;
    }
    setAllowed(true);
  }, []);

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
    <div className="min-h-screen bg-[#F8F7F2] flex">

      {/* Sidebar */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/25 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-72 min-h-screen">
        <TopHeader onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 px-6 md:px-10 py-8 w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
