"use client";
import { subscribeDashboardRefresh } from "@/lib/dashboardRefresh.mjs";
import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";

const PendingApplicationsContext = createContext(0);
export const usePendingApplications = () => useContext(PendingApplicationsContext);

export default function PendingApplicationsProvider({ children }) {
  const { role } = useAuth();
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (role !== "super_admin") return;
    let cancelled = false;
    let inFlight = false;
    const refresh = async () => {
      if (inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const data = await api.get("/admin/institutions/pending/");
        const total = typeof data.count === "number" ? data.count : (data.results ?? data).length;
        if (!cancelled) setCount(total);
      } catch { /* Keep the last successful count during temporary failures. */ }
      finally { inFlight = false; }
    };
    const unsubscribe = subscribeDashboardRefresh(refresh);
    window.addEventListener("credence:applications-updated", refresh);
    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener("credence:applications-updated", refresh);
    };
  }, [role, pathname]);
  return <PendingApplicationsContext.Provider value={role === "super_admin" ? count : 0}>{children}</PendingApplicationsContext.Provider>;
}

export function PendingApplicationsNotice() {
  const count = usePendingApplications();
  if (!count) return null;
  return <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-amber-950">
    <p><strong>{count} institution application{count === 1 ? " is" : "s are"} awaiting approval.</strong> Please review the pending applications.</p>
    <Link href="/dashboard/admin/applications" className="font-semibold underline underline-offset-4">Review applications</Link>
  </div>;
}
