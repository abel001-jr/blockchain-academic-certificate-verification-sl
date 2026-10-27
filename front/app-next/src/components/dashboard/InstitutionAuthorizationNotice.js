"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { useAuthorizationStatus } from "@/lib/authorizationStatus";

export default function InstitutionAuthorizationNotice() {
  const { role, user } = useAuth();
  const [institutions, setInstitutions] = useState([]);
  const [error, setError] = useState("");
  const { statuses, error: chainError, loading } = useAuthorizationStatus(institutions);
  useEffect(() => {
    if (!["super_admin", "institutional_admin"].includes(role)) return;
    let alive = true;
    async function load() {
      try {
        const records = [];
        if (role === "institutional_admin" && user?.institution) records.push(await api.get(`/institutions/${user.institution}/`));
        else {
          let page = 1, more = true;
          while (more) {
            const data = await api.get(`/institutions/?page_size=100&page=${page++}`);
            records.push(...(data.results ?? data));
            more = !!data.next;
          }
        }
        if (alive) { setInstitutions(records.filter(i => i.is_active !== false).map(i => ({ ...i, role: "institutional_admin" }))); setError(""); }
      } catch { if (alive) setError("Could not load institution authorization requirements."); }
    }
    void load();
    return () => { alive = false; };
  }, [role, user?.institution]);
  if (!["super_admin", "institutional_admin"].includes(role)) return null;
  const pending = institutions.filter(i => !i.wallet_address || statuses[i.id] === false);
  if (!error && !chainError && (loading || !pending.length)) return null;
  return <div role="status" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
    <p className="font-semibold">{error || chainError || `${pending.length} institution wallet${pending.length === 1 ? " needs" : "s need"} blockchain registration`}</p>
    {pending.length > 0 && <p className="mt-1">{pending.map(i => i.name).join(", ")}. The system administrator must register the institution wallet before its administrator can authorize the Registrar, Vice-Chancellor and Chancellor.</p>}
    {role === "super_admin" && <Link href="/dashboard/admin/anchor" className="mt-2 inline-block font-semibold underline">Review and register institution wallets with MetaMask</Link>}
    {role === "institutional_admin" && <p className="mt-2">Contact the system administrator to complete institution registration, then return to Officers to authorize each officer.</p>}
  </div>;
}
