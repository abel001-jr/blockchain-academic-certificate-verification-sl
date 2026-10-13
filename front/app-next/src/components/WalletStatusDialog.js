"use client";
import { useEffect, useRef } from "react";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export default function WalletStatusDialog({ status, onClose, onSwitch }) {
  const ref = useRef(null);
  useEffect(() => { ref.current.showModal(); }, []);
  const pending = status.kind === "checking";
  return <dialog ref={ref} onCancel={event => { event.preventDefault(); onClose(); }} aria-labelledby="wallet-status-title" className="fixed inset-0 m-auto w-[min(460px,92vw)] rounded-xl border border-[#E4E1D6] bg-[#F8F7F2] p-6 text-[#08283F] shadow-xl backdrop:bg-black/40">
    <div className="flex items-center gap-3 mb-3">{pending ? <Loader2 size={24} className="animate-spin" /> : status.kind === "verified" ? <CheckCircle2 size={24} className="text-[#2F6F4E]" /> : <AlertCircle size={24} className="text-[#A23B34]" />}<h2 id="wallet-status-title" className="font-semibold text-lg">{pending ? "Checking your MetaMask account" : status.kind === "verified" ? "Wallet available and verified" : status.kind === "taken" ? "MetaMask account already in use" : "Wallet connection failed"}</h2></div>
    <p role="status" className="text-sm text-[#4A5A68] leading-relaxed">{status.message}</p>
    {status.kind === "taken" && <p className="mt-3 text-sm text-[#4A5A68] leading-relaxed">Open MetaMask to choose another account. To create one, use Add account in MetaMask, then select it and connect again.</p>}
    {status.address && <p className="mt-3 text-xs font-mono break-all">{status.address}</p>}
    <div className="flex justify-end gap-3 mt-5">{status.kind === "taken" && <button type="button" className="cd-btn-primary" onClick={onSwitch}>Switch account in MetaMask</button>}<button type="button" className="cd-btn-secondary" onClick={onClose}>{pending ? "Close" : "Done"}</button></div>
  </dialog>;
}
