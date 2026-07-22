"use client";
/**
 * WalletSignIn
 * Reusable wallet-based sign-in component (spec §5).
 * Uses MetaMask personal_sign for SIWE-style auth.
 *
 * Props:
 *   onSuccess(tokens, user) — called after successful JWT exchange
 *   onError(msg)            — called on any failure
 */

import { useState } from "react";
import { Wallet, Loader2, ShieldCheck } from "lucide-react";

const BASE = "http://127.0.0.1:8000/api";

export default function WalletSignIn({ onSuccess, onError }) {
  const [step,    setStep]    = useState("idle"); // idle | connecting | signing | verifying | done
  const [address, setAddress] = useState("");
  const [error,   setError]   = useState("");

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

      // Request wallet access
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const addr     = accounts[0].toLowerCase();
      setAddress(addr);

      setStep("signing");

      // Step 1 — get challenge nonce from backend
      const challengeRes = await fetch(`${BASE}/auth/wallet/challenge/`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ address: addr }),
      });

      if (!challengeRes.ok) {
        throw new Error("Failed to get challenge from server.");
      }

      const { message } = await challengeRes.json();

      // Step 2 — sign message with MetaMask
      const signature = await window.ethereum.request({
        method: "personal_sign",
        params: [message, addr],
      });

      setStep("verifying");

      // Step 3 — verify signature, get JWT
      const verifyRes = await fetch(`${BASE}/auth/wallet/verify/`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ address: addr, signature }),
      });

      const verifyData = await verifyRes.json();

      if (!verifyRes.ok) {
        throw new Error(verifyData.detail || "Wallet verification failed.");
      }

      // Store tokens
      localStorage.setItem("access_token",  verifyData.access);
      localStorage.setItem("refresh_token", verifyData.refresh);

      setStep("done");
      onSuccess?.(verifyData);
    } catch (err) {
      const msg = err?.message || "Wallet sign-in failed.";
      setError(msg);
      setStep("idle");
      onError?.(msg);
    }
  }

  const labels = {
    idle:       "Sign In with MetaMask",
    connecting: "Connecting wallet…",
    signing:    "Sign the message in MetaMask…",
    verifying:  "Verifying signature…",
    done:       "Signed in!",
  };

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="bg-[#ffdad6] text-[#93000a] text-sm px-4 py-3 rounded-lg flex items-start gap-2">
          <span className="mt-0.5 shrink-0">⚠</span>
          <span>{error}</span>
        </div>
      )}

      <button
        onClick={handleConnect}
        disabled={step !== "idle"}
        className="flex items-center justify-center gap-3 bg-[#022448] text-white px-6 py-4 rounded-[14px] font-semibold text-sm hover:opacity-90 transition-all active:scale-95 disabled:opacity-60 w-full"
      >
        {step === "idle" || step === "done" ? (
          <Wallet size={18} />
        ) : (
          <Loader2 size={18} className="animate-spin" />
        )}
        {labels[step]}
      </button>

      {address && step !== "idle" && (
        <div className="flex items-center gap-2 bg-[#eef4ff] px-4 py-3 rounded-[10px]">
          <ShieldCheck size={14} className="text-[#022448] shrink-0" />
          <span className="font-mono text-[#022448] text-xs truncate">{address}</span>
        </div>
      )}

      <p className="text-[#74777f] text-xs text-center leading-relaxed">
        MetaMask will ask you to sign a message. No transaction or gas fee is involved.
      </p>
    </div>
  );
}
