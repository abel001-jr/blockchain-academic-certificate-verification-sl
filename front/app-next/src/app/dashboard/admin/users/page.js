"use client";
import Link from "next/link";
import { useAuthorizationStatus } from "@/lib/authorizationStatus";
import UserAvatar from "@/components/UserAvatar";
import UserDetailsPanel from "@/components/dashboard/UserDetailsPanel";
import FloatingDetailDialog from "@/components/dashboard/FloatingDetailDialog";
import NavigationButton from "@/components/ui/NavigationButton";

import { Fragment, useState, useEffect, useCallback } from "react";
import { Search, Loader2, CheckCircle2, XCircle, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth, ROLES } from "@/lib/useAuth";

const ROLE_COLORS = {
  super_admin:         "bg-[#A23B34]/10 text-[#A23B34]",
  institutional_admin: "bg-[#08283F]/10 text-[#08283F]",
  registrar:           "bg-[#B98A28]/10 text-[#B98A28]",
  student:             "bg-[#2F6F4E]/10 text-[#2F6F4E]",
};
const ROLE_LABELS = { super_admin: "System administrator", institutional_admin: "Institution administrator", chancellor: "Chancellor", vc: "Vice-Chancellor", registrar: "Registrar", student: "Student" };
const roleLabel = role => ROLE_LABELS[role] || role;
const hierarchyGroup = role => role === "super_admin" ? "Platform administration" : role === "institutional_admin" ? "Institution administration" : role === "student" ? "Credential recipients" : "Institutional officers";

