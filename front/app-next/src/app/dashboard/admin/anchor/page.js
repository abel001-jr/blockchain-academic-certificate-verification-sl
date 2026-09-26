"use client";
/**
 * Anchor Institution On-Chain
 * Must be signed by IssuerRegistry.owner (Hardhat Account 0 locally).
 */

import { useState, useEffect, useCallback } from "react";
import { Loader2, Link2, CheckCircle2, Wallet, AlertTriangle } from "lucide-react";
import { api }     from "@/lib/api";
import { useAuth, ROLES } from "@/lib/useAuth";

const REGISTRY_ABI = [
  {
    inputs: [
      { name: "institutionAdmin", type: "address" },
      { name: "institutionId",    type: "string"  },
      { name: "name",             type: "string"  },
    ],
    name: "registerIssuer",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
];

// Hardhat node Account #0 — local demo only (never use on a real network)
const HARDHAT_ACCOUNT0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

export default function AnchorPage() {
  const { role, loading: authLoading } = useAuth();
  const [insts,    setInsts]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [txLoading, setTxLoading] = useState(null);
  const [success,  setSuccess]  = useState(null);
  const [error,    setError]    = useState("");
  const [owner,    setOwner]    = useState(null);
  const [connected, setConnected] = useState("");
  const [walletBusy, setWalletBusy] = useState(false);

  const registryAddr = process.env.NEXT_PUBLIC_ISSUER_REGISTRY_ADDRESS;

  const refreshOwnerAndAccount = useCallback(async () => {
    if (!window.ethereum || !registryAddr) return;
    const { ethers } = await import("ethers");
    const provider = new ethers.BrowserProvider(window.ethereum);
    const contract = new ethers.Contract(registryAddr, REGISTRY_ABI, provider);
    try {
      const o = await contract.owner();
      setOwner(o.toLowerCase());
    } catch {
      setOwner(null);
    }
    try {
      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      setConnected((accounts[0] || "").toLowerCase());
    } catch {
      setConnected("");
    }
  }, [registryAddr]);

  useEffect(() => {
    if (authLoading || role !== ROLES.SUPER_ADMIN) return;
    api.get("/institutions/?is_chain_active=false")
      .then(data => setInsts((data.results ?? data).filter(i => i.wallet_address)))
      .catch(() => setError("Failed to load institutions."))
      .finally(() => setLoading(false));
    refreshOwnerAndAccount();
  }, [authLoading, role, refreshOwnerAndAccount]);

  async function connectOwnerWallet() {
    setError("");
    setWalletBusy(true);
    try {
      if (!window.ethereum) throw new Error("MetaMask not found.");
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const addr = (accounts[0] || "").toLowerCase();
      setConnected(addr);

      // Persist on Super Admin profile so wallet login works later
      await api.patch("/auth/me/", { wallet_address: addr });

      await refreshOwnerAndAccount();

      if (owner && addr !== owner) {
        setError(
          `Connected ${addr} but contract owner is ${owner}. ` +
          `In MetaMask, switch to Account 0 (${HARDHAT_ACCOUNT0}).`
        );
      }
    } catch (e) {
      setError(e?.message || "Could not connect MetaMask.");
    } finally {
      setWalletBusy(false);
    }
  }

  async function handleAnchor(inst) {
    setError("");
    setTxLoading(inst.id);
    try {
      if (!window.ethereum) throw new Error("MetaMask not found.");
      if (!registryAddr) throw new Error("NEXT_PUBLIC_ISSUER_REGISTRY_ADDRESS not set.");

      const { ethers } = await import("ethers");
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const signerAddr = (await signer.getAddress()).toLowerCase();
      setConnected(signerAddr);

      const contract = new ethers.Contract(registryAddr, REGISTRY_ABI, signer);
      const onChainOwner = (await contract.owner()).toLowerCase();
      setOwner(onChainOwner);

      if (signerAddr !== onChainOwner) {
        throw new Error(
          `IssuerRegistry: caller is not the owner. ` +
          `You are ${signerAddr}; owner is ${onChainOwner}. ` +
          `Import Hardhat Account 0 into MetaMask and select it before anchoring.`
        );
      }

      const tx = await contract.registerIssuer(
        inst.wallet_address,
        inst.institution_id,
        inst.name,
      );
      await tx.wait(1);
      await api.post(`/institutions/${inst.id}/anchor/`, { tx_hash: tx.hash });

      setSuccess(inst.id);
      setInsts(prev => prev.filter(i => i.id !== inst.id));
    } catch (e) {
      setError(e?.reason ?? e?.shortMessage ?? e?.message ?? "Transaction failed.");
    } finally {
      setTxLoading(null);
    }
  }

  const isOwner = owner && connected && connected === owner;

  if (authLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={28} className="text-[#022448] animate-spin" />
      </div>
    );
  }

  if (role !== ROLES.SUPER_ADMIN) {
    return <p className="text-[#C62828] text-sm">Access restricted to Super Admins.</p>;
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      <div>
        <h2 className="text-[#022448] font-bold text-2xl">Anchor Institutions On-Chain</h2>
        <p className="text-[#43474e] text-sm mt-0.5">
          <code className="bg-[#eef4ff] px-1.5 py-0.5 rounded text-[#022448] text-xs font-mono">registerIssuer()</code>
          {" "}is <strong>onlyOwner</strong> — MetaMask must be the wallet that deployed the contract (Hardhat Account 0).
        </p>
      </div>

      {/* Owner wallet panel */}
      <div className={`rounded-[14px] border p-5 ${isOwner ? "bg-[#E8F5E9] border-[#2E7D32]/20" : "bg-white border-[#c4c6cf]/15"}`}>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <p className="text-[#022448] text-sm font-semibold flex items-center gap-2">
              <Wallet size={16} /> Super Admin MetaMask (contract owner)
            </p>
            <p className="text-[#43474e] text-xs">
              Contract owner:{" "}
              <code className="font-mono text-[#022448] break-all">{owner || "—"}</code>
            </p>
            <p className="text-[#43474e] text-xs">
              Connected now:{" "}
              <code className="font-mono text-[#022448] break-all">{connected || "not connected"}</code>
            </p>
            {!isOwner && (
              <div className="flex gap-2 text-[#ED8A19] text-xs mt-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>
                  Import Hardhat Account 0 into MetaMask (local only), add network
                  <code className="mx-1">http://127.0.0.1:8545</code> chain id <code>31337</code>,
                  then connect that account. Private key (demo):{" "}
                  <code className="break-all">0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80</code>
                </span>
              </div>
            )}
            {isOwner && (
              <p className="text-[#2E7D32] text-xs font-semibold flex items-center gap-1">
                <CheckCircle2 size={14} /> Connected as contract owner — ready to anchor
              </p>
            )}
          </div>
          <button
            onClick={connectOwnerWallet}
            disabled={walletBusy}
            className="shrink-0 flex items-center gap-2 bg-[#022448] text-white px-5 py-2.5 rounded-[12px] text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {walletBusy ? <Loader2 size={15} className="animate-spin" /> : <Wallet size={15} />}
            {connected ? "Reconnect / Refresh" : "Connect Owner Wallet"}
          </button>
        </div>
      </div>

      {error && <div className="bg-[#ffdad6] text-[#93000a] text-sm px-4 py-3 rounded-lg break-all">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={26} className="text-[#022448] animate-spin" />
        </div>
      ) : insts.length === 0 ? (
        <div className="bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 p-10 text-center">
          <CheckCircle2 size={36} className="text-[#2E7D32] mx-auto mb-3" />
          <p className="text-[#43474e] text-sm">All approved institutions are already anchored on-chain.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {insts.map(inst => (
            <div key={inst.id} className="bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 p-6">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                  <p className="text-[#022448] font-semibold text-base">{inst.name}</p>
                  <p className="text-[#43474e] text-xs mt-0.5">ID: {inst.institution_id}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Link2 size={12} className="text-[#43474e]" />
                    <code className="font-mono text-[#022448] text-xs break-all">{inst.wallet_address}</code>
                  </div>
                  <p className="text-[#74777f] text-[11px] mt-1">Institutional Admin wallet (to be registered)</p>
                </div>
                <button
                  onClick={() => handleAnchor(inst)}
                  disabled={!!txLoading || !isOwner}
                  title={!isOwner ? "Connect Hardhat Account 0 first" : "Call registerIssuer as owner"}
                  className="flex items-center gap-2 bg-[#022448] text-white px-6 py-3 rounded-[12px] text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-50"
                >
                  {txLoading === inst.id
                    ? <><Loader2 size={15} className="animate-spin" /> Sending tx…</>
                    : <><Link2 size={15} /> Anchor On-Chain</>}
                </button>
              </div>
              {success === inst.id && (
                <div className="mt-3 flex items-center gap-2 text-[#2E7D32] text-sm">
                  <CheckCircle2 size={15} /> Anchored successfully.
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
