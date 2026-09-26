"use client";
import { useState, useEffect, useCallback } from "react";
import { Building2, Loader2, CheckCircle2, XCircle, Plus, Eye, Pencil, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth, ROLES } from "@/lib/useAuth";

export default function AllInstitutionsPage() {
  const { role, loading: authLoading } = useAuth();
  const [insts,   setInsts]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewingInst, setViewingInst] = useState(null);
  const [editingInst, setEditingInst] = useState(null);
  const [statusAction, setStatusAction] = useState(null);
  const [statusReason, setStatusReason] = useState("");
  const [statusSaving, setStatusSaving] = useState(false);
  const [form, setForm] = useState({
    institution_id: "",
    name: "",
    short_name: "",
    country: "Sierra Leone",
    address: "",
    website: "",
    email: "",
    phone: "",
    wallet_address: "",
  });

  const loadInstitutions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get("/institutions/?include_inactive=true");
      setInsts(data.results ?? data);
    } catch {
      setError("Failed to load institutions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || role !== ROLES.SUPER_ADMIN) return;
    loadInstitutions();
  }, [authLoading, role, loadInstitutions]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    
    try {
      if (editingInst) {
        // Update existing institution
        await api.patch(`/institutions/${editingInst.id}/`, form);
        setSuccess(`Institution ${form.name} updated successfully.`);
        setEditingInst(null);
      } else {
        // Create new institution
        await api.post("/institutions/", form);
        setSuccess(`Institution ${form.name} created successfully.`);
      }
      
      setShowForm(false);
      setForm({
        institution_id: "",
        name: "",
        short_name: "",
        country: "Sierra Leone",
        address: "",
        website: "",
        email: "",
        phone: "",
        wallet_address: "",
      });
      loadInstitutions();
    } catch (err) {
      setError(err?.detail || JSON.stringify(err));
    } finally {
      setSaving(false);
    }
  }

  function openStatusDialog(inst, isActive) {
    setStatusAction({ inst, isActive });
    setStatusReason("");
  }

  function closeStatusDialog(force = false) {
    if (force || !statusSaving) {
      setStatusAction(null);
      setStatusReason("");
    }
  }

  async function submitStatusChange(e) {
    e.preventDefault();
    if (!statusAction || !statusReason.trim()) return;
    const { inst, isActive } = statusAction;
    setError("");
    setSuccess("");
    setStatusSaving(true);
    try {
      await api.patch(`/institutions/${inst.id}/`, { is_active: isActive, reason: statusReason.trim() });
      setSuccess(`Institution ${inst.name} ${isActive ? "activated" : "deactivated"} successfully.`);
      closeStatusDialog(true);
      loadInstitutions();
    } catch (err) {
      setError(err?.detail || `Failed to ${isActive ? "activate" : "deactivate"} institution.`);
    } finally {
      setStatusSaving(false);
    }
  }

  function startEdit(inst) {
    setEditingInst(inst);
    setForm({
      institution_id: inst.institution_id,
      name: inst.name,
      short_name: inst.short_name || "",
      country: inst.country,
      address: inst.address || "",
      website: inst.website || "",
      email: inst.email || "",
      phone: inst.phone || "",
      wallet_address: inst.wallet_address || "",
    });
    setShowForm(true);
    setViewingInst(null);
  }

  function viewDetails(inst) {
    setViewingInst(inst);
  }

  function cancelForm() {
    setEditingInst(null);
    setShowForm(false);
    setForm({
      institution_id: "",
      name: "",
      short_name: "",
      country: "Sierra Leone",
      address: "",
      website: "",
      email: "",
      phone: "",
      wallet_address: "",
    });
  }

  if (authLoading) return <div className="flex justify-center py-16"><Loader2 size={24} className="text-[#08283F] animate-spin" /></div>;
  if (role !== ROLES.SUPER_ADMIN) return <p className="text-[#A23B34] text-sm">Super Admin access only.</p>;

  return (
    <div className="flex flex-col gap-5 w-full">
      {statusAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#081c2d]/55 p-4" role="dialog" aria-modal="true" aria-labelledby="institution-status-title">
          <form onSubmit={submitStatusChange} className="w-full max-w-md overflow-hidden rounded-2xl border border-[#D9E0E7] bg-white shadow-2xl">
            <div className={`h-1.5 ${statusAction.isActive ? "bg-[#2F6F4E]" : "bg-[#A23B34]"}`} />
            <div className="p-6">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${statusAction.isActive ? "bg-[#E7F1EB] text-[#2F6F4E]" : "bg-[#FCEBE9] text-[#A23B34]"}`}>
                    {statusAction.isActive ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
                  </div>
                  <div>
                    <h3 id="institution-status-title" className="text-base font-bold text-[#08283F]">
                      {statusAction.isActive ? "Activate institution" : "Deactivate institution"}
                    </h3>
                    <p className="mt-0.5 text-xs text-[#687B8E]">Status change requires an audit reason.</p>
                  </div>
                </div>
                <button type="button" onClick={closeStatusDialog} disabled={statusSaving} className="rounded-lg p-1 text-[#687B8E] hover:bg-[#EDF0F2] hover:text-[#08283F] disabled:opacity-50" aria-label="Close dialog">
                  <X size={18} />
                </button>
              </div>
              <div className="rounded-xl border border-[#E4E0D5] bg-[#F8F7F2] px-4 py-3">
                <p className="text-sm font-semibold text-[#08283F]">{statusAction.inst.name}</p>
                <p className="mt-1 font-mono text-xs text-[#687B8E]">{statusAction.inst.institution_id}</p>
              </div>
              <p className="mt-4 text-sm leading-6 text-[#4A5A68]">
                {statusAction.isActive
                  ? "This restores access for the institution. Its historical and on-chain records remain unchanged."
                  : "This stops the institution from operating in the platform. Its historical and on-chain records remain retained."}
              </p>
              <label className="mt-5 block text-sm font-semibold text-[#08283F]" htmlFor="institution-status-reason">
                Reason <span className="text-[#A23B34]">*</span>
              </label>
              <textarea id="institution-status-reason" autoFocus required rows={4} value={statusReason} onChange={e => setStatusReason(e.target.value)} placeholder="Enter the reason for this status change…" className="cd-input mt-2 w-full resize-none" />
              <p className="mt-1.5 text-xs text-[#687B8E]">This reason will be stored in the audit log.</p>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={closeStatusDialog} disabled={statusSaving} className="cd-btn-secondary disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={statusSaving || !statusReason.trim()} className={`cd-btn-primary disabled:cursor-not-allowed disabled:opacity-50 ${statusAction.isActive ? "bg-[#2F6F4E]" : "bg-[#A23B34]"}`}>
                  {statusSaving ? <Loader2 size={15} className="animate-spin" /> : statusAction.isActive ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                  {statusSaving ? "Saving…" : statusAction.isActive ? "Activate institution" : "Deactivate institution"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
      
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[#08283F] font-bold text-2xl">All Institutions</h2>
          <p className="text-[#4A5A68] text-sm mt-0.5">{insts.length} registered institution{insts.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-[#08283F] text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 self-start"
        >
          <Plus size={15} /> Add Institution
        </button>
      </div>

      {error && <div className="dash-error break-all">{error}</div>}
      {success && <div className="bg-[#E7F1EB] text-[#2F6F4E] text-sm px-4 py-3 rounded-lg break-all">{success}</div>}

      {/* Form Modal */}
      {showForm && (
        <form onSubmit={handleSubmit} className="dash-card p-5 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h3 className="text-[#08283F] font-semibold text-base">
              {editingInst ? "Edit Institution" : "Add Institution"}
            </h3>
            <button type="button" onClick={cancelForm} className="text-[#4A5A68] hover:text-[#08283F] p-1">
              <X size={18} />
            </button>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              required
              placeholder="Institution ID (e.g., CUSL-001)"
              className="cd-input"
              value={form.institution_id}
              onChange={e => setForm({ ...form, institution_id: e.target.value })}
              disabled={!!editingInst}
            />
            <input
              required
              placeholder="Full Name"
              className="cd-input"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
            />
            <input
              placeholder="Short Name (optional)"
              className="cd-input"
              value={form.short_name}
              onChange={e => setForm({ ...form, short_name: e.target.value })}
            />
            <input
              required
              placeholder="Country"
              className="cd-input"
              value={form.country}
              onChange={e => setForm({ ...form, country: e.target.value })}
            />
            <input
              type="email"
              placeholder="Email (optional)"
              className="cd-input"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
            />
            <input
              placeholder="Phone (optional)"
              className="cd-input"
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
            />
            <input
              placeholder="Website (optional)"
              className="cd-input sm:col-span-2"
              value={form.website}
              onChange={e => setForm({ ...form, website: e.target.value })}
            />
            <textarea
              placeholder="Address (optional)"
              className="cd-input sm:col-span-2"
              rows={2}
              value={form.address}
              onChange={e => setForm({ ...form, address: e.target.value })}
            />
            <input
              placeholder="Wallet Address (optional)"
              className="cd-input sm:col-span-2 font-mono text-sm"
              value={form.wallet_address}
              onChange={e => setForm({ ...form, wallet_address: e.target.value })}
            />
          </div>
          
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="cd-btn-primary disabled:opacity-50"
              style={{ background: "#08283F" }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : editingInst ? <Pencil size={14} /> : <Plus size={14} />}
              {saving ? (editingInst ? "Updating…" : "Creating…") : (editingInst ? "Update Institution" : "Create Institution")}
            </button>
            <button type="button" onClick={cancelForm} className="cd-btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* View Details Modal */}
      {viewingInst && (
        <div className="dash-card p-5 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h3 className="text-[#08283F] font-semibold text-base">Institution Details</h3>
            <button onClick={() => setViewingInst(null)} className="text-[#4A5A68] hover:text-[#08283F] p-1">
              <X size={18} />
            </button>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-[#4A5A68] text-xs font-semibold mb-1">Institution ID</p>
              <p className="text-[#08283F] text-sm font-mono">{viewingInst.institution_id}</p>
            </div>
            <div>
              <p className="text-[#4A5A68] text-xs font-semibold mb-1">Name</p>
              <p className="text-[#08283F] text-sm">{viewingInst.name}</p>
            </div>
            {viewingInst.short_name && (
              <div>
                <p className="text-[#4A5A68] text-xs font-semibold mb-1">Short Name</p>
                <p className="text-[#08283F] text-sm">{viewingInst.short_name}</p>
              </div>
            )}
            <div>
              <p className="text-[#4A5A68] text-xs font-semibold mb-1">Country</p>
              <p className="text-[#08283F] text-sm">{viewingInst.country}</p>
            </div>
            {viewingInst.email && (
              <div>
                <p className="text-[#4A5A68] text-xs font-semibold mb-1">Email</p>
                <p className="text-[#08283F] text-sm">{viewingInst.email}</p>
              </div>
            )}
            {viewingInst.phone && (
              <div>
                <p className="text-[#4A5A68] text-xs font-semibold mb-1">Phone</p>
                <p className="text-[#08283F] text-sm">{viewingInst.phone}</p>
              </div>
            )}
            {viewingInst.website && (
              <div className="sm:col-span-2">
                <p className="text-[#4A5A68] text-xs font-semibold mb-1">Website</p>
                <a href={viewingInst.website} target="_blank" rel="noopener noreferrer" 
                   className="text-[#08283F] text-sm hover:underline">
                  {viewingInst.website}
                </a>
              </div>
            )}
            {viewingInst.address && (
              <div className="sm:col-span-2">
                <p className="text-[#4A5A68] text-xs font-semibold mb-1">Address</p>
                <p className="text-[#08283F] text-sm">{viewingInst.address}</p>
              </div>
            )}
            {viewingInst.wallet_address && (
              <div className="sm:col-span-2">
                <p className="text-[#4A5A68] text-xs font-semibold mb-1">Wallet Address</p>
                <p className="text-[#08283F] text-sm font-mono break-all">{viewingInst.wallet_address}</p>
              </div>
            )}
            <div>
              <p className="text-[#4A5A68] text-xs font-semibold mb-1">On-Chain Status</p>
              <div className="flex items-center gap-1">
                {viewingInst.is_chain_active ? (
                  <>
                    <CheckCircle2 size={14} className="text-[#2F6F4E]" />
                    <span className="text-[#2F6F4E] text-sm">Active</span>
                  </>
                ) : (
                  <>
                    <XCircle size={14} className="text-[#8A929C]" />
                    <span className="text-[#8A929C] text-sm">Inactive</span>
                  </>
                )}
              </div>
            </div>
            <div>
              <p className="text-[#4A5A68] text-xs font-semibold mb-1">Active Status</p>
              <div className="flex items-center gap-1">
                {viewingInst.is_active ? (
                  <>
                    <CheckCircle2 size={14} className="text-[#2F6F4E]" />
                    <span className="text-[#2F6F4E] text-sm">Active</span>
                  </>
                ) : (
                  <>
                    <XCircle size={14} className="text-[#A23B34]" />
                    <span className="text-[#A23B34] text-sm">Inactive</span>
                  </>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => startEdit(viewingInst)}
              className="cd-btn-primary"
              style={{ background: "#08283F" }}
            >
              <Pencil size={14} /> Edit
            </button>
            <button onClick={() => setViewingInst(null)} className="cd-btn-secondary">
              Close
            </button>
          </div>
        </div>
      )}

      {/* Institutions Table */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="text-[#08283F] animate-spin" /></div>
      ) : (
        <div className="dash-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr>
                  {["ID", "Name", "Country", "Wallet", "On-Chain", "Active", "Actions"].map(h => (
                    <th key={h} className="dash-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E1D6]">
                {insts.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-10 text-[#4A5A68] text-sm">No institutions found.</td></tr>
                )}
                {insts.map(inst => (
                  <tr key={inst.id} className="hover:bg-[#F8F7F2] transition-colors">
                    <td className="dash-td font-mono text-sm font-semibold text-[#08283F]">{inst.institution_id}</td>
                    <td className="dash-td">
                      <div className="flex items-center gap-2">
                        <Building2 size={14} className="text-[#08283F] shrink-0" />
                        <span className="text-[#08283F] text-sm font-medium">{inst.name}</span>
                      </div>
                    </td>
                    <td className="dash-td text-[#4A5A68] text-sm">{inst.country}</td>
                    <td className="dash-td font-mono text-[#4A5A68] text-xs">
                      {inst.wallet_address ? inst.wallet_address.slice(0, 12) + "…" : "—"}
                    </td>
                    <td className="dash-td">
                      {inst.is_chain_active
                        ? <CheckCircle2 size={16} className="text-[#2F6F4E]" />
                        : <XCircle size={16} className="text-[#8A929C]" />}
                    </td>
                    <td className="dash-td">
                      {inst.is_active
                        ? <CheckCircle2 size={16} className="text-[#2F6F4E]" />
                        : <XCircle size={16} className="text-[#A23B34]" />}
                    </td>
                    <td className="dash-td">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => viewDetails(inst)}
                          className="flex items-center gap-1.5 border border-[#E4E1D6] text-[#08283F] px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#EAF2FB] transition-colors"
                        >
                          <Eye size={13} /> View
                        </button>
                        <button
                          onClick={() => startEdit(inst)}
                          className="flex items-center gap-1.5 bg-[#08283F] text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity"
                        >
                          <Pencil size={13} /> Edit
                        </button>
                        {inst.is_active ? <button
                          onClick={() => openStatusDialog(inst, false)}
                          className="flex items-center gap-1.5 bg-[#A23B34] text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity"
                        >
                          <XCircle size={13} /> Deactivate
                        </button> : <button
                          onClick={() => openStatusDialog(inst, true)}
                          className="flex items-center gap-1.5 bg-[#2F6F4E] text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity"
                        >
                          <CheckCircle2 size={13} /> Activate
                        </button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
