"use client";
import FeedbackToast from "@/components/FeedbackToast";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";

export default function SignatureReadinessGate({ children }) {
  const { role } = useAuth();
  const [readiness, setReadiness] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setError("");
    try { setReadiness(await api.get("/issuance/signature-readiness/")); }
    catch { setError("Could not check officer signatures. Retry before continuing."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    if (role !== "registrar") return;
    let active = true;
    queueMicrotask(() => { if (active) void refresh(); });
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => { active = false; window.removeEventListener("focus", onFocus); };
  }, [role, refresh]);
  if (role && role !== "registrar") return children;
  if (loading) return <p role="status">Checking officer signatures...</p>;
  if (!error && readiness?.ready) return children;
  return <section className="max-w-3xl space-y-5 rounded-2xl border border-amber-300 bg-white p-6">
    <FeedbackToast tone="warning" title="Officer signatures required" message={!error && readiness && !readiness.ready ? "Save valid Registrar, Vice-Chancellor and Chancellor signatures before continuing issuance." : ""} />
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
      <h2 className="text-xl font-semibold">{error ? "Issuance blocked — signature check unavailable" : "Issuance blocked — officer signatures required"}</h2>
      <p className="mt-2 text-sm">{error ? "We could not verify that all officer signatures are ready. Check your connection and select Check again before continuing." : "Document uploads and credential issuance are blocked until the Registrar, Vice-Chancellor and Chancellor have saved valid signatures."}</p>
    </div>
    <p className="text-sm text-[#4A5A68]">Set the Registrar, Vice-Chancellor and Chancellor signatures before uploading documents or continuing issuance. This applies to both uploaded credentials and Credence certificates with uploaded transcripts.</p>
    <FeedbackToast message={error} title="Signature check failed" />
    {!error && readiness && <ul className="space-y-3">{readiness.signers.map(signer => <li key={signer.role} className={`rounded-xl border p-3 text-sm ${signer.ready ? "border-green-200 bg-green-50 text-green-900" : "border-amber-300 bg-amber-50 text-amber-950"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2"><strong>{signer.label}{signer.name ? ` — ${signer.name}` : ""}</strong><span className="font-semibold">{signer.ready ? "Ready" : "Action required"}</span></div>
      <p className="mt-1">{signer.detail}</p>
      {!signer.ready && <p className="mt-2">{!signer.name ? "Contact your institution admin to configure one active officer for this role, then ask the officer to save their signature." : signer.role === "registrar" ? "Open Settings → Signature and upload your signature again, then select Check again here." : `Ask the ${signer.label} to open Settings → Signature and save a valid signature, then select Check again here.`}</p>}
    </li>)}</ul>}
    <p className="text-sm text-[#4A5A68]">Each officer saves their own signature in Settings → Signature. Saved signatures survive normal server restarts; a full database/media reset removes them.</p>
    <div className="flex flex-wrap gap-3"><Link href="/dashboard/settings?tab=Signature" className="cd-btn-primary">Set my signature</Link><button type="button" onClick={refresh} className="cd-btn-secondary">Check again</button></div>
  </section>;
}
