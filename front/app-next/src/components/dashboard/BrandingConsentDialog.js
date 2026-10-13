"use client";
import { ActionButton } from "@/components/ui/AnimatedControls";
import { useEffect, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";

export default function BrandingConsentDialog({ consent, onCancel, onConfirm }) {
  const dialog = useRef(null);
  useEffect(() => {
    if (consent && !dialog.current.open) dialog.current.showModal();
    if (!consent && dialog.current.open) dialog.current.close();
  }, [consent]);
  return <dialog ref={dialog} aria-labelledby="branding-consent-title" onCancel={event => { event.preventDefault(); onCancel(); }} style={{ position: "fixed", top: 80, right: 24, left: "auto", margin: 0, width: "min(480px, calc(100vw - 32px))", border: "1px solid #DDD5C9", borderRadius: 14, padding: 20, background: "white", color: "#08283F", boxShadow: "0 12px 45px rgba(8,40,63,.2)" }}>
    {consent && <><div className="flex items-center gap-3"><AlertTriangle size={22} className={consent.danger ? "text-red-700" : "text-amber-700"} /><h4 id="branding-consent-title" className="font-semibold flex-1">{consent.title}</h4><button type="button" onClick={onCancel} aria-label="Cancel action"><X size={18} /></button></div>
      <p className="mt-3 text-sm leading-relaxed text-[#4A5A68]">{consent.description}</p>
      <div className="mt-6 flex flex-wrap justify-end gap-5"><button type="button" onClick={onCancel} className="cred-btn cred-btn-secondary">Cancel</button><ActionButton type="button" onClick={onConfirm} className="cred-btn cred-btn-primary">{consent.label}</ActionButton></div></>}
  </dialog>;
}
