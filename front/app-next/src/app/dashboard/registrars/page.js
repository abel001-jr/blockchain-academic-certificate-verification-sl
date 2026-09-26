"use client";
import { useState, useEffect, useCallback } from "react";
import { Plus, Loader2, PencilLine, X, Check } from "lucide-react";
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
    first_name: "", last_name: "", email: "", password: "", role: "registrar", wallet_address: "",
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
    setSaving(true); setFormError("");
    try {
      await api.post("/users/", form);
      setShowForm(false);
      setForm({ first_name: "", last_name: "", email: "", password: "", role: "registrar", wallet_address: "" });
      load();
    } catch (e) { setFormError(JSON.stringify(e)); }
    finally { setSaving(false); }
  }

  async function handleDeactivate(reg) {
    if (!confirm(`Deactivate ${reg.first_name} ${reg.last_name}?`)) return;
    try { await api.patch(`/users/${reg.id}/`, { is_active: false }); load(); }
    catch (e) { alert("Failed: " + JSON.stringify(e)); }
  }

  const active   = registrars.filter(r => r.is_active);
  const inactive = registrars.filter(r => !r.is_active);

  return (
    <div className="flex flex-col gap-5 w-full">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-[#08283F] font-bold text-2xl">Registrars</h2>
          <p className="text-[#4A5A68] text-sm mt-0.5">Manage registrar accounts and permissions</p>
        </div>
        {canManage && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-[#08283F] text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-all self-start">
            <Plus size={15} /> Add Registrar
          </button>
        )}
      </div>

      {/* Compact stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total", value: registrars.length },
          { label: "Active", value: active.length },
          { label: "Inactive", value: inactive.length },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-[#E4E1D6] px-4 py-3 flex items-center gap-3">
            <p className="text-xl font-bold text-[#08283F]">{value}</p>
            <p className="text-[#4A5A68] text-sm font-medium">{label}</p>
          </div>
        ))}
      </div>

      {/* Add form — inline, compact */}
      {showForm && canManage && (
        <div className="bg-white rounded-xl border border-[#E4E1D6] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[#08283F] font-semibold text-sm">New Registrar</h3>
            <button onClick={() => setShowForm(false)} className="text-[#4A5A68] hover:text-[#08283F] p-1">
              <X size={16} />
            </button>
          </div>
          {formError && <div className="dash-error text-xs mb-3">{formError}</div>}
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              ["first_name","First Name","text"],
              ["last_name","Last Name","text"],
              ["email","Email","email"],
              ["password","Password","password"],
              ["wallet_address","Wallet Address","text"],
            ].map(([field, label, type]) => (
              <div key={field}>
                <label className="cd-label text-xs mb-1">{label}</label>
                <input type={type} required={field !== "wallet_address"}
                  value={form[field]} onChange={e => setForm({ ...form, [field]: e.target.value })}
                  className="cd-input" />
              </div>
            ))}
            <div className="sm:col-span-2 flex gap-2 mt-1">
              <button type="submit" disabled={saving}
                className="cd-btn-primary disabled:opacity-60">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {saving ? "Saving…" : "Create Registrar"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="cd-btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {error && <div className="dash-error">{error}</div>}

      {/* List */}
      <div className="dash-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#E4E1D6]">
          <h3 className="text-[#08283F] font-semibold text-sm">Registrar Accounts</h3>
          <span className="text-[#4A5A68] text-xs">{registrars.length} total</span>
        </div>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 size={22} className="text-[#08283F] animate-spin" /></div>
        ) : (
          <div className="divide-y divide-[#E4E1D6]">
            {registrars.length === 0 && (
              <p className="px-5 py-8 text-[#4A5A68] text-sm text-center">No registrars found.</p>
            )}
            {registrars.map(reg => (
              <div key={reg.id} className="flex items-center justify-between px-5 py-3 hover:bg-[#F8F7F2] transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-[#08283F] flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {(reg.first_name?.[0] ?? "") + (reg.last_name?.[0] ?? "")}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[#08283F] text-sm font-semibold">{reg.first_name} {reg.last_name}</p>
                    <p className="text-[#4A5A68] text-xs truncate">{reg.email}
                      {reg.wallet_address && <span className="ml-2 font-mono text-[#8A929C]">{reg.wallet_address.slice(0, 8)}…</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-3">
                  <StatusBadge status={reg.is_active ? "verified" : "revoked"} />
                  {canManage && (
                    <div className="flex gap-1">
                      {reg.is_active && (
                        <button onClick={() => handleDeactivate(reg)} title="Deactivate"
                          className="p-1.5 rounded-lg hover:bg-[#A9721F]/10 text-[#A9721F] transition-colors">
                          <PencilLine size={14} />
                        </button>
                      )}
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
