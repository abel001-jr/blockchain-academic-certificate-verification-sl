"use client";
import { useEffect, useState } from "react";

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
      url = URL.createObjectURL(blob);
      if (alive) setResult({ url, error: "", warnings }); else URL.revokeObjectURL(url);
    }).catch(error => { if (alive) { setResult({ url: "", error: error.message }); onStatusChange?.("error"); } });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [certificate.id, certificate.template_revision, certificate.doc_hash, certificate.sealed_doc_hash, onStatusChange]);
  if (result.error) return <p role="alert" className="text-sm text-red-800">{result.error}</p>;
  if (!result.url) return <p className="text-sm text-[#687B8E]">Loading institutional certificate...</p>;
  return <div>
    <iframe onLoad={() => onStatusChange?.("ready")} title="Institutional certificate PDF" src={result.url} className={`w-full h-[600px] border rounded-xl ${className}`} />
    {result.warnings?.length > 0 && <section aria-label="Preview overview" className="mt-3 space-y-2">
      <h4 className="text-sm font-semibold text-[var(--cd-primary)]">Preview overview</h4>
      {result.warnings.map(warning => <p key={warning} className="rounded bg-amber-50 p-3 text-sm text-amber-800">{warning}</p>)}
    </section>}
  </div>;
}
