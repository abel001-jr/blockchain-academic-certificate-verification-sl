"use client";
import FeedbackToast from "@/components/FeedbackToast";
import { useRef, useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import { connectWallet } from "@/lib/walletActions";

export default function WalletSigningControls({ signing, onSign }) {
  const lock = useRef(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    if (lock.current || signing) return;
    lock.current = true;
    setOpening(true); setError("");
    try {
      await connectWallet();
      await onSign();
    } catch (failure) {
      setError(failure?.code === 4001 ? "MetaMask request cancelled. Select Submit for approval to try again." : failure?.message || "Could not open MetaMask. Unlock your wallet and try again.");
    } finally { lock.current = false; setOpening(false); }
  }
  return <div className="space-y-2">
    <button type="button" onClick={submit} disabled={signing || opening} className="cd-btn-primary disabled:opacity-60">
      {signing || opening ? <><Loader2 size={15} className="animate-spin" /> Continue in MetaMask...</> : <><Wallet size={15} /> Submit for approval with MetaMask</>}
    </button>
    <p className="text-xs text-[#4A5A68]">MetaMask opens when a signature or transaction is needed. Use the wallet registered to your signed-in account.</p>
    <FeedbackToast message={error} title="Wallet request" tone={error.includes("cancelled") ? "info" : "error"} />
  </div>;
}
