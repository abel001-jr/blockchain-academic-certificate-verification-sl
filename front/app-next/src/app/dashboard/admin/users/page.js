"use client";
import { useState, useEffect, useCallback } from "react";
import { Search, Loader2, CheckCircle2, XCircle, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth, ROLES } from "@/lib/useAuth";

const ROLE_COLORS = {
  super_admin:         "bg-[#C62828]/10 text-[#C62828]",
  institutional_admin: "bg-[#022448]/10 text-[#022448]",
  registrar:           "bg-[#7b5900]/10 text-[#7b5900]",
  student:             "bg-[#2E7D32]/10 text-[#2E7D32]",
};

export default function AllUsersPage() {
  const { role, loading: authLoading } = useAuth();
  const [users,   setUsers]   = useState([]);
  const [count,   setCount]   = useState(0);
  const [search,  setSearch]  = useState("");
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

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

  async function handleToggle(user) {
    try {
      await api.patch(`/users/${user.id}/`, { is_active: !user.is_active });
      load();
    } catch { alert("Failed to update user."); }
  }

  async function handleDelete(user) {
    if (!confirm(`Delete ${user.first_name} ${user.last_name}? This cannot be undone.`)) return;
    try { await api.delete(`/users/${user.id}/`); load(); }
    catch { alert("Failed to delete user."); }
  }

  if (authLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={28} className="text-[#022448] animate-spin" />
      </div>
    );
  }

  if (role !== ROLES.SUPER_ADMIN) {
    return <p className="text-[#C62828] text-sm">Super Admin access only.</p>;
  }

  const totalPages = Math.ceil(count / 20);

  return (
    <div className="flex flex-col gap-6 max-w-[1280px]">
      <div>
        <h2 className="text-[#022448] font-bold text-2xl">All Users</h2>
        <p className="text-[#43474e] text-sm mt-0.5">{count} total users</p>
      </div>

      <div className="bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 p-4">
        <div className="flex items-center gap-2 bg-[#eef4ff] rounded-[10px] px-3 py-2.5 max-w-sm border border-transparent focus-within:border-[#022448] transition-colors">
          <Search size={15} className="text-[#74777f] shrink-0" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name or email…"
            className="bg-transparent text-sm text-[#121c28] outline-none placeholder:text-[#74777f] w-full" />
        </div>
      </div>

      {error && <div className="bg-[#ffdad6] text-[#93000a] text-sm px-4 py-3 rounded-lg">{error}</div>}

      <div className="bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-[#c4c6cf]/15">
                {["Name", "Email", "Role", "Institution", "Active", "Joined", ""].map(h => (
                  <th key={h} className="text-left px-5 py-3.5 text-[#43474e] text-xs font-semibold uppercase tracking-wider bg-[#FAF7F2]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c4c6cf]/10">
              {loading && <tr><td colSpan={7} className="text-center py-12"><Loader2 size={22} className="text-[#022448] animate-spin mx-auto" /></td></tr>}
              {!loading && users.length === 0 && <tr><td colSpan={7} className="text-center py-12 text-[#43474e] text-sm">No users found.</td></tr>}
              {!loading && users.map(u => (
                <tr key={u.id} className="hover:bg-[#FAF7F2] transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-[#022448] flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {(u.first_name?.[0] ?? "") + (u.last_name?.[0] ?? "")}
                      </div>
                      <span className="text-[#022448] text-sm font-medium">{u.first_name} {u.last_name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-[#43474e] text-sm">{u.email}</td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2.5 py-1 rounded text-[11px] font-semibold capitalize ${ROLE_COLORS[u.role] ?? "bg-[#74777f]/10 text-[#43474e]"}`}>
                      {u.role?.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-[#43474e] text-xs">{u.institution ?? "—"}</td>
                  <td className="px-5 py-3.5">
                    {u.is_active ? <CheckCircle2 size={16} className="text-[#2E7D32]" /> : <XCircle size={16} className="text-[#C62828]" />}
                  </td>
                  <td className="px-5 py-3.5 text-[#43474e] text-xs whitespace-nowrap">
                    {u.date_joined ? new Date(u.date_joined).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex gap-1">
                      <button onClick={() => handleToggle(u)}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors ${u.is_active ? "text-[#ED8A19] hover:bg-[#ED8A19]/10" : "text-[#2E7D32] hover:bg-[#2E7D32]/10"}`}>
                        {u.is_active ? "Deactivate" : "Activate"}
                      </button>
                      <button onClick={() => handleDelete(u)}
                        className="p-1.5 rounded-lg hover:bg-[#C62828]/10 text-[#C62828] transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-[#c4c6cf]/15 flex items-center justify-between">
          <p className="text-[#43474e] text-xs">Page {page} of {totalPages || 1} · {count} total</p>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 rounded-lg bg-[#eef4ff] text-[#43474e] text-xs font-medium hover:bg-[#022448]/10 disabled:opacity-40 transition-colors">Previous</button>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded-lg bg-[#eef4ff] text-[#43474e] text-xs font-medium hover:bg-[#022448]/10 disabled:opacity-40 transition-colors">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
