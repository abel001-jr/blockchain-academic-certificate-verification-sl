"use client";
import { subscribeDashboardRefresh } from "@/lib/dashboardRefresh.mjs";
import { useCallback, useEffect, useState } from "react";
import { useAuthorizationStatus } from "@/lib/authorizationStatus";
import Link from "next/link";
import RecordPageHero from "@/components/dashboard/RecordPageHero";
import OfficerDetailPanel from "@/components/dashboard/OfficerDetailPanel";
import FloatingDetailDialog from "@/components/dashboard/FloatingDetailDialog";
import { Loader2, Plus, Wallet, CheckCircle2, Clock, X, Eye, Ban, AlertTriangle, Pencil, KeyRound } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth, isInstitutionSetupAdmin, ROLES } from "@/lib/useAuth";
import { authorizeOfficerOnChain, revokeOfficerOnChain } from "@/lib/walletActions";
import { stashOfficerTempPassword } from "@/lib/officerTempPassword";
import { notifyOfficerAuthorized } from "@/lib/notifications";

function statusLabel(officer) {
  if (!officer.wallet_verified) return { text: "Awaiting wallet verification", tone: "muted" };
  if (officer.must_change_password) return { text: "Awaiting password setup", tone: "warn" };
  return { text: "Setup complete", tone: "ok" };
}

