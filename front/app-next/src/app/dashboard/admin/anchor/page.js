"use client";
import { ActionButton } from "@/components/ui/AnimatedControls";

/**
 * Anchor Institution On-Chain
 * Must be signed by IssuerRegistry.owner.
 *
 * The owner is whatever wallet deployed the contract — which is a property of the
 * deployment, not of this file, so it is read from the chain and from the admin
 * -editable chain config rather than hardcoded. Which network and which registry to
 * use come from GET /chain-config/ (Settings → Blockchain, super admin).
 *
 * This page reconciles the database against the chain rather than trusting
 * `is_chain_active`. That flag records "a registerIssuer tx was confirmed at some
 * point", which is not the same as "this institution is registered right now":
 * restarting a local node wipes every on-chain role while the database keeps
 * saying the institution is anchored. Listing only `?is_chain_active=false` hid
 * exactly that case, so the stranded institution could not be re-registered from
 * anywhere in the app and the registrar's next submit simply reverted with
 * "caller is not an active registrar/issuer". The on-chain state is authoritative
 * for "is it registered"; the database is only authoritative for the tx hash.
 */

import { useState, useEffect, useCallback } from "react";
import { Loader2, Link2, CheckCircle2, Wallet, AlertTriangle, RefreshCw } from "lucide-react";
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
    inputs: [{ name: "institutionAdmin", type: "address" }],
    name: "isActiveIssuer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
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

