"use client";
/**
 * Registrar manages VC and Chancellor officers:
 *  1. Create account (name, email, role) — wallet blank; temp password emailed
 *  2. Officer completes setup gate (wallet + permanent password)
 *  3. Registrar authorizes on-chain via MetaMask
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Wallet, CheckCircle2, Clock, X, Eye, Ban } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth, isInstitutionHead } from "@/lib/useAuth";
import { authorizeOfficerOnChain, revokeOfficerOnChain } from "@/lib/walletActions";
import { stashOfficerTempPassword } from "@/lib/officerTempPassword";

function statusLabel(officer) {
  if (officer.on_chain_authorized) return { text: "Authorized on-chain", tone: "ok" };
  if (officer.wallet_verified && !officer.must_change_password) {
    return { text: "Wallet Verified — Pending On-Chain Authorization", tone: "warn" };
  }
  if (officer.wallet_verified && officer.must_change_password) {
    return { text: "Wallet verified — awaiting password setup", tone: "warn" };
  }
  return { text: "Awaiting officer setup", tone: "muted" };
}

export default function OfficersPage() {
  const { role, loading: authLoading } = useAuth();
  const [officers, setOfficers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [txBusy, setTxBusy] = useState(null);
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", role: "vc",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [vcs, chans] = await Promise.all([
        api.get("/users/?role=vc"),
        api.get("/users/?role=chancellor"),
      ]);
      setOfficers([...(vcs.results ?? vcs), ...(chans.results ?? chans)]);
    } catch {
      setError("Failed to load officers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (isInstitutionHead(role)) load();
    else setLoading(false);
  }, [authLoading, role, load]);

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const data = await api.post("/users/", {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim().toLowerCase(),
        role: form.role,
      });
      setShowForm(false);
      setForm({ first_name: "", last_name: "", email: "", role: "vc" });

      if (data?.id && data?.temp_password) {
        stashOfficerTempPassword(data.id, data.temp_password);
        window.location.href = `/dashboard/officers/${data.id}`;
        return;
      }

      setSuccess(data?.detail || "Officer created.");
      load();
    } catch (err) {
      setError(err?.detail || JSON.stringify(err));
    } finally {
      setSaving(false);
    }
  }

  async function authorizeOnChain(officer) {
    setTxBusy(`auth-${officer.id}`);
    setError("");
    setSuccess("");
    try {
      if (!officer.wallet_verified || officer.must_change_password) {
        throw new Error("Officer must finish setup (wallet signature + password) first.");
      }
      const { hash } = await authorizeOfficerOnChain(officer);
      await api.post(`/users/${officer.id}/authorize-on-chain/`, { tx_hash: hash });
      setSuccess(`Authorized ${officer.role} on-chain (gas tx). Tx: ${hash}`);
      load();
    } catch (e) {
      setError(e?.reason || e?.shortMessage || e?.message || JSON.stringify(e));
    } finally {
      setTxBusy(null);
    }
  }

  async function revokeOnChain(officer) {
    if (!confirm(`Revoke ${officer.first_name} ${officer.last_name} on-chain? This requires a MetaMask gas transaction.`)) {
      return;
    }
    setTxBusy(`rev-${officer.id}`);
    setError("");
    setSuccess("");
    try {
      const { hash } = await revokeOfficerOnChain(officer);
      await api.post(`/users/${officer.id}/revoke-on-chain/`, { tx_hash: hash });
      setSuccess(`Revoked ${officer.role} on-chain. Tx: ${hash}`);
      load();
    } catch (e) {
      setError(e?.reason || e?.shortMessage || e?.message || JSON.stringify(e));
    } finally {
      setTxBusy(null);
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

  return (
    <div className="flex flex-col gap-6 max-w-[960px]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[#43474e] text-sm max-w-xl">
            Invite is off-chain (no email in this mode). After create you get a one-time
            temporary password to copy or share. Authorize / revoke on-chain needs MetaMask gas.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-[#022448] text-white px-5 py-2.5 rounded-[12px] text-sm font-semibold"
        >
          <Plus size={16} /> Add Officer
        </button>
      </div>

      {error && <div className="bg-[#ffdad6] text-[#93000a] text-sm px-4 py-3 rounded-lg break-all">{error}</div>}
      {success && <div className="bg-[#E8F5E9] text-[#2E7D32] text-sm px-4 py-3 rounded-lg break-all">{success}</div>}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-[14px] border border-[#c4c6cf]/15 p-6 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h3 className="text-[#022448] font-semibold text-sm">Invite Officer</h3>
            <button type="button" onClick={() => setShowForm(false)}><X size={18} className="text-[#43474e]" /></button>
          </div>
          <p className="text-[#74777f] text-xs">
            Wallet stays blank. A temporary password is generated once — copy it on the next screen.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input required placeholder="First name" className="bg-[#eef4ff] rounded-[10px] px-4 py-3 text-sm outline-none"
              value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} />
            <input required placeholder="Last name" className="bg-[#eef4ff] rounded-[10px] px-4 py-3 text-sm outline-none"
              value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} />
            <input required type="email" placeholder="Email" className="bg-[#eef4ff] rounded-[10px] px-4 py-3 text-sm outline-none sm:col-span-2"
              value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            <select className="bg-[#eef4ff] rounded-[10px] px-4 py-3 text-sm outline-none sm:col-span-2"
              value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              <option value="vc">Vice Chancellor</option>
              <option value="chancellor">Chancellor</option>
            </select>
          </div>
          <button disabled={saving} type="submit"
            className="self-start flex items-center gap-2 bg-[#7b5900] text-white px-5 py-2.5 rounded-[12px] text-sm font-semibold disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Create officer
          </button>
        </form>
      )}

      <div className="bg-white rounded-[14px] border border-[#c4c6cf]/10 overflow-hidden">
        <div className="divide-y divide-[#c4c6cf]/10">
          {officers.length === 0 && (
            <p className="px-6 py-12 text-center text-[#43474e] text-sm">No VC or Chancellor accounts yet.</p>
          )}
          {officers.map(o => {
            const st = statusLabel(o);
            const canAuthorize =
              o.wallet_verified && !o.must_change_password && !o.on_chain_authorized && o.wallet_address;
            return (
              <div key={o.id} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[#022448] text-sm font-semibold">
                    {o.first_name} {o.last_name}
                    <span className="ml-2 text-[11px] uppercase tracking-wide text-[#7b5900] font-bold">
                      {o.role === "vc" ? "VC" : "Chancellor"}
                    </span>
                  </p>
                  <p className="text-[#43474e] text-xs">{o.email}</p>
                  <p className="text-[#74777f] text-[11px] font-mono break-all mt-0.5">
                    {o.wallet_address || "No wallet yet"}
                  </p>
                  <p className={`text-[11px] font-semibold mt-1.5 flex items-center gap-1 ${
                    st.tone === "ok" ? "text-[#2E7D32]" :
                    st.tone === "warn" ? "text-[#7b5900]" : "text-[#74777f]"
                  }`}>
                    {st.tone === "ok" ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                    {st.text}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/dashboard/officers/${o.id}`}
                    className="flex items-center gap-1.5 border border-[#c4c6cf]/40 text-[#022448] px-3 py-2 rounded-[10px] text-xs font-semibold hover:bg-[#eef4ff]"
                  >
                    <Eye size={14} /> {!o.wallet_verified ? "View / Edit" : "View"}
                  </Link>
                  {o.on_chain_authorized ? (
                    <button
                      onClick={() => revokeOnChain(o)}
                      disabled={!!txBusy}
                      className="flex items-center gap-2 bg-[#93000a] text-white px-4 py-2 rounded-[10px] text-xs font-semibold disabled:opacity-50"
                    >
                      {txBusy === `rev-${o.id}` ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
                      Revoke On-Chain
                    </button>
                  ) : (
                    <button
                      onClick={() => authorizeOnChain(o)}
                      disabled={!!txBusy || !canAuthorize}
                      className="flex items-center gap-2 bg-[#022448] text-white px-4 py-2 rounded-[10px] text-xs font-semibold disabled:opacity-50"
                    >
                      {txBusy === `auth-${o.id}` ? <Loader2 size={14} className="animate-spin" /> : <Wallet size={14} />}
                      Authorize On-Chain
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