export default function OfficersPage() {
  const { role, user, loading: authLoading } = useAuth();
  const [officers, setOfficers] = useState([]);
  const chain = useAuthorizationStatus(officers);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [success,  setSuccess]  = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [txBusy,   setTxBusy]   = useState(null);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", role: "" });
  const [fieldErrors, setFieldErrors] = useState({});
  const [editingOfficer, setEditingOfficer] = useState(null);
  const [viewOfficerId, setViewOfficerId] = useState(null);

  // The institution's on-chain admin wallet — MetaMask must be on this account
  const [emailDomain, setEmailDomain] = useState("");
  const [instWallet,    setInstWallet]    = useState("");
  const [connectedAcct, setConnectedAcct] = useState("");

  const load = useCallback(async () => {
    try {
      const [vcs, chans, regs] = await Promise.all([
        api.get("/users/?role=vc"),
        api.get("/users/?role=chancellor"),
        api.get("/users/?role=registrar"),
      ]);
      setOfficers([...(vcs.results ?? vcs), ...(chans.results ?? chans), ...(regs.results ?? regs)]);
    } catch { setError("Failed to load officers."); }
    finally  { setLoading(false); }
  }, []);

  // Load institution wallet + current MetaMask account
  const refreshWallet = useCallback(async () => {
    // Read institution wallet from the registrar's profile
    if (user?.institution) {
      try {
        const inst = await api.get(`/institutions/${user.institution}/`);
        setEmailDomain((inst.email_domain || "").trim().toLowerCase());
        setInstWallet((inst.wallet_address || "").toLowerCase());
      } catch { /* non-critical */ }
    }
    // Read current MetaMask account (no pop-up)
    if (typeof window !== "undefined" && window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: "eth_accounts" });
        setConnectedAcct((accounts[0] || "").toLowerCase());
      } catch { /* no wallet */ }
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (isInstitutionSetupAdmin(role)) return subscribeDashboardRefresh(() => Promise.all([load(), refreshWallet()]), { intervalMs: 0 });
    queueMicrotask(() => setLoading(false));
  }, [authLoading, role, load, refreshWallet]);

  function validateField(name, value) {
    const text = value.trim();
    if (name === "first_name" || name === "last_name") {
      if (!text) return name === "first_name" ? "Enter a first name." : "Enter a last name.";
      if (text.length > 150) return "Use 150 characters or fewer.";
      if (!/^[\p{L}\p{M} ]+$/u.test(text) || !/\p{L}/u.test(text)) return "Use letters and spaces only.";
    }
    if (name === "email") {
      if (!emailDomain) return "Ask the institution admin to save the email domain in Settings first.";
      if (!text) return "Enter an email address.";
      if (!text.toLowerCase().endsWith(`@${emailDomain}`)) return `Use the confirmed @${emailDomain} domain.`;
      if (text.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return "Enter a valid email, such as officer@university.edu.";
      if (officers.some(officer => officer.id !== editingOfficer?.id && officer.email.toLowerCase() === text.toLowerCase())) return "An officer already uses this email address.";
    }
    if (name === "role" && !["registrar", "vc", "chancellor"].includes(text)) return "Choose an officer role.";
    return "";
  }

  function updateField(name, value) {
    if (name === "first_name" || name === "last_name") {
      value = value.replace(/[^\p{L}\p{M} ]/gu, "").replace(/ +/g, " ").replace(/(^| )(\p{L})([\p{L}\p{M}]*)/gu, (_, space, first, rest) => space + first.toLocaleUpperCase() + rest.toLocaleLowerCase());
    }
    setForm(previous => ({ ...previous, [name]: value }));
    if (fieldErrors[name]) setFieldErrors(previous => ({ ...previous, [name]: "" }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    const errors = Object.fromEntries(Object.entries(form).map(([name, value]) => [name, validateField(name, value)]).filter(([, message]) => message));
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      document.getElementById(`officer-${Object.keys(errors)[0]}`)?.focus();
      return;
    }
    setSaving(true); setError(""); setSuccess("");
    try {
      if (editingOfficer) {
        // Update existing officer
        const data = await api.patch(`/users/${editingOfficer.id}/`, {
          first_name: form.first_name.trim(),
          last_name:  form.last_name.trim(),
          email:      form.email.trim().toLowerCase(),
          role:       form.role,
        });
        setSuccess(`Officer ${data.first_name} ${data.last_name} updated successfully.`);
        setEditingOfficer(null);
      } else {
        // Check officer limit before creating new officer
        if (["vc", "chancellor"].includes(form.role) && officers.filter(officer => officer.is_active && officer.role !== "registrar").length >= 2) {
          setError("Maximum of 2 active officers allowed per institution. Deactivate an existing officer to add a new one.");
          setSaving(false);
          return;
        }
        
        // Create new officer
        const data = await api.post("/users/", {
          first_name: form.first_name.trim(),
          last_name:  form.last_name.trim(),
          email:      form.email.trim().toLowerCase(),
          role:       form.role,
        });
        if (data?.id && data?.temp_password) {
          stashOfficerTempPassword(data.id, data.temp_password);
          window.location.href = `/dashboard/officers/${data.id}`;
          return;
        }
        setSuccess(data?.detail || "Officer created.");
      }
      setShowForm(false);
      setForm({ first_name: "", last_name: "", email: "", role: "" });
      load();
    } catch (err) {
      const errors = Object.fromEntries(Object.keys(form).filter(name => err?.[name]).map(name => [name, Array.isArray(err[name]) ? err[name].join(" ") : String(err[name])]));
      setFieldErrors(errors);
      if (Object.keys(errors).length) document.getElementById(`officer-${Object.keys(errors)[0]}`)?.focus();
      else setError(err?.detail || "Unable to save the officer. Please try again.");
    }
    finally { setSaving(false); }
  }

  async function regenerateTempPassword(officer) {
    if (!confirm("Generate a new temporary password for " + officer.first_name + "? Their current password will stop working.")) return;
    setTxBusy("invite-" + officer.id); setError(""); setSuccess("");
    try {
      const data = await api.post(`/users/${officer.id}/resend-invite/`, {});
      if (data.temp_password) stashOfficerTempPassword(officer.id, data.temp_password);
      setSuccess(data.temp_password ? "Temporary password generated. Copy it from the officer details." : data.detail || "Temporary credentials emailed to the officer.");
      setViewOfficerId(officer.id);
      load();
    } catch (failure) { setError(failure?.detail || "Could not generate temporary credentials."); }
    finally { setTxBusy(null); }
  }

  async function handleDeactivate(officer) {
    if (!confirm(`Deactivate ${officer.first_name} ${officer.last_name}? Their account and audit records will be retained.`)) return;
    setError(""); setSuccess("");
    try {
      await api.patch(`/users/${officer.id}/`, { is_active: false });
      setSuccess(`Officer ${officer.first_name} ${officer.last_name} deactivated successfully.`);
      load();
    } catch (err) {
      setError(err?.detail || "Failed to deactivate officer.");
    }
  }

  function startEdit(officer) {
    setFieldErrors({});
    setEditingOfficer(officer);
    setForm({
      first_name: officer.first_name,
      last_name: officer.last_name,
      email: officer.email,
      role: officer.role,
    });
    setShowForm(true);
  }

  function cancelEdit() {
    setFieldErrors({});
    setEditingOfficer(null);
    setForm({ first_name: "", last_name: "", email: "", role: "" });
    setShowForm(false);
  }

  async function authorizeOnChain(officer) {
    setTxBusy(`auth-${officer.id}`); setError(""); setSuccess("");
    try {
      if (!officer.wallet_verified || officer.must_change_password)
        throw new Error("Officer must finish setup first.");
      const { hash } = await authorizeOfficerOnChain(officer, instWallet || undefined);
      await api.post(`/users/${officer.id}/authorize-on-chain/`, { tx_hash: hash });
      setSuccess(`Authorized on-chain. Tx: ${hash}`);
      
      // Send notification
      notifyOfficerAuthorized(
        `${officer.first_name || ''} ${officer.last_name || ''}`.trim(),
        officer.role,
      );
      
      load();
    } catch (e) { setError(e?.reason || e?.shortMessage || e?.message || JSON.stringify(e)); }
    finally { setTxBusy(null); await refreshWallet(); }
  }

  async function revokeOnChain(officer) {
    if (!confirm(`Revoke ${officer.first_name} ${officer.last_name} on-chain? Requires MetaMask gas.`)) return;
    setTxBusy(`rev-${officer.id}`); setError(""); setSuccess("");
    try {
      const { hash } = await revokeOfficerOnChain(officer, instWallet || undefined);
      await api.post(`/users/${officer.id}/revoke-on-chain/`, { tx_hash: hash });
      setSuccess(`Revoked on-chain. Tx: ${hash}`);
      load();
    } catch (e) { setError(e?.reason || e?.shortMessage || e?.message || JSON.stringify(e)); }
    finally { setTxBusy(null); await refreshWallet(); }
  }

  if (authLoading || loading) return <div className="flex justify-center py-16"><Loader2 size={26} className="text-[#08283F] animate-spin" /></div>;
  if (!isInstitutionSetupAdmin(role)) return <p className="text-[#A23B34] text-sm">Institution administrator access required.</p>;

  return (
    <div className="flex flex-col gap-5 w-full">
      {viewOfficerId && <FloatingDetailDialog title="Officer details" onClose={() => { setViewOfficerId(null); void load(); }}><OfficerDetailPanel id={viewOfficerId} onClose={() => { setViewOfficerId(null); void load(); }} /></FloatingDetailDialog>}

      <RecordPageHero eyebrow="Institution administration" title="Officers"
        description="Add and manage Registrar, Vice-Chancellor and Chancellor accounts. Each officer verifies their own wallet during setup. Institution administrators manage authorisation and do not sign credentials."
        count={officers.length} countLabel="Officer accounts">
        <button type="button" onClick={() => { cancelEdit(); setShowForm(true); }} disabled={saving || !emailDomain}
          className="flex items-center gap-2 bg-[#B98A28] text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50">
          <Plus size={15} /> Add officer
        </button>
      </RecordPageHero>

      {!emailDomain && <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-950">
        <p className="font-semibold">Configure your institution email domain before adding officers.</p>
        <Link href="/dashboard/settings?tab=Institution%20Email" className="mt-2 inline-block font-semibold underline">Configure email domain</Link>
      </div>}
      {error   && <div className="dash-error break-all">{error}</div>}
      {success && <div className="bg-[#E7F1EB] text-[#2F6F4E] text-sm px-4 py-3 rounded-lg break-all">{success}</div>}

      {/* Officer limit info banner */}
      {["vc", "chancellor"].includes(form.role) && officers.filter(officer => officer.is_active && officer.role !== "registrar").length >= 2 && (
        <div className="bg-[#FFF8E7] border border-[#B98A28]/30 rounded-xl px-4 py-3.5 flex items-start gap-2.5">
          <AlertTriangle size={15} className="text-[#B98A28] shrink-0 mt-0.5" />
          <div>
            <p className="text-[#08283F] text-sm font-semibold">Officer Limit Reached</p>
            <p className="text-[#4A5A68] text-xs mt-0.5">
              Maximum of 2 active officers (VC and Chancellor) per institution. To add a new officer, first deactivate an existing officer.
            </p>
          </div>
        </div>
      )}

      {/* Wallet account check banner */}
      {instWallet && (
        <div className={`rounded-xl border px-4 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 ${
          connectedAcct && connectedAcct === instWallet
            ? "bg-[#E7F1EB] border-[#2F6F4E]/20"
            : "bg-[#FFF8E7] border-[#B98A28]/30"
        }`}>
          <div className="flex items-start gap-2.5 flex-1 min-w-0">
            {connectedAcct && connectedAcct === instWallet
              ? <CheckCircle2 size={15} className="text-[#2F6F4E] shrink-0 mt-0.5" />
              : <AlertTriangle size={15} className="text-[#B98A28] shrink-0 mt-0.5" />
            }
            <div className="min-w-0">
              <p className="text-[#08283F] text-sm font-semibold">
                {connectedAcct && connectedAcct === instWallet
                  ? "MetaMask on correct account — ready to authorize"
                  : "MetaMask account check"
                }
              </p>
              <p className="text-[#4A5A68] text-xs mt-0.5">
                Institution admin wallet (required for Authorize/Revoke):{" "}
                <code className="font-mono text-[#08283F] break-all">{instWallet}</code>
              </p>
              {connectedAcct && connectedAcct !== instWallet && (
                <p className="text-[#B98A28] text-xs mt-1">
                  ⚠ MetaMask is on{" "}
                  <code className="font-mono break-all">{connectedAcct}</code>
                  {" "}— switch to the institution admin account above before authorizing.
                </p>
              )}
              {!connectedAcct && (
                <p className="text-[#8A929C] text-xs mt-1">MetaMask not connected yet — it will prompt when you click Authorize.</p>
              )}
            </div>
          </div>
          <button
            onClick={refreshWallet}
            className="shrink-0 text-[#08283F] text-xs font-semibold border border-[#DDE3EA] px-3 py-1.5 rounded-lg hover:bg-[#EAF2FB] transition-colors"
          >
            Refresh
          </button>
        </div>
      )}

      {/* Invite form */}
      {showForm && (
        <form noValidate onSubmit={handleCreate} className="dash-card p-5 flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h3 className="text-[#08283F] font-semibold text-sm">
              {editingOfficer ? "Edit Officer" : "Add officer"}
            </h3>
            <button type="button" onClick={cancelEdit} className="text-[#4A5A68] hover:text-[#08283F] p-1">
              <X size={16} />
            </button>
          </div>
          {!editingOfficer && (
            <p className="text-[#4A5A68] text-xs">A temporary password is generated once — copy it on the next screen.</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <fieldset className="sm:col-span-2 min-w-0 rounded-xl border border-[#E4E1D6] bg-[#F8F7F2] p-4">
              <legend className="px-2 text-sm font-semibold text-[#08283F]">Officer name <span aria-hidden="true">*</span></legend>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[{ name: "first_name", label: "First name", example: "Mary" }, { name: "last_name", label: "Last name", example: "Kamara" }].map(({ name, label, example }) => (
                  <div key={name} className="min-w-0">
                    <label htmlFor={`officer-${name}`} className="mb-1.5 block text-xs font-medium text-[#4A5A68]">{label}</label>
                    <input id={`officer-${name}`} name={name} type="text" required maxLength={150}
                      className="cd-input w-full" placeholder={example} autoComplete={name === "first_name" ? "given-name" : "family-name"}
                      aria-invalid={Boolean(fieldErrors[name])} aria-describedby={`officer-name-help${fieldErrors[name] ? ` officer-${name}-error` : ""}`}
                      value={form[name]} onChange={event => updateField(name, event.target.value)}
                      onBlur={() => setFieldErrors(previous => ({ ...previous, [name]: validateField(name, form[name]) }))} />
                    {fieldErrors[name] && <p id={`officer-${name}-error`} role="alert" className="mt-1 text-xs text-[#A23B34]">{fieldErrors[name]}</p>}
                  </div>
                ))}
              </div>
              <p id="officer-name-help" className="mt-3 text-xs text-[#4A5A68]">Letters and spaces only. Each word is capitalized automatically.</p>
            </fieldset>
            {[{ name: "email", label: "Email", example: "officer@university.edu" }].map(({ name, label, example }) => (
              <div key={name} className={name === "email" ? "sm:col-span-2" : ""}>
                <label htmlFor={`officer-${name}`} className="mb-1.5 block text-sm font-semibold text-[#08283F]">{label} <span aria-hidden="true">*</span></label>
                <input id={`officer-${name}`} name={name} required type={name === "email" && !emailDomain ? "email" : "text"}
                  maxLength={name === "email" ? 254 : 150} placeholder={example} className="cd-input w-full"
                  autoComplete={name === "email" ? "email" : name === "first_name" ? "given-name" : "family-name"}
                  aria-invalid={Boolean(fieldErrors[name])} aria-describedby={fieldErrors[name] ? `officer-${name}-error` : undefined}
                  value={name === "email" && emailDomain && form.email.endsWith(`@${emailDomain}`) ? form.email.slice(0, -(emailDomain.length + 1)) : form[name]}
                  onChange={event => { const value = event.target.value; if (name === "email" && emailDomain) { if (!/^[a-zA-Z0-9._+\-]*$/.test(value)) return; updateField(name, value ? `${value}@${emailDomain}` : ""); } else updateField(name, value); }}
                  onBlur={() => setFieldErrors(previous => ({ ...previous, [name]: validateField(name, form[name]) }))} />
                {name === "email" && <p className="mt-1 text-xs font-semibold text-[#08283F]">{emailDomain ? `@${emailDomain} - confirmed institution domain. Enter the email username only.` : "Institution admin must save an email domain in Settings before adding officers."}</p>}
                {fieldErrors[name] && <p id={`officer-${name}-error`} role="alert" className="mt-1 text-xs text-[#A23B34]">{fieldErrors[name]}</p>}
              </div>
            ))}
            <div className="sm:col-span-2">
              <label htmlFor="officer-role" className="mb-1.5 block text-sm font-semibold text-[#08283F]">Role <span aria-hidden="true">*</span></label>
              <select id="officer-role" required className="cd-input w-full" value={form.role}
                aria-invalid={Boolean(fieldErrors.role)} aria-describedby={fieldErrors.role ? "officer-role-error" : undefined}
                onChange={event => updateField("role", event.target.value)}>
                <option value="" disabled>Select an officer role</option>
                {(role === ROLES.INSTITUTIONAL_ADMIN || role === ROLES.SUPER_ADMIN) && <option value="registrar">Registrar</option>}
                <option value="vc">Vice Chancellor</option>
                <option value="chancellor">Chancellor</option>
              </select>
              {fieldErrors.role && <p id="officer-role-error" role="alert" className="mt-1 text-xs text-[#A23B34]">{fieldErrors.role}</p>}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving || (!editingOfficer && !emailDomain)} className="cd-btn-primary disabled:opacity-50"
              style={{ background: "#B98A28" }}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : editingOfficer ? <Pencil size={14} /> : <Plus size={14} />}
              {saving ? (editingOfficer ? "Updating…" : "Creating…") : (editingOfficer ? "Update Officer" : "Add officer")}
            </button>
            <button type="button" onClick={cancelEdit} className="cd-btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {/* Officer list */}
      <div className="bg-white rounded-xl border border-[#E4E1D6] overflow-hidden w-full">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#E4E1D6]">
          <h3 className="text-[#08283F] font-semibold text-sm">Officer accounts</h3>
          <span className="text-[#4A5A68] text-xs">{officers.length} officer{officers.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr>
                {["Officer", "Role", "Email", "Status", "Actions"].map(h => (
                  <th key={h} className="dash-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E1D6]">
              {officers.length === 0 && (
                <tr><td colSpan={5} className="text-center py-10 text-[#4A5A68] text-sm">No officer accounts yet.</td></tr>
              )}
              {officers.map(o => {
                const st = statusLabel(o);
                const canAuthorize = o.wallet_verified && !o.must_change_password && chain.statuses[o.id] === false && o.wallet_address;
                return (
                  <tr key={o.id} className="hover:bg-[#F8F7F2] transition-colors">
                    <td className="dash-td">
                      <p className="text-[#08283F] text-sm font-semibold whitespace-nowrap">{o.first_name} {o.last_name}</p>
                    </td>
                    <td className="dash-td">
                      <span className="text-xs font-semibold text-[#B98A28] bg-[#B98A28]/10 px-2 py-0.5 rounded-full">
                        {o.role === "registrar" ? "Registrar" : o.role === "vc" ? "VC" : "Chancellor"}
                      </span>
                    </td>
                    <td className="dash-td text-[#4A5A68] text-sm">{o.email}</td>
                    <td className="dash-td">
                      <p className={`text-xs font-medium flex items-center gap-1 ${
                        st.tone === "ok"   ? "text-[#2F6F4E]" :
                        st.tone === "warn" ? "text-[#B98A28]" : "text-[#8A929C]"
                      }`}>
                        {st.tone === "ok" ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                        {st.text}
                      </p>
                      <p className="mt-1 text-xs text-[#B98A28]">{chain.loading ? "Checking chain authorization..." : chain.statuses[o.id] === true ? "Authorized on current chain" : chain.statuses[o.id] === false ? "Needs institution admin authorization" : "Chain authorization unverified"}</p>
                    </td>
                    <td className="dash-td">
                      <div className="flex items-center gap-2 justify-end">
                        <button type="button" onClick={() => setViewOfficerId(o.id)}
                          className="flex items-center gap-1.5 border border-[#E4E1D6] text-[#08283F] px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#EAF2FB] transition-colors">
                          <Eye size={13} /> View
                        </button>
                        <button
                          onClick={() => startEdit(o)}
                          className="flex items-center gap-1.5 border border-[#E4E1D6] text-[#08283F] px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#EAF2FB] transition-colors"
                        >
                          <Pencil size={13} /> Edit
                        </button>
                        {!o.on_chain_authorized && <button type="button" onClick={() => regenerateTempPassword(o)} disabled={!!txBusy} className="cd-btn-secondary whitespace-nowrap">
                          {txBusy === "invite-" + o.id ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />} New temp password
                        </button>}
                        {chain.statuses[o.id] === true ? (
                          <button onClick={() => revokeOnChain(o)} disabled={!!txBusy}
                            className="flex items-center gap-1.5 bg-[#A23B34] text-white px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50">
                            {txBusy === `rev-${o.id}` ? <Loader2 size={13} className="animate-spin" /> : <Ban size={13} />}
                            Revoke
                          </button>
                        ) : (
                          <button onClick={() => authorizeOnChain(o)} disabled={!!txBusy || !canAuthorize} title={!canAuthorize ? "The officer must verify wallet ownership and finish password setup before the institution admin can authorize them." : "Authorize this officer using the institution admin wallet"}
                            className="flex items-center gap-1.5 bg-[#08283F] text-white px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50">
                            {txBusy === `auth-${o.id}` ? <Loader2 size={13} className="animate-spin" /> : <Wallet size={13} />}
                            Authorize
                          </button>
                        )}
                        {o.is_active && <button
                          onClick={() => handleDeactivate(o)}
                          className="flex items-center gap-1.5 bg-[#A23B34] text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity"
                        >
                          <Ban size={13} /> Deactivate
                        </button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
