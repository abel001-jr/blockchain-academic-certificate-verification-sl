"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuthorizationStatus } from "@/lib/authorizationStatus";
import { useAuth } from "@/lib/useAuth";
import { api } from "@/lib/api";

export default function UserDetailsPanel({ id }) {
  const [user, setUser] = useState(null);
  const [error, setError] = useState("");
  const { role } = useAuth();
  const records = useMemo(() => user ? [user] : [], [user]);
  const chain = useAuthorizationStatus(records);
  useEffect(() => {
    let active = true;
    api.get(`/users/${id}/`).then(data => { if (active) setUser(data); }).catch(() => { if (active) setError("Could not retrieve current user details."); });
    return () => { active = false; };
  }, [id]);
  if (error) return <p role="alert">{error}</p>;
  if (!user) return <p role="status">Loading current user information...</p>;
  const yesNo = value => value ? "Yes" : "No";
  const date = value => value ? new Date(value).toLocaleString() : "Not recorded";
  const fields = [
    ["Full name", user.full_name], ["Email", user.email], ["Role", user.role === "vc" ? "Vice-Chancellor" : user.role?.replaceAll("_", " ")],
    ["Institution", user.institution_name || "No institution"], ["Institution code", user.institution_code], ["Phone", user.phone_number], ["Student ID", user.student_id],
    ["Wallet address", user.wallet_address], ["Wallet ownership verified", yesNo(user.wallet_verified)], ["Password setup complete", yesNo(!user.must_change_password)],
    ["Officer authorization recorded", user.role === "institutional_admin" ? "Institution registration is checked separately" : yesNo(user.on_chain_authorized)], ["Account active", yesNo(user.is_active)],
    ["Officer setup", user.officer_status?.replaceAll("_", " ") || "Not applicable"], ["Signature available", yesNo(user.has_signature)],
    ["Signature saved", date(user.signature_set_at)], ["Joined", date(user.date_joined)], ["Last login", date(user.last_login)], ["Last updated", date(user.updated_at)],
  ];
  return <div className="space-y-4">
    <p className="text-xs text-[#687B8E]">Retrieved from the current account record. Blockchain authorization shown here is the recorded backend state.</p>
    {["institutional_admin", "registrar", "vc", "chancellor"].includes(user.role) && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
      <p className="font-semibold">Current chain: {!user.wallet_address ? "Wallet missing" : chain.loading ? "Checking..." : chain.statuses[user.id] === true ? "Authorized" : chain.statuses[user.id] === false ? "Authorization required" : "Unverified"}</p>
      {chain.error && <p className="mt-1">{chain.error}</p>}
      {user.role === "institutional_admin" && chain.statuses[user.id] === false && <p className="mt-1">The system administrator must register this institution wallet before its admin can authorize officers.</p>}
      {user.role !== "institutional_admin" && chain.statuses[user.id] === false && <p className="mt-1">The institution admin must authorize this officer after the system administrator registers the institution.</p>}
      {role === "super_admin" && user.role === "institutional_admin" && <Link href="/dashboard/admin/anchor" className="mt-2 inline-block font-semibold underline">Review institution registration</Link>}
    </div>}
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label} className="min-w-0 rounded-xl border border-[var(--cd-line)] bg-white p-3"><dt className="text-xs font-semibold text-[#687B8E]">{label}</dt><dd className="mt-1 break-words text-sm text-[#08283F]">{value || "Not provided"}</dd></div>)}</dl>
    {user.signature_url && <a href={user.signature_url} target="_blank" rel="noopener noreferrer" className="cd-btn-secondary inline-flex">View saved signature</a>}
    {user.profile_photo && <a href={user.profile_photo} target="_blank" rel="noopener noreferrer" className="cd-btn-secondary inline-flex">View profile photo</a>}
  </div>;
}