export default function AllUsersPage() {
  const { role, user: currentUser, loading: authLoading } = useAuth();
  const [viewUserId, setViewUserId] = useState(null);
  const [users,   setUsers]   = useState([]);
  const chain = useAuthorizationStatus(users);
  const [count,   setCount]   = useState(0);
  const [roleFilter, setRoleFilter] = useState("");
  const [setupFilter, setSetupFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [institutionFilter, setInstitutionFilter] = useState("");
  const [institutions, setInstitutions] = useState([]);
  const [search,  setSearch]  = useState("");
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [statusUser, setStatusUser] = useState(null);
  const [statusReason, setStatusReason] = useState("");
  const [statusSaving, setStatusSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      let url = `/users/?page=${page}`;
      if (search.trim()) url += `&search=${encodeURIComponent(search.trim())}`;
      url += "&page_size=20";
      if (roleFilter) url += "&role=" + encodeURIComponent(roleFilter);
      if (setupFilter) url += "&setup_status=" + setupFilter;
      if (activeFilter) url += "&is_active=" + activeFilter;
      if (institutionFilter) url += "&institution=" + encodeURIComponent(institutionFilter);
      const data = await api.get(url);
      setUsers(data.results ?? data);
      setCount(data.count ?? (data.results ?? data).length);
    } catch { setError("Failed to load users."); }
    finally  { setLoading(false); }
  }, [page, search, roleFilter, activeFilter, institutionFilter, setupFilter]);

  useEffect(() => {
    if (authLoading || role !== ROLES.SUPER_ADMIN) return;
    let active = true;
    Promise.resolve().then(() => { if (active) load(); });
    return () => { active = false; };
  }, [load, authLoading, role]);
  useEffect(() => {
    if (authLoading || role !== ROLES.SUPER_ADMIN) return;
    let active = true;
    api.get("/institutions/?page_size=100&include_inactive=true").then(data => { if (active) setInstitutions(data.results ?? data); }).catch(() => {});
    return () => { active = false; };
  }, [role, authLoading]);

  function openDeactivateDialog(user) {
    setStatusUser(user);
    setStatusReason("");
  }

  function closeDeactivateDialog(force = false) {
    if (force || !statusSaving) {
      setStatusUser(null);
      setStatusReason("");
    }
  }

  async function handleDeactivate(e) {
    e.preventDefault();
    if (!statusUser || !statusReason.trim()) return;
    setStatusSaving(true);
    try {
      await api.patch(`/users/${statusUser.id}/`, { is_active: false, reason: statusReason.trim() });
      closeDeactivateDialog(true);
      load();
    } catch (err) {
      setError(err?.detail || "Failed to deactivate user.");
    } finally {
      setStatusSaving(false);
    }
  }

  if (authLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={28} className="text-[#08283F] animate-spin" />
      </div>
    );
  }

  if (role !== ROLES.SUPER_ADMIN) {
    return <p className="text-[#A23B34] text-sm">Super Admin access only.</p>;
  }

  const totalPages = Math.ceil(count / 20);

  return (
    <div className="flex flex-col gap-6 w-full">
      {viewUserId && <FloatingDetailDialog title="User details" onClose={() => setViewUserId(null)}><UserDetailsPanel id={viewUserId} /></FloatingDetailDialog>}
      {statusUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#081c2d]/55 p-4" role="dialog" aria-modal="true" aria-labelledby="user-deactivation-title">
          <form onSubmit={handleDeactivate} className="w-full max-w-md overflow-hidden rounded-2xl border border-[#D9E0E7] bg-white shadow-2xl">
            <div className="h-1.5 bg-[#A23B34]" />
            <div className="p-6">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FCEBE9] text-[#A23B34]"><XCircle size={20} /></div>
                  <div>
                    <h3 id="user-deactivation-title" className="text-base font-bold text-[#08283F]">Deactivate user</h3>
                    <p className="mt-0.5 text-xs text-[#687B8E]">This action requires an audit reason.</p>
                  </div>
                </div>
                <button type="button" onClick={closeDeactivateDialog} disabled={statusSaving} className="rounded-lg p-1 text-[#687B8E] hover:bg-[#EDF0F2] hover:text-[#08283F] disabled:opacity-50" aria-label="Close dialog"><X size={18} /></button>
              </div>
              <div className="rounded-xl border border-[#E4E0D5] bg-[#F8F7F2] px-4 py-3">
                <p className="text-sm font-semibold text-[#08283F]">{statusUser.first_name} {statusUser.last_name}</p>
                <p className="mt-1 text-xs text-[#687B8E]">{statusUser.email} · {roleLabel(statusUser.role)}</p>
              </div>
              <p className="mt-4 text-sm leading-6 text-[#4A5A68]">This prevents the user from signing in. Their account, certificates, and audit history are retained.</p>
              <label className="mt-5 block text-sm font-semibold text-[#08283F]" htmlFor="user-deactivation-reason">Reason <span className="text-[#A23B34]">*</span></label>
              <textarea id="user-deactivation-reason" autoFocus required rows={4} value={statusReason} onChange={e => setStatusReason(e.target.value)} placeholder="Enter the reason for deactivation…" className="cd-input mt-2 w-full resize-none" />
              <p className="mt-1.5 text-xs text-[#687B8E]">This reason will be stored in the audit log.</p>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={closeDeactivateDialog} disabled={statusSaving} className="cd-btn-secondary disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={statusSaving || !statusReason.trim()} className="cd-btn-primary bg-[#A23B34] disabled:cursor-not-allowed disabled:opacity-50">
                  {statusSaving ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />}
                  {statusSaving ? "Deactivating…" : "Deactivate user"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
      <div>
        <h2 className="dash-page-title">All Users</h2>
        <p className="dash-page-sub">{count} users matching current filters</p>
        <button type="button" onClick={load} disabled={loading} className="cd-btn-secondary mt-3">{loading ? "Refreshing..." : "Refresh users"}</button>
      </div>

      <div className="dash-card p-4 space-y-3">
        <div className="dash-search max-w-sm">
          <Search size={15} className="text-[#8A929C] shrink-0" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name or email…" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-semibold text-[#08283F]">User type<select className="cd-input mt-1" value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1); }}><option value="">All user types</option><optgroup label="Administration"><option value="super_admin">System administrator</option><option value="institutional_admin">Institution administrator</option></optgroup><optgroup label="Institutional officers"><option value="chancellor">Chancellor</option><option value="vc">Vice-Chancellor</option><option value="registrar">Registrar</option></optgroup><optgroup label="Recipients"><option value="student">Student</option></optgroup></select></label>
          <label className="text-xs font-semibold text-[#08283F]">Account status<select className="cd-input mt-1" value={activeFilter} onChange={e => { setActiveFilter(e.target.value); setPage(1); }}><option value="">All statuses</option><option value="true">Active</option><option value="false">Inactive</option></select></label>
          <label className="text-xs font-semibold text-[#08283F]">Officer setup<select className="cd-input mt-1" value={setupFilter} onChange={e => { setSetupFilter(e.target.value); setPage(1); }}><option value="">All authorization statuses</option><option value="wallet_pending">1. Awaiting wallet verification</option><option value="password_pending">2. Awaiting password setup</option><option value="setup_complete">3. Setup complete ? dashboard access</option></select></label>
          <label className="text-xs font-semibold text-[#08283F]">Institution<select className="cd-input mt-1" value={institutionFilter} onChange={e => { setInstitutionFilter(e.target.value); setPage(1); }}><option value="">All institutions</option>{institutions.map(institution => <option key={institution.id} value={institution.id}>{institution.name}</option>)}</select></label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-[#687B8E]">Platform administration &rarr; institution administration &rarr; officers &rarr; recipients</p><button type="button" className="cd-btn-secondary" onClick={() => { setSearch(""); setRoleFilter(""); setActiveFilter(""); setSetupFilter(""); setInstitutionFilter(""); setPage(1); }}>Clear filters</button></div>
      </div>

      {error && <div className="dash-error">{error}</div>}
      {chain.error && <p role="alert" className="dash-error">{chain.error}</p>}

      <div className="dash-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr>
                {["Name", "Email", "Role", "Institution", "Status", "Joined", ""].map(h => (
                  <th key={h} className="dash-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E1D6]">
              {loading && <tr><td colSpan={7} className="text-center py-12"><Loader2 size={22} className="text-[#08283F] animate-spin mx-auto" /></td></tr>}
              {!loading && users.length === 0 && <tr><td colSpan={7} className="text-center py-12 text-[#4A5A68] text-sm">No users found.</td></tr>}
              {!loading && users.map((u, index) => (
                <Fragment key={u.id}>
                {(index === 0 || hierarchyGroup(users[index - 1].role) !== hierarchyGroup(u.role)) && <tr><th colSpan={7} className="bg-[var(--cd-tint)] px-5 py-3 text-left text-xs font-semibold uppercase text-[#08283F]">{hierarchyGroup(u.role)}</th></tr>}
                <tr className="hover:bg-[#F8F7F2] transition-colors">
                  <td className="dash-td">
                    <div className="flex items-center gap-2">
                      <UserAvatar user={u} />
                      <span className="text-[#08283F] text-sm font-medium">{u.first_name} {u.last_name}</span>
                    </div>
                  </td>
                  <td className="dash-td text-[#4A5A68] text-sm">{u.email}</td>
                  <td className="dash-td">
                    <span className={`px-2.5 py-1 rounded text-[11px] font-semibold capitalize ${ROLE_COLORS[u.role] ?? "bg-[#8A929C]/10 text-[#4A5A68]"}`}>
                      {roleLabel(u.role)}
                    </span>
                  </td>
                  <td className="dash-td text-[#4A5A68] text-xs">{u.institution_name || "No institution"}</td>
                  <td className="dash-td">
                    <div className="flex flex-col items-start gap-1"><span className={"rounded px-2 py-1 text-xs font-semibold " + (u.is_active ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800")}>{u.is_active ? "Active" : "Inactive"}</span>{["registrar", "vc", "chancellor"].includes(u.role) && <span className={"rounded px-2 py-1 text-xs font-semibold " + (u.wallet_verified && !u.must_change_password ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800")}>{!u.wallet_verified ? "Awaiting wallet verification" : u.must_change_password ? "Awaiting password setup" : "Setup complete"}</span>}</div>
                  </td>
                  <td className="dash-td text-[#4A5A68] text-xs whitespace-nowrap">
                    {u.date_joined ? new Date(u.date_joined).toLocaleDateString() : "—"}
                  </td>
                  <td className="dash-td">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="cd-btn-secondary" onClick={() => setViewUserId(u.id)}>View details</button>
                      {["institutional_admin", "registrar", "vc", "chancellor"].includes(u.role) && <div className="text-xs">
                        <p className={chain.statuses[u.id] === true ? "text-green-800" : "text-amber-900"}>{!u.wallet_address ? "Wallet setup required" : chain.loading ? "Checking blockchain access..." : chain.statuses[u.id] === true ? "Authorized on current chain" : chain.statuses[u.id] === false ? "Blockchain authorization required" : "Blockchain access unverified"}</p>
                        {u.role === "institutional_admin" && chain.statuses[u.id] !== true && <Link href="/dashboard/admin/anchor" className="mt-1 inline-block font-semibold underline">Register institution wallet</Link>}
                        {u.role !== "institutional_admin" && chain.statuses[u.id] === false && <p className="mt-1">Register the institution first; its admin then authorizes this officer in Officers.</p>}
                      </div>}
                      {u.is_active && u.role !== ROLES.SUPER_ADMIN && u.id !== currentUser?.id && <button onClick={() => openDeactivateDialog(u)}
                        className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors text-[#A9721F] hover:bg-[#A9721F]/10">
                        Deactivate
                      </button>}
                    </div>
                  </td>
                </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-4 border-t border-[#E4E1D6] flex items-center justify-between">
          <p className="dash-pagination-text">Page {page} of {totalPages || 1} · {count} total</p>
          <div className="flex gap-2">
            <NavigationButton direction="back" disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="dash-pagination-btn">Previous</NavigationButton>
            <NavigationButton disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              className="dash-pagination-btn">Next</NavigationButton>
          </div>
        </div>
      </div>
    </div>
  );
}
