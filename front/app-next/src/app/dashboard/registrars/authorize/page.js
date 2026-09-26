"use client";
/**
 * Authorize Registrar On-Chain
 * Institutional Admin: calls authorizeRegistrar(walletAddr) on the
 * IssuerRegistry contract, then records the tx_hash in Django.
 */

import { useState, useEffect } from "react";
import { Loader2, ShieldCheck, Wallet, CheckCircle2, XCircle } from "lucide-react";
import { api }     from "@/lib/api";
import { useAuth, ROLES } from "@/lib/useAuth";

const REGISTRY_ABI = [
  {
    inputs: [{ name: "registrarAddr", type: "address" }],
    name:   "authorizeRegistrar",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "registrarAddr", type: "address" }],
    name:   "revokeRegistrar",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

export default function AuthorizeRegistrarPage() {
  const { role } = useAuth();
  const canManage = [ROLES.SUPER_ADMIN, ROLES.INSTITUTIONAL_ADMIN].includes(role);

  const [registrars, setRegistrars] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [busy,       setBusy]       = useState(null);
  const [error,      setError]      = useState("");

  useEffect(() => {
    api.get("/users/?role=registrar")
      .then(data => setRegistrars(data.results ?? data))
      .catch(() => setError("Failed to load registrars."))
      .finally(() => setLoading(false));
  }, []);

  async function callChain(fnName, walletAddress) {
    if (!window.ethereum) throw new Error("MetaMask not found.");
    const { ethers } = await import("ethers");
    const providers = Array.isArray(window.ethereum.providers)
      ? window.ethereum.providers
      : [window.ethereum];
    const ethereum = providers.find(provider => provider?.isMetaMask);
    if (!ethereum) throw new Error("MetaMask provider not detected. Enable the MetaMask extension and reload.");
    const accounts = await ethereum.request({ method: "eth_requestAccounts" });
    if (!accounts?.[0]) throw new Error("No MetaMask account selected.");
    const provider   = new ethers.BrowserProvider(ethereum);
    const signer     = await provider.getSigner(accounts[0]);

    const addr = process.env.NEXT_PUBLIC_ISSUER_REGISTRY_ADDRESS;
    if (!addr) throw new Error("NEXT_PUBLIC_ISSUER_REGISTRY_ADDRESS not set.");

    const contract = new ethers.Contract(addr, REGISTRY_ABI, signer);
    const tx       = await contract[fnName](walletAddress);
    await tx.wait(1);
    return tx.hash;
  }

  async function handleAuthorize(reg) {
    if (!reg.wallet_address) {
      setError(`${reg.first_name} has not bound a wallet yet.`);
      return;
    }
    setBusy(reg.id);
    setError("");
    try {
      const txHash = await callChain("authorizeRegistrar", reg.wallet_address);
      await api.post("/institutions/registrars/authorize/", {
        registrar_id: reg.id,
        tx_hash:      txHash,
      });
      setRegistrars(prev =>
        prev.map(r => r.id === reg.id ? { ...r, is_active: true } : r)
      );
    } catch (e) {
      setError(e?.reason ?? e?.message ?? "Transaction failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleRevoke(reg) {
    if (!confirm(`Revoke on-chain authorization for ${reg.first_name} ${reg.last_name}?`)) return;
    setBusy(reg.id);
    setError("");
    try {
      const txHash = await callChain("revokeRegistrar", reg.wallet_address);
      await api.post(`/institutions/registrars/${reg.id}/revoke/`, { tx_hash: txHash });
      setRegistrars(prev =>
        prev.map(r => r.id === reg.id ? { ...r, is_active: false } : r)
      );
    } catch (e) {
      setError(e?.reason ?? e?.message ?? "Revocation failed.");
    } finally {
      setBusy(null);
    }
  }

  if (!canManage) {
    return <p className="text-[#C62828] text-sm">Access restricted to Institutional Admins.</p>;
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      <div>
        <h2 className="text-[#022448] font-bold text-2xl">Registrar On-Chain Authorization</h2>
        <p className="text-[#43474e] text-sm mt-0.5">
          Authorize or revoke registrar wallets on the IssuerRegistry contract.
        </p>
      </div>

      {error && <div className="bg-[#ffdad6] text-[#93000a] text-sm px-4 py-3 rounded-lg">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={26} className="text-[#022448] animate-spin" />
        </div>
      ) : registrars.length === 0 ? (
        <div className="bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 p-10 text-center">
          <p className="text-[#43474e] text-sm">No registrars found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 overflow-hidden">
          <div className="px-6 py-4 border-b border-[#c4c6cf]/15">
            <h3 className="text-[#022448] font-semibold text-sm">Registrar Wallets</h3>
          </div>
          <div className="divide-y divide-[#c4c6cf]/10">
            {registrars.map(reg => (
              <div key={reg.id} className="flex items-center justify-between px-6 py-4 hover:bg-[#FAF7F2] transition-colors flex-wrap gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#022448] flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {(reg.first_name?.[0] ?? "") + (reg.last_name?.[0] ?? "")}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[#022448] text-sm font-semibold">{reg.first_name} {reg.last_name}</p>
                    <p className="text-[#43474e] text-xs">{reg.email}</p>
                    {reg.wallet_address ? (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Wallet size={11} className="text-[#7b5900]" />
                        <code className="font-mono text-[#43474e] text-xs">{reg.wallet_address.slice(0, 14)}…</code>
                      </div>
                    ) : (
                      <p className="text-[#ED8A19] text-xs mt-0.5">No wallet bound</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className={`px-2.5 py-1 rounded text-[11px] font-semibold uppercase ${
                    reg.is_active ? "bg-[#2E7D32]/10 text-[#2E7D32]" : "bg-[#74777f]/10 text-[#43474e]"
                  }`}>
                    {reg.is_active ? "Authorized" : "Pending"}
                  </span>

                  {!reg.is_active && reg.wallet_address && (
                    <button
                      onClick={() => handleAuthorize(reg)}
                      disabled={!!busy}
                      className="flex items-center gap-1.5 bg-[#022448] text-white px-4 py-2 rounded-[10px] text-xs font-semibold hover:opacity-90 transition-all disabled:opacity-50"
                    >
                      {busy === reg.id ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                      Authorize
                    </button>
                  )}

                  {reg.is_active && (
                    <button
                      onClick={() => handleRevoke(reg)}
                      disabled={!!busy}
                      className="flex items-center gap-1.5 border border-[#C62828] text-[#C62828] px-4 py-2 rounded-[10px] text-xs font-semibold hover:bg-[#C62828]/5 transition-all disabled:opacity-50"
                    >
                      {busy === reg.id ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
