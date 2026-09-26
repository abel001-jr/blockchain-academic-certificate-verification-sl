"use client";
import { useState, useEffect, useCallback } from "react";
import { Search, Loader2, CheckCircle2, XCircle, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth, ROLES } from "@/lib/useAuth";

const ROLE_COLORS = {
  super_admin:         "bg-[#A23B34]/10 text-[#A23B34]",
  institutional_admin: "bg-[#08283F]/10 text-[#08283F]",
  registrar:           "bg-[#B98A28]/10 text-[#B98A28]",
  student:             "bg-[#2F6F4E]/10 text-[#2F6F4E]",
};
const roleLabel = (role) => role === "chancellor" ? "Dean" : role?.replace(/_/g, " ");

export default function AllUsersPage() {
  const { role, user: currentUser, loading: authLoading } = useAuth();
  const [users,   setUsers]   = useState([]);
  const [count,   setCount]   = useState(0);
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
      const data = await api.get(url);
      setUsers(data.results ?? data);
      setCount(data.count ?? (data.results ?? data).length);
    } catch { setError("Failed to load users."); }
    finally  { setLoading(false); }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

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
        <p className="dash-page-sub">{count} total users</p>
      </div>

      <div className="dash-card p-4">
        <div className="dash-search max-w-sm">
          <Search size={15} className="text-[#8A929C] shrink-0" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name or email…" />
        </div>
      </div>

      {error && <div className="dash-error">{error}</div>}

      <div className="dash-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr>
                {["Name", "Email", "Role", "Institution", "Active", "Joined", ""].map(h => (
                  <th key={h} className="dash-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E1D6]">
              {loading && <tr><td colSpan={7} className="text-center py-12"><Loader2 size={22} className="text-[#08283F] animate-spin mx-auto" /></td></tr>}
              {!loading && users.length === 0 && <tr><td colSpan={7} className="text-center py-12 text-[#4A5A68] text-sm">No users found.</td></tr>}
              {!loading && users.map(u => (
                <tr key={u.id} className="hover:bg-[#F8F7F2] transition-colors">
                  <td className="dash-td">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-[#08283F] flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {(u.first_name?.[0] ?? "") + (u.last_name?.[0] ?? "")}
                      </div>
                      <span className="text-[#08283F] text-sm font-medium">{u.first_name} {u.last_name}</span>
                    </div>
                  </td>
                  <td className="dash-td text-[#4A5A68] text-sm">{u.email}</td>
                  <td className="dash-td">
                    <span className={`px-2.5 py-1 rounded text-[11px] font-semibold capitalize ${ROLE_COLORS[u.role] ?? "bg-[#8A929C]/10 text-[#4A5A68]"}`}>
                      {roleLabel(u.role)}
                    </span>
                  </td>
                  <td className="dash-td text-[#4A5A68] text-xs">{u.institution ?? "—"}</td>
                  <td className="dash-td">
                    {u.is_active ? <CheckCircle2 size={16} className="text-[#2F6F4E]" /> : <XCircle size={16} className="text-[#A23B34]" />}
                  </td>
                  <td className="dash-td text-[#4A5A68] text-xs whitespace-nowrap">
                    {u.date_joined ? new Date(u.date_joined).toLocaleDateString() : "—"}
                  </td>
                  <td className="dash-td">
                    <div className="flex gap-1">
                      {u.is_active && u.role !== ROLES.SUPER_ADMIN && u.id !== currentUser?.id && <button onClick={() => openDeactivateDialog(u)}
                        className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors text-[#A9721F] hover:bg-[#A9721F]/10">
                        Deactivate
                      </button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-4 border-t border-[#E4E1D6] flex items-center justify-between">
          <p className="dash-pagination-text">Page {page} of {totalPages || 1} · {count} total</p>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="dash-pagination-btn">Previous</button>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              className="dash-pagination-btn">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