export default function AnchorPage() {
  const { role, loading: authLoading } = useAuth();
  const [config,   setConfig]   = useState(null);
  const [insts,    setInsts]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [txLoading, setTxLoading] = useState(null);
  const [success,  setSuccess]  = useState(null);
  const [error,    setError]    = useState("");
  const [owner,    setOwner]    = useState(null);
  const [connected, setConnected] = useState("");
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletChainId, setWalletChainId] = useState(null);
  // null = not checked yet, true/false = on-chain isActiveIssuer(wallet)
  const [onChain,  setOnChain]  = useState({});

  const registryAddr = config?.issuer_registry_address || "";
  // The admin's stated expectation, checked against the contract's own owner() so a
  // stale entry is reported instead of quietly signing with the wrong wallet.
  const expectedOwner = (config?.expected_owner_address || "").toLowerCase();
  const expectedChain = config?.chain_id ?? null;
  const chainMismatch =
    expectedChain !== null && walletChainId !== null && Number(walletChainId) !== Number(expectedChain);

  /**
   * Ask the chain which of these wallets are actually registered. A failure here
   * is reported rather than swallowed: "we could not check" must not be rendered
   * as "not registered", or the page would send registerIssuer for institutions
   * that are already active and the transaction would revert on `already active`.
   */
  const checkOnChain = useCallback(async (list) => {
    if (!window.ethereum || !registryAddr || list.length === 0) return null;
    const { ethers } = await import("ethers");
    const provider = new ethers.BrowserProvider(window.ethereum);
    const contract = new ethers.Contract(registryAddr, REGISTRY_ABI, provider);
    const result = {};
    for (const inst of list) {
      if (!inst.wallet_address) continue;
      result[inst.id] = await contract.isActiveIssuer(inst.wallet_address);
    }
    return result;
  }, [registryAddr]);

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

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const cfg  = await api.get("/chain-config/");
      // Every institution with a wallet is loaded, not just the unanchored ones.
      // The chain decides who still needs registering.
      const data = await api.get("/institutions/");
      const list = (data.results ?? data).filter(i => i.wallet_address);
      setConfig(cfg);
      setInsts(list);
      try {
        setOnChain((await checkOnChain(list)) ?? {});
      } catch (e) {
        setOnChain({});
        setError(
          `Could not read on-chain registration state: ${e?.shortMessage ?? e?.message}. ` +
          `Reconnect your wallet on the configured network to check which ` +
          `institutions still need anchoring.`
        );
      }
    } catch (e) {
      setError(e?.detail ?? "Failed to load chain configuration or institutions.");
    } finally {
      setLoading(false);
      refreshOwnerAndAccount();
    }
  }, [checkOnChain, refreshOwnerAndAccount]);

  useEffect(() => {
    if (authLoading || role !== ROLES.SUPER_ADMIN) return;
    // Deferred to a microtask so `load`'s setState does not run synchronously
    // inside the effect body, which cascades renders.
    Promise.resolve().then(() => load());
  }, [authLoading, role, load]);

  /**
   * An institution needs a transaction only when the chain disagrees with the
   * database, in either direction. `registered` is the normal anchored state and
   * is shown as a confirmation rather than a card to act on.
   */
  const classify = (inst) => {
    const chain = onChain[inst.id];
    if (chain === undefined) return "unknown";
    if (chain) return "registered";
    return inst.is_chain_active ? "drifted" : "pending";
  };

  async function connectOwnerWallet() {
    setError("");
    setWalletBusy(true);
    try {
      if (!window.ethereum) throw new Error("MetaMask not found.");
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const addr = (accounts[0] || "").toLowerCase();
      setConnected(addr);

      const chainHex = await window.ethereum.request({ method: "eth_chainId" });
      setWalletChainId(Number(chainHex));

      // Persist on Super Admin profile so wallet login works later
      await api.patch("/auth/me/", { wallet_address: addr });

      await refreshOwnerAndAccount();

      // Connecting a wallet is what makes the on-chain check possible at all,
      // so re-reconcile immediately instead of leaving stale "unknown" rows.
      await load();

      if (owner && addr !== owner) {
        setError(
          `Connected ${addr} but the contract owner is ${owner}. ` +
          `Switch to the wallet that deployed IssuerRegistry.`
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
      if (!registryAddr) {
        throw new Error("No Issuer Registry address configured. Set it in Settings → Blockchain.");
      }

      const { ethers } = await import("ethers");
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const network = await provider.getNetwork();
      setWalletChainId(Number(network.chainId));
      const signer = await provider.getSigner();
      const signerAddr = (await signer.getAddress()).toLowerCase();
      setConnected(signerAddr);

      if (expectedChain !== null && Number(network.chainId) !== Number(expectedChain)) {
        throw new Error(
          `Connected wallet is on chain ${network.chainId}, but this deployment is ` +
          `configured for chain ${expectedChain}. Switch networks in MetaMask.`
        );
      }

      const contract = new ethers.Contract(registryAddr, REGISTRY_ABI, signer);
      const onChainOwner = (await contract.owner()).toLowerCase();
      setOwner(onChainOwner);

      if (expectedOwner && expectedOwner !== onChainOwner) {
        throw new Error(
          `Chain config expects IssuerRegistry to be owned by ${expectedOwner}, but the ` +
          `contract reports ${onChainOwner}. Update Settings → Blockchain before anchoring.`
        );
      }

      if (signerAddr !== onChainOwner) {
        throw new Error(
          `IssuerRegistry: caller is not the owner. ` +
          `You are ${signerAddr}; owner is ${onChainOwner}. ` +
          `Select the deploying wallet in MetaMask before anchoring.`
        );
      }

      const tx = await contract.registerIssuer(
        inst.wallet_address,
        inst.institution_id,
        inst.name,
      );
      await tx.wait(1);
      // Re-record the anchor even when the database already believed it was
      // active: in the drifted case the previous tx_hash refers to a chain that
      // no longer exists, and overwriting it keeps the record honest.
      await api.post(`/institutions/${inst.id}/anchor/`, { tx_hash: tx.hash });

      setSuccess(inst.id);
      // Flip the reconciled state rather than dropping the row, so the card
      // settles into the confirmed state instead of vanishing.
      setOnChain(prev => ({ ...prev, [inst.id]: true }));
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
          {" "}is <strong>onlyOwner</strong> — connect the wallet that deployed{" "}
          <code className="bg-[#eef4ff] px-1.5 py-0.5 rounded text-[#022448] text-xs font-mono">IssuerRegistry</code>.
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
              Network:{" "}
              <code className="font-mono text-[#022448] break-all">
                {walletChainId ?? "not connected"}
                {expectedChain !== null ? ` (expected ${expectedChain})` : ""}
              </code>
            </p>
            <p className="text-[#43474e] text-xs">
              Registry:{" "}
              <code className="font-mono text-[#022448] break-all">{registryAddr || "not configured"}</code>
            </p>
            <p className="text-[#43474e] text-xs">
              Contract owner:{" "}
              <code className="font-mono text-[#022448] break-all">{owner || "—"}</code>
            </p>
            <p className="text-[#43474e] text-xs">
              Connected now:{" "}
              <code className="font-mono text-[#022448] break-all">{connected || "not connected"}</code>
            </p>
            {chainMismatch && (
              <div className="flex gap-2 text-[#C62828] text-xs mt-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>
                  Your wallet is on chain {walletChainId} but this deployment is configured
                  for chain {expectedChain}. Switch networks in MetaMask, or correct
                  Settings &rarr; Blockchain.
                </span>
              </div>
            )}
            {expectedOwner && owner && expectedOwner !== owner && (
              <div className="flex gap-2 text-[#C62828] text-xs mt-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>
                  Chain config expects the owner to be{" "}
                  <code className="font-mono break-all">{expectedOwner}</code> but the
                  contract reports <code className="font-mono break-all">{owner}</code>.
                  Correct Settings &rarr; Blockchain before anchoring.
                </span>
              </div>
            )}
            {!isOwner && !chainMismatch && (
              <div className="flex gap-2 text-[#ED8A19] text-xs mt-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>
                  Select the wallet that deployed the registry. If you do not have it, you
                  need a key for an account you control — never a key issued to someone
                  else, and never one pasted into a web page.
                </span>
              </div>
            )}
            {isOwner && (
              <p className="text-[#2E7D32] text-xs font-semibold flex items-center gap-1">
                <CheckCircle2 size={14} /> Connected as contract owner — ready to anchor
              </p>
            )}
          </div>
          <ActionButton
            onClick={connectOwnerWallet}
            disabled={walletBusy}
            className="shrink-0 flex items-center gap-2 bg-[#022448] text-white px-5 py-2.5 rounded-[12px] text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {walletBusy ? <Loader2 size={15} className="animate-spin" /> : <Wallet size={15} />}
            {connected ? "Reconnect / Refresh" : "Connect Owner Wallet"}
          </ActionButton>
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
          <p className="text-[#43474e] text-sm">No institution has a registered admin wallet yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {insts.map(inst => {
            const state = classify(inst);
            const needsTx = state === "pending" || state === "drifted";
            return (
            <div
              key={inst.id}
              className={`bg-white rounded-[14px] shadow-card border p-6 ${
                state === "drifted" ? "border-[#ED8A19]/40 bg-[#FFFBF3]" : "border-[#c4c6cf]/10"
              }`}
            >
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                  <p className="text-[#022448] font-semibold text-base">{inst.name}</p>
                  <p className="text-[#43474e] text-xs mt-0.5">ID: {inst.institution_id}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Link2 size={12} className="text-[#43474e]" />
                    <code className="font-mono text-[#022448] text-xs break-all">{inst.wallet_address}</code>
                  </div>
                  <p className="text-[#74777f] text-[11px] mt-1">
                    {state === "registered"
                      ? "Institutional Admin wallet — registered on-chain"
                      : "Institutional Admin wallet (to be registered)"}
                  </p>
                </div>
                {needsTx ? (
                  <button
                    onClick={() => handleAnchor(inst)}
                    disabled={!!txLoading || !isOwner}
                    title={!isOwner ? "Connect the deploying wallet first" : "Call registerIssuer as owner"}
                    className="flex items-center gap-2 bg-[#022448] text-white px-6 py-3 rounded-[12px] text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-50"
                  >
                    {txLoading === inst.id
                      ? <><Loader2 size={15} className="animate-spin" /> Sending tx…</>
                      : <><Link2 size={15} /> {state === "drifted" ? "Re-Register On-Chain" : "Anchor On-Chain"}</>}
                  </button>
                ) : (
                  <span className="flex items-center gap-2 text-[#2E7D32] text-sm font-semibold">
                    <CheckCircle2 size={15} /> Registered on-chain
                  </span>
                )}
              </div>

              {state === "drifted" && (
                <div className="mt-3 flex gap-2 text-[#ED8A19] text-xs">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>
                    The database records this institution as anchored, but the contract
                    reports its wallet is <strong>not</strong> a registered issuer. The
                    chain was most likely reset — a restarted local node wipes all
                    on-chain state — so until it is re-registered every registrar in
                    this institution will be rejected with{" "}
                    <code className="font-mono">caller is not an active registrar/issuer</code>.
                    Officer and registrar authorisations are wiped the same way and
                    must be re-issued after the node comes back up.
                  </span>
                </div>
              )}

              {state === "unknown" && (
                <div className="mt-3 flex gap-2 text-[#ED8A19] text-xs">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>On-chain state not verified — reconnect your wallet to check.</span>
                </div>
              )}

              {success === inst.id && (
                <div className="mt-3 flex items-center gap-2 text-[#2E7D32] text-sm">
                  <CheckCircle2 size={15} /> Anchored successfully.
                </div>
              )}
            </div>
            );
          })}

          <div className="flex justify-end">
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-2 text-[#43474e] text-xs font-semibold px-3 py-2 rounded-[10px] hover:bg-[#eef4ff] disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Re-check against chain
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
