"use client";
import { isWalletCancellation } from "@/lib/walletActions";
import { useState, useRef } from "react";
import { Wallet, Loader2, ShieldCheck } from "lucide-react";

import { requireEthereum } from "@/lib/walletActions";
import { connectSingleWallet, readWalletAccounts, singleWalletAccount } from "@/lib/walletConnection.mjs";
import { useWalletAccounts } from "./WalletConnectionControls";
import FeedbackToast from "./FeedbackToast";

const BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000/api";

/** Truncates a wallet address for display: 0x1234…abcd */
function shortAddr(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function WalletSignIn({ onSuccess, onError, buttonLabel = "Sign in with MetaMask" }) {
  const [step,           setStep]           = useState("idle"); // idle | connecting | signing | verifying | done
  const [address,        setAddress]        = useState("");
  const requestLock = useRef(false);
  const { accounts } = useWalletAccounts();
  const [error,          setError]          = useState("");
  const [pendingApproval, setPendingApproval] = useState("");

  async function handleConnect() {
    if (requestLock.current) return;
    setError("");
    setPendingApproval("");

    if (typeof window === "undefined" || !window.ethereum) {
      const msg = "MetaMask is not installed. Please install it to continue.";
      setError(msg);
      onError?.(msg);
      return;
    }

    requestLock.current = true;
    try {
      setStep("connecting");

      const provider = requireEthereum();
      const addr = await connectSingleWallet(provider);
      setAddress(addr);
      const assertSameAccount = async () => {
        if (singleWalletAccount(await readWalletAccounts(provider)) !== addr) throw new Error("The connected account changed. Sign in again with the account you want to use.");
      };

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
      await assertSameAccount();
      const signature = await provider.request({
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

      if (verifyRes.status === 403 && verifyData.code === "application_pending") {
        setPendingApproval(verifyData.detail);
        setStep("idle");
        return;
      }

      if (!verifyRes.ok) {
        throw new Error(verifyData.detail || "Wallet verification failed.");
      }

      await assertSameAccount();
      localStorage.setItem("access_token",  verifyData.access);
      localStorage.setItem("refresh_token", verifyData.refresh);

      setStep("done");
      onSuccess?.(verifyData);
    } catch (err) {
      // User rejected the MetaMask popup
      if (isWalletCancellation(err)) {
        setError("");
        window.dispatchEvent(new CustomEvent("credence:wallet-cancelled"));
      } else {
        const msg = err?.message || "Wallet sign-in failed.";
        setError(msg);
        onError?.(msg);
      }
      setStep("idle");
    } finally { requestLock.current = false; }
  }

  const buttonLabels = {
    idle:       buttonLabel,
    connecting: "Connecting…",
    signing:    "Sign the message in MetaMask…",
    verifying:  "Verifying signature…",
    done:       "Signed in!",
  };

  const busy = step !== "idle" && step !== "done";

  return (
    <div className="flex flex-col gap-4">

      {!accounts.length && <p className="text-sm text-[#4A5A68]">Sign in to connect one MetaMask account and approve the sign-in message.</p>}

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
      {pendingApproval && (
        <div role="status" className="bg-[#EAF2FB] border border-[#CFE1F2] text-[#08283F] text-sm px-4 py-3 rounded-xl">
          <p className="font-semibold mb-1">Waiting for approval</p>
          <p>{pendingApproval}</p>
        </div>
      )}
      <FeedbackToast message={error} title="Wallet sign-in" />

      {/* Main action button */}
      <button
        onClick={handleConnect}
        disabled={busy || accounts.length > 1}
        className="cred-btn cred-btn-primary w-full disabled:opacity-60"
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
