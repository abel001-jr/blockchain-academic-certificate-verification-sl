"use client";
/**
 * Officer detail — view / edit (while setup incomplete), authorize on-chain.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Loader2, ArrowLeft, Wallet, CheckCircle2, Clock, Copy, Check,
  Pencil, KeyRound, Save, X, Ban, MessageCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth, isInstitutionHead } from "@/lib/useAuth";
import { authorizeOfficerOnChain, revokeOfficerOnChain } from "@/lib/walletActions";
import {
  readOfficerTempPassword,
  stashOfficerTempPassword,
  clearOfficerTempPassword,
  officerInviteShareText,
} from "@/lib/officerTempPassword";

function statusMeta(officer) {
  if (!officer) return { text: "—", tone: "muted" };
  if (officer.on_chain_authorized) {
    return { text: "Authorized on-chain — full access", tone: "ok" };
  }
  if (officer.wallet_verified && !officer.must_change_password) {
    return { text: "Wallet Verified — Pending On-Chain Authorization", tone: "warn" };
  }
  if (officer.wallet_verified && officer.must_change_password) {
    return { text: "Wallet verified — awaiting password setup", tone: "warn" };
  }
  return { text: "Awaiting officer setup", tone: "muted" };
}

const inp = "w-full bg-[#eef4ff] rounded-[10px] px-4 py-3 text-sm outline-none";

export default function OfficerDetailPage() {
  const { id } = useParams();
  const { role, loading: authLoading } = useAuth();
  const [officer, setOfficer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [txBusy, setTxBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedPw, setCopiedPw] = useState(false);
  const [tempPassword, setTempPassword] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", role: "vc",
  });

  const canEdit = officer && !officer.wallet_verified && !officer.on_chain_authorized;
  const canResend =
    officer &&
    !officer.on_chain_authorized &&
    (!officer.wallet_verified || officer.must_change_password);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const data = await api.get(`/users/${id}/`);
      if (data.role !== "vc" && data.role !== "chancellor") {
        setError("This user is not a VC or Chancellor officer.");
        setOfficer(null);
      } else {
        setOfficer(data);
        setForm({
          first_name: data.first_name || "",
          last_name: data.last_name || "",
          email: data.email || "",
          role: data.role || "vc",
        });
        const stashed = readOfficerTempPassword(data.id);
        if (stashed) setTempPassword(stashed);
      }
    } catch (e) {
      setError(e?.detail || "Failed to load officer.");
      setOfficer(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (authLoading) return;
    if (isInstitutionHead(role)) load();
    else setLoading(false);
  }, [authLoading, role, load]);

  async function copyWallet() {
    if (!officer?.wallet_address) return;
    try {
      await navigator.clipboard.writeText(officer.wallet_address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }

  async function copyTempPassword() {
    if (!tempPassword) return;
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopiedPw(true);
      setTimeout(() => setCopiedPw(false), 1500);
    } catch { /* ignore */ }
  }

  function shareWhatsApp() {
    if (!officer || !tempPassword) return;
    const text = officerInviteShareText({
      officer,
      tempPassword,
      loginUrl: `${window.location.origin}/login`,
    });
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  function dismissTempPassword() {
    if (officer?.id) clearOfficerTempPassword(officer.id);
    setTempPassword(null);
  }

  async function saveEdits(e) {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const data = await api.patch(`/users/${id}/`, {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim().toLowerCase(),
        role: form.role,
        reset_temp_password: form.email.trim().toLowerCase() !== (officer.email || "").toLowerCase(),
      });
      setOfficer(data);
      setEditing(false);
      if (data.temp_password) {
        stashOfficerTempPassword(data.id || id, data.temp_password);
        setTempPassword(data.temp_password);
        setSuccess("Officer updated. New temporary password is shown below.");
      } else {
        setSuccess(data.detail || "Officer updated.");
      }
      load();
    } catch (err) {
      const msg = err?.detail || (typeof err === "object" ? JSON.stringify(err) : String(err));
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function resendInvite() {
    if (!canResend) return;
    setResending(true);
    setError("");
    setSuccess("");
    try {
      const data = await api.post(`/users/${id}/resend-invite/`, {});
      if (data.temp_password) {
        stashOfficerTempPassword(id, data.temp_password);
        setTempPassword(data.temp_password);
        setSuccess("New temporary password generated — copy or share below.");
      } else {
        setSuccess(data.detail || "Invite regenerated.");
      }
      if (data.officer) setOfficer(data.officer);
    } catch (err) {
      setError(err?.detail || JSON.stringify(err));
    } finally {
      setResending(false);
    }
  }

  async function authorizeOnChain() {
    if (!officer) return;
    setTxBusy(true);
    setError("");
    setSuccess("");
    try {
      if (!officer.wallet_verified || officer.must_change_password) {
        throw new Error("Officer must finish setup (wallet signature + password) first.");
      }
      const { hash } = await authorizeOfficerOnChain(officer);
      await api.post(`/users/${officer.id}/authorize-on-chain/`, { tx_hash: hash });
      setSuccess(`Authorized on-chain (gas). Tx: ${hash}`);
      load();
    } catch (e) {
      setError(e?.reason || e?.shortMessage || e?.message || JSON.stringify(e));
    } finally {
      setTxBusy(false);
    }
  }

  async function revokeOnChain() {
    if (!officer) return;
    if (!confirm("Revoke this officer on-chain? MetaMask will ask for a gas transaction.")) return;
    setTxBusy(true);
    setError("");
    setSuccess("");
    try {
      const { hash } = await revokeOfficerOnChain(officer);
      await api.post(`/users/${officer.id}/revoke-on-chain/`, { tx_hash: hash });
      setSuccess(`Revoked on-chain. Tx: ${hash}`);
      load();
    } catch (e) {
      setError(e?.reason || e?.shortMessage || e?.message || JSON.stringify(e));
    } finally {
      setTxBusy(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={28} className="text-[#022448] animate-spin" />
      </div>
    );
  }

  if (!isInstitutionHead(role)) {
    return <p className="text-[#C62828] text-sm">Registrar access only.</p>;
  }

  const st = statusMeta(officer);
  const canAuthorize =
    officer &&
    officer.wallet_verified &&
    !officer.must_change_password &&
    !officer.on_chain_authorized &&
    officer.wallet_address;

  return (
    <div className="flex flex-col gap-6 max-w-[720px]">
      <Link
        href="/dashboard/officers"
        className="inline-flex items-center gap-2 text-[#43474e] text-sm hover:text-[#022448] w-fit"
      >
        <ArrowLeft size={16} /> Back to officers
      </Link>

      {error && (
        <div className="bg-[#ffdad6] text-[#93000a] text-sm px-4 py-3 rounded-lg break-all">{error}</div>
      )}
      {success && (
        <div className="bg-[#E8F5E9] text-[#2E7D32] text-sm px-4 py-3 rounded-lg break-all">{success}</div>
      )}

      {!officer ? (
        <p className="text-[#43474e] text-sm">Officer not found.</p>
      ) : (
        <div className="bg-white rounded-[14px] border border-[#c4c6cf]/15 p-6 md:p-8 flex flex-col gap-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-[#7b5900] font-bold mb-1">
                {officer.role === "vc" ? "Vice Chancellor" : "Chancellor"}
              </p>
              <h2 className="text-[#022448] font-bold text-2xl">
                {officer.first_name} {officer.last_name}
              </h2>
              <p className="text-[#43474e] text-sm mt-1">{officer.email}</p>
            </div>
            <div className="flex items-center gap-2">
              {canEdit && !editing && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 border border-[#c4c6cf]/40 text-[#022448] px-3 py-2 rounded-[10px] text-xs font-semibold hover:bg-[#eef4ff]"
                >
                  <Pencil size={14} /> Edit
                </button>
              )}
              {canResend && (
                <button
                  type="button"
                  onClick={resendInvite}
                  disabled={resending}
                  className="flex items-center gap-1.5 bg-[#7b5900] text-white px-3 py-2 rounded-[10px] text-xs font-semibold disabled:opacity-50"
                >
                  {resending ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                  New temp password
                </button>
              )}
            </div>
          </div>

          {tempPassword && (
            <div className="rounded-[12px] border border-[#7b5900]/30 bg-[#FFF8E7] p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[#7b5900] text-xs font-bold uppercase tracking-wide">
                    Temporary Password
                  </p>
                  <p className="text-[#74777f] text-[11px] mt-0.5">
                    Shown once after create / regenerate. Copy and share with the officer — not stored in the database.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={dismissTempPassword}
                  className="text-[#74777f] hover:text-[#022448] p-1"
                  title="Dismiss"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <code className="flex-1 bg-white border border-[#c4c6cf]/30 rounded-[10px] px-4 py-3 text-sm font-mono text-[#022448] break-all">
                  {tempPassword}
                </code>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={copyTempPassword}
                    className="flex items-center gap-1.5 bg-[#022448] text-white px-3 py-2.5 rounded-[10px] text-xs font-semibold"
                  >
                    {copiedPw ? <Check size={14} /> : <Copy size={14} />}
                    {copiedPw ? "Copied" : "Copy"}
                  </button>
                  <button
                    type="button"
                    onClick={shareWhatsApp}
                    className="flex items-center gap-1.5 bg-[#25D366] text-white px-3 py-2.5 rounded-[10px] text-xs font-semibold"
                  >
                    <MessageCircle size={14} />
                    WhatsApp
                  </button>
                </div>
              </div>
            </div>
          )}

          {editing && canEdit && (
            <form onSubmit={saveEdits} className="flex flex-col gap-3 border border-[#c4c6cf]/20 rounded-[12px] p-4 bg-[#FAF7F2]/50">
              <p className="text-[#74777f] text-xs">
                Editable until the officer verifies a wallet in MetaMask. Changing email regenerates a temporary password.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input required className={inp} placeholder="First name"
                  value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} />
                <input required className={inp} placeholder="Last name"
                  value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} />
                <input required type="email" className={inp + " sm:col-span-2"} placeholder="Email"
                  value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                <select className={inp + " sm:col-span-2"} value={form.role}
                  onChange={e => setForm({ ...form, role: e.target.value })}>
                  <option value="vc">Vice Chancellor</option>
                  <option value="chancellor">Chancellor</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={saving}
                  className="flex items-center gap-2 bg-[#022448] text-white px-4 py-2 rounded-[10px] text-xs font-semibold disabled:opacity-50">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save
                </button>
                <button type="button" onClick={() => { setEditing(false); setForm({
                  first_name: officer.first_name || "",
                  last_name: officer.last_name || "",
                  email: officer.email || "",
                  role: officer.role || "vc",
                }); }}
                  className="flex items-center gap-1 px-3 py-2 text-xs text-[#43474e]">
                  <X size={14} /> Cancel
                </button>
              </div>
            </form>
          )}

          <div className={`flex items-center gap-2 text-sm font-semibold ${
            st.tone === "ok" ? "text-[#2E7D32]" :
            st.tone === "warn" ? "text-[#7b5900]" : "text-[#74777f]"
          }`}>
            {st.tone === "ok" ? <CheckCircle2 size={16} /> : <Clock size={16} />}
            {st.text}
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-[#74777f] text-xs uppercase tracking-wide mb-1">Wallet</dt>
              <dd className="text-[#022448] font-mono text-xs break-all flex items-start gap-2">
                <span>{officer.wallet_address || "Not linked yet"}</span>
                {officer.wallet_address && (
                  <button type="button" onClick={copyWallet} className="shrink-0 text-[#74777f] hover:text-[#022448]" title="Copy">
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[#74777f] text-xs uppercase tracking-wide mb-1">Wallet verified</dt>
              <dd className="text-[#022448]">{officer.wallet_verified ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt className="text-[#74777f] text-xs uppercase tracking-wide mb-1">Password setup</dt>
              <dd className="text-[#022448]">
                {officer.must_change_password ? "Still on temporary password" : "Permanent password set"}
              </dd>
            </div>
            <div>
              <dt className="text-[#74777f] text-xs uppercase tracking-wide mb-1">On-chain authorized</dt>
              <dd className="text-[#022448]">{officer.on_chain_authorized ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt className="text-[#74777f] text-xs uppercase tracking-wide mb-1">Account active</dt>
              <dd className="text-[#022448]">{officer.is_active ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt className="text-[#74777f] text-xs uppercase tracking-wide mb-1">Joined</dt>
              <dd className="text-[#022448]">
                {officer.date_joined ? new Date(officer.date_joined).toLocaleString() : "—"}
              </dd>
            </div>
          </dl>

          <div className="pt-2 border-t border-[#c4c6cf]/15">
            {officer.on_chain_authorized ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <p className="text-[#2E7D32] text-sm font-semibold flex items-center gap-2">
                  <CheckCircle2 size={16} /> Authorized — officer signs in with MetaMask (free signature)
                </p>
                <button
                  type="button"
                  onClick={revokeOnChain}
                  disabled={txBusy}
                  className="flex items-center gap-2 bg-[#93000a] text-white px-5 py-2.5 rounded-[12px] text-sm font-semibold disabled:opacity-50"
                >
                  {txBusy ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
                  Revoke On-Chain
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={authorizeOnChain}
                disabled={txBusy || !canAuthorize}
                className="flex items-center gap-2 bg-[#022448] text-white px-5 py-2.5 rounded-[12px] text-sm font-semibold disabled:opacity-50"
              >
                {txBusy ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
                Authorize On-Chain
              </button>
            )}
            {!canAuthorize && !officer.on_chain_authorized && (
              <p className="text-[#74777f] text-xs mt-2">
                Authorization unlocks after the officer verifies a wallet (signature) and sets a permanent password (off-chain).
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
