"use client";
/**
 * Bind Wallet — Institutional Admin connects MetaMask wallet
 * after their application has been approved by Super Admin.
 * Spec §4 Phase 3a.
 */
import { useState } from "react";
import { Wallet, Loader2, CheckCircle2, ShieldCheck } from "lucide-react";
import { api }  from "@/lib/api";
import { useAuth } from "@/lib/useAuth";

export default function BindWalletPage() {
  const { user, loading: authLoading } = useAuth();
  const [step,    setStep]    = useState("idle"); // idle | connecting | binding | done
  const [address, setAddress] = useState("");
  const [error,   setError]   = useState("");

  async function handleBind() {
    setError("");

    if (!window.ethereum) {
      setError("MetaMask is not installed. Please install it to continue.");
      return;
    }

    try {
      setStep("connecting");
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const addr     = accounts[0].toLowerCase();
      setAddress(addr);

      setStep("binding");
      await api.post(`/institutions/${user.institution}/bind-wallet/`, {
        wallet_address: addr,
      });

      // Also update local user record
      await api.patch("/auth/me/", { wallet_address: addr });

      setStep("done");
    } catch (e) {
      setError(e?.detail ?? e?.message ?? "Failed to bind wallet.");
      setStep("idle");
    }
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={26} className="text-[#022448] animate-spin" />
      </div>
    );
  }

  if (user?.wallet_address) {
    return (
      <div className="max-w-[600px]">
        <div className="bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 p-8 text-center">
          <CheckCircle2 size={40} className="text-[#2E7D32] mx-auto mb-4" />
          <h2 className="text-[#022448] font-bold text-xl mb-2">Wallet Already Bound</h2>
          <p className="text-[#43474e] text-sm mb-4">Your wallet is linked to this institution.</p>
          <code className="bg-[#eef4ff] text-[#022448] px-4 py-2 rounded-[10px] text-sm font-mono">
            {user.wallet_address}
          </code>
        </div>
      </div>
    );
  }

  const labels = {
    idle:       "Connect & Bind MetaMask Wallet",
    connecting: "Connecting wallet…",
    binding:    "Binding wallet to institution…",
    done:       "Wallet bound successfully!",
  };

  return (
    <div className="flex flex-col gap-6 max-w-[600px]">
      <div>
        <h2 className="text-[#022448] font-bold text-2xl">Bind Your Wallet</h2>
        <p className="text-[#43474e] text-sm mt-0.5">
          Connect your MetaMask wallet to enable on-chain operations for your institution.
        </p>
      </div>

      <div className="bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 p-8">

        <div className="bg-[#eef4ff] rounded-[10px] p-4 mb-6">
          <h3 className="text-[#022448] text-sm font-semibold mb-2">Why is this required?</h3>
          <ul className="text-[#43474e] text-xs leading-relaxed space-y-1">
            <li>• Your wallet address will be anchored on the Ethereum blockchain as an authorised institutional issuer.</li>
            <li>• All on-chain operations (registrar authorization, certificate issuance) will require this wallet's signature.</li>
            <li>• No transaction or gas fee is charged for binding — only read access is needed.</li>
          </ul>
        </div>

        {error && (
          <div className="bg-[#ffdad6] text-[#93000a] text-sm px-4 py-3 rounded-lg mb-5 flex items-start gap-2">
            <span className="shrink-0">⚠</span><span>{error}</span>
          </div>
        )}

        {step === "done" ? (
          <div className="text-center">
            <CheckCircle2 size={40} className="text-[#2E7D32] mx-auto mb-3" />
            <p className="text-[#022448] font-semibold text-base mb-1">Wallet Bound</p>
            <code className="text-[#43474e] font-mono text-sm">{address}</code>
            <p className="text-[#43474e] text-xs mt-3">
              A Super Admin will now anchor your institution on-chain. You'll be notified when active.
            </p>
          </div>
        ) : (
          <>
            <button
              onClick={handleBind}
              disabled={step !== "idle"}
              className="flex items-center justify-center gap-3 w-full bg-[#022448] text-white px-6 py-4 rounded-[14px] font-semibold text-sm hover:opacity-90 transition-all active:scale-95 disabled:opacity-60"
            >
              {step === "idle"
                ? <Wallet size={18} />
                : <Loader2 size={18} className="animate-spin" />}
              {labels[step]}
            </button>

            {address && step !== "idle" && (
              <div className="mt-3 flex items-center gap-2 bg-[#eef4ff] px-4 py-3 rounded-[10px]">
                <ShieldCheck size={14} className="text-[#022448] shrink-0" />
                <code className="font-mono text-[#022448] text-xs">{address}</code>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
