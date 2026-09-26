"use client";
/**
 * WalletSignIn
 * Reusable wallet-based sign-in component.
 * Uses MetaMask personal_sign for SIWE-style auth.
 *
 * Key fix: always reads the CURRENTLY SELECTED MetaMask account via
 * `eth_accounts` first, then falls back to `eth_requestAccounts` to
 * prompt permission if needed. This prevents stale cached accounts
 * from being used when the user has switched wallets in MetaMask.
 *
 * Props:
 *   onSuccess(tokens, user) — called after successful JWT exchange
 *   onError(msg)            — called on any failure
 */

import { useState, useEffect } from "react";
import { Wallet, Loader2, ShieldCheck, RefreshCw, AlertCircle } from "lucide-react";

const BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000/api";

/** Returns the currently active MetaMask account without triggering a popup. */
async function getActiveAccount() {
  if (typeof window === "undefined" || !window.ethereum) return null;
  try {
    const accounts = await window.ethereum.request({ method: "eth_accounts" });
    return accounts?.[0]?.toLowerCase() || null;
  } catch {
    return null;
  }
}

/** Truncates a wallet address for display: 0x1234…abcd */
function shortAddr(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function WalletSignIn({ onSuccess, onError }) {
  const [step,           setStep]           = useState("idle"); // idle | connecting | signing | verifying | done
  const [address,        setAddress]        = useState("");
  const [activeAccount,  setActiveAccount]  = useState(""); // what MetaMask currently has selected
  const [error,          setError]          = useState("");

  // On mount — silently read whatever account MetaMask has active
  useEffect(() => {
    getActiveAccount().then(addr => {
      if (addr) setActiveAccount(addr);
    });

    // Also listen for account switches while the page is open
    function onAccountsChanged(accounts) {
      setActiveAccount(accounts?.[0]?.toLowerCase() || "");
      // Reset any in-progress flow if the user switches mid-sign
      setStep("idle");
      setAddress("");
      setError("");
    }

    if (typeof window !== "undefined" && window.ethereum) {
      window.ethereum.on("accountsChanged", onAccountsChanged);
      return () => window.ethereum.removeListener("accountsChanged", onAccountsChanged);
    }
  }, []);

  async function handleConnect() {
    setError("");

    if (typeof window === "undefined" || !window.ethereum) {
      const msg = "MetaMask is not installed. Please install it to continue.";
      setError(msg);
      onError?.(msg);
      return;
    }

    try {
      setStep("connecting");

      // Always request fresh account list — this surfaces the CURRENTLY
      // selected account, not a cached one from a previous session.
      // If MetaMask has already granted permission, this resolves instantly
      // without a popup.
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });

      // eth_requestAccounts returns the permitted accounts in order.
      // The FIRST one is always the currently selected account in MetaMask.
      const addr = accounts?.[0]?.toLowerCase();
      if (!addr) throw new Error("No account returned from MetaMask.");

      setAddress(addr);
      setActiveAccount(addr);

      setStep("signing");

      // Step 1 — get nonce challenge from backend
      const challengeRes = await fetch(`${BASE}/auth/wallet/challenge/`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ address: addr }),
      });

      if (!challengeRes.ok) {
        const err = await challengeRes.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to get challenge from server.");
      }

      const { message } = await challengeRes.json();

      // Step 2 — ask MetaMask to sign the challenge with the selected account
      // Passing addr explicitly ensures MetaMask signs with the right account
      const signature = await window.ethereum.request({
        method: "personal_sign",
        params: [message, addr],
      });

      setStep("verifying");

      // Step 3 — verify signature on the backend, receive JWT
      const verifyRes = await fetch(`${BASE}/auth/wallet/verify/`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ address: addr, signature }),
      });

      const verifyData = await verifyRes.json();

      if (!verifyRes.ok) {
        throw new Error(verifyData.detail || "Wallet verification failed.");
      }

      localStorage.setItem("access_token",  verifyData.access);
      localStorage.setItem("refresh_token", verifyData.refresh);

      setStep("done");
      onSuccess?.(verifyData);
    } catch (err) {
      // User rejected the MetaMask popup
      if (err?.code === 4001) {
        setError("Request cancelled. Click the button again when ready.");
      } else {
        const msg = err?.message || "Wallet sign-in failed.";
        setError(msg);
        onError?.(msg);
      }
      setStep("idle");
    }
  }

  /** Opens MetaMask account switcher popup. */
  async function handleSwitchAccount() {
    if (!window.ethereum) return;
    try {
      // wallet_requestPermissions forces MetaMask to show the account picker
      await window.ethereum.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });
      // After the user picks, accountsChanged fires and updates activeAccount
    } catch {
      // User closed the popup — no action needed
    }
  }

  const buttonLabels = {
    idle:       "Sign in with MetaMask",
    connecting: "Connecting…",
    signing:    "Sign the message in MetaMask…",
    verifying:  "Verifying signature…",
    done:       "Signed in!",
  };

  const busy = step !== "idle" && step !== "done";

  return (
    <div className="flex flex-col gap-4">

      {/* Show which account MetaMask currently has selected */}
      {activeAccount && step === "idle" && (
        <div className="bg-[#EAF2FB] border border-[#CFE1F2] rounded-xl px-4 py-3">
          <p className="text-[#4A5A68] text-xs font-medium mb-1.5">Active MetaMask account</p>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <ShieldCheck size={14} className="text-[#08283F] shrink-0" />
              <span className="font-mono text-[#08283F] text-sm font-semibold truncate">
                {shortAddr(activeAccount)}
              </span>
              <span className="font-mono text-[#4A5A68] text-xs truncate hidden sm:block">
                {activeAccount}
              </span>
            </div>
            <button
              type="button"
              onClick={handleSwitchAccount}
              className="shrink-0 flex items-center gap-1.5 text-[#B98A28] text-xs font-semibold hover:underline"
              title="Switch to a different account"
            >
              <RefreshCw size={12} />
              Switch
            </button>
          </div>
        </div>
      )}

      {/* Address confirmed during signing */}
      {address && step !== "idle" && step !== "done" && (
        <div className="flex items-center gap-2 bg-[#EAF2FB] border border-[#CFE1F2] px-4 py-3 rounded-xl">
          <ShieldCheck size={14} className="text-[#08283F] shrink-0" />
          <span className="font-mono text-[#08283F] text-sm font-semibold truncate">
            {shortAddr(address)}
          </span>
          <span className="font-mono text-[#4A5A68] text-xs truncate hidden sm:block">
            {address}
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-[#F5E5E3] text-[#A23B34] text-sm px-4 py-3 rounded-xl flex items-start gap-2">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main action button */}
      <button
        onClick={handleConnect}
        disabled={busy}
        className="cd-btn-primary w-full disabled:opacity-60"
      >
        {busy ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <Wallet size={18} />
        )}
        {buttonLabels[step]}
      </button>

      <p className="text-[#8A929C] text-xs text-center leading-relaxed">
        MetaMask will ask you to sign a message. No transaction or gas fee is involved.
      </p>
    </div>
  );
}
