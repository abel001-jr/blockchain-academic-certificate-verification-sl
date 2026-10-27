"use client";
import FeedbackToast from "@/components/FeedbackToast";
import { useEffect, useState } from "react";
import styles from "./TemplatePdfPreview.module.css";
import DocumentPdfPreview from "@/components/DocumentPdfPreview";

const BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000/api";

export default function TemplatePdfPreview({ certificate, className = "", onStatusChange }) {
  const [result, setResult] = useState({ url: "", error: "", warnings: [] });
  useEffect(() => {
    let alive = true, url, warnings = [];
    onStatusChange?.("loading");
    fetch(`${BASE}/certificates/${certificate.id}/preflight/`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
    }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Certificate data did not pass validation.");
      warnings = data.warnings || [];
      return fetch(`${BASE}/certificates/${certificate.id}/template-preview/`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
      });
    }).then(async response => {
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Could not load the institutional certificate preview.");
      }
      return response.blob();
    }).then(blob => {
      url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
      if (alive) {
        setResult({ url, error: "", warnings });
        onStatusChange?.("ready");
      } else URL.revokeObjectURL(url);
    }).catch(error => { if (alive) { setResult({ url: "", error: error.message }); onStatusChange?.("error"); } });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [certificate.id, certificate.template_revision, certificate.doc_hash, certificate.sealed_doc_hash, onStatusChange]);
  if (result.error) return <FeedbackToast message={result.error} title="Certificate preview failed" />;
  if (!result.url) return <p role="status" aria-label="Loading institutional certificate" className={styles.loading}>
    <span aria-hidden="true" className={styles.spinner} />
    <span>Loading institutional certificate<span aria-hidden="true" className={styles.dots}><span>.</span><span>.</span><span>.</span></span></span>
  </p>;
  return <div>
    {certificate.tx_hash && ["pending_vc", "pending_chancellor", "pending_finalize"].includes(certificate.status) && <p className="mb-3 rounded-lg bg-[var(--cd-tint)] p-3 text-xs text-[#4A5A68]">Approval progress preview: captured officer signatures are shown. The original submitted review PDF and its hash remain unchanged.</p>}
    <DocumentPdfPreview title="Institutional certificate PDF" src={result.url} className={`w-full h-[420px] sm:h-[600px] border rounded-xl ${className}`} />
    <FeedbackToast tone="warning" title="Certificate preview needs review" message={result.warnings?.join("\n")} />
  </div>;
}
