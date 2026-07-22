"use client";
import { useState, useEffect, useCallback } from "react";
import { Plus, MoreVertical, Loader2, Trash2, PencilLine, X, Check } from "lucide-react";
import StatusBadge from "@/components/dashboard/StatusBadge";
import { api }     from "@/lib/api";
import { useAuth, ROLES } from "@/lib/useAuth";

export default function RegistrarsPage() {
  const { role } = useAuth();
  const canManage = [ROLES.SUPER_ADMIN, ROLES.INSTITUTIONAL_ADMIN].includes(role);

  const [registrars, setRegistrars] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [showForm,   setShowForm]   = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [formError,  setFormError]  = useState("");

  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", password: "",
    role: "registrar", wallet_address: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get("/users/?role=registrar");
      setRegistrars(data.results ?? data);
    } catch {
      setError("Failed to load registrars.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      await api.post("/users/", form);
      setShowForm(false);
      setForm({ first_name: "", last_name: "", email: "", password: "", role: "registrar", wallet_address: "" });
      load();
    } catch (e) {
      setFormError(JSON.stringify(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(reg) {
    if (!confirm(`Deactivate ${reg.first_name} ${reg.last_name}?`)) return;
    try {
      await api.patch(`/users/${reg.id}/`, { is_active: false });
      load();
    } catch (e) {
      alert("Failed: " + JSON.stringify(e));
    }
  }

  async function handleDelete(reg) {
    if (!confirm(`Permanently delete ${reg.first_name} ${reg.last_name}? This cannot be undone.`)) return;
    try {
      await api.delete(`/users/${reg.id}/`);
      load();
    } catch (e) {
      alert("Failed: " + JSON.stringify(e));
    }
  }

  const active   = registrars.filter(r => r.is_active);
  const inactive = registrars.filter(r => !r.is_active);

  return (
    <div className="flex flex-col gap-6 max-w-[1280px]">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-[#022448] font-bold text-2xl">Registrars</h2>
          <p className="text-[#43474e] text-sm mt-0.5">Manage registrar accounts and permissions</p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-[#022448] text-white px-5 py-2.5 rounded-[12px] text-sm font-semibold hover:opacity-90 transition-all active:scale-95 self-start"
          >
            <Plus size={16} /> Add Registrar
          </button>
        )}
      </div>

      {/* Add registrar form */}
      {showForm && canManage && (
        <div className="bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-[#022448] font-semibold text-sm">New Registrar</h3>
            <button onClick={() => setShowForm(false)} className="text-[#43474e] hover:text-[#022448]">
              <X size={18} />
            </button>
          </div>
          {formError && (
            <div className="bg-[#ffdad6] text-[#93000a] text-xs px-4 py-2 rounded-lg mb-4">{formError}</div>
          )}
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              ["first_name",     "First Name",     "text"],
              ["last_name",      "Last Name",      "text"],
              ["email",          "Email",          "email"],
              ["password",       "Password",       "password"],
              ["wallet_address", "Wallet Address", "text"],
            ].map(([field, label, type]) => (
              <div key={field}>
                <label className="text-[#022448] text-xs font-semibold uppercase tracking-widest block mb-1.5">{label}</label>
                <input
                  type={type}
                  required={field !== "wallet_address"}
                  value={form[field]}
                  onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                  className="w-full bg-[#eef4ff] border border-transparent focus:border-[#022448] rounded-[10px] px-4 py-3 text-sm text-[#121c28] outline-none transition-all"
                />
              </div>
            ))}
            <div className="sm:col-span-2 flex gap-3 mt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 bg-[#022448] text-white px-6 py-3 rounded-[12px] text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-60"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                {saving ? "Saving…" : "Create Registrar"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-6 py-3 rounded-[12px] border border-[#c4c6cf]/40 text-[#43474e] text-sm font-medium hover:bg-[#eef4ff] transition-all"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: "Total Registrars", value: registrars.length },
          { label: "Active",           value: active.length },
          { label: "Inactive",         value: inactive.length },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-[14px] shadow-card p-5 border border-[#c4c6cf]/10">
            <p className="text-[#022448] text-2xl font-bold">{value}</p>
            <p className="text-[#43474e] text-xs font-semibold uppercase tracking-wider mt-1">{label}</p>
          </div>
        ))}
      </div>

      {error && <div className="bg-[#ffdad6] text-[#93000a] text-sm px-4 py-3 rounded-lg">{error}</div>}

      {/* List */}
      <div className="bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-[#c4c6cf]/15">
          <h3 className="text-[#022448] font-semibold text-sm">Registrar Accounts</h3>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={24} className="text-[#022448] animate-spin" />
          </div>
        ) : (
          <div className="divide-y divide-[#c4c6cf]/10">
            {registrars.length === 0 && (
              <p className="px-6 py-8 text-[#43474e] text-sm text-center">No registrars found.</p>
            )}
            {registrars.map((reg) => (
              <div key={reg.id} className="flex items-center justify-between px-6 py-4 hover:bg-[#FAF7F2] transition-colors">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#022448] flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {(reg.first_name?.[0] ?? "") + (reg.last_name?.[0] ?? "")}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[#022448] text-sm font-semibold">{reg.first_name} {reg.last_name}</p>
                    <p className="text-[#43474e] text-xs">{reg.email}</p>
                    {reg.wallet_address && (
                      <p className="text-[#74777f] text-xs font-mono mt-0.5">
                        {reg.wallet_address.slice(0, 10)}…
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0 ml-4">
                  <StatusBadge status={reg.is_active ? "issued" : "revoked"} />
                  {canManage && (
                    <div className="flex gap-1">
                      {reg.is_active && (
                        <button
                          onClick={() => handleDeactivate(reg)}
                          title="Deactivate"
                          className="p-2 rounded-lg hover:bg-[#ED8A19]/10 text-[#ED8A19] transition-colors"
                        >
                          <PencilLine size={15} />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(reg)}
                        title="Delete"
                        className="p-2 rounded-lg hover:bg-[#C62828]/10 text-[#C62828] transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
