"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ActionButton } from "@/components/ui/AnimatedControls";
import styles from "./InstitutionIdentityPanel.module.css";

const ASSETS = [{ key: "reference_logo", label: "Institution logo" }, { key: "reference_seal", label: "Certificate seal (gold)" }, { key: "reference_transcript_seal", label: "Transcript seal (blind / embossed)" }];
export default function InstitutionIdentityPanel({ readOnly = false }) {
  const [saved, setSaved] = useState({});
  const [files, setFiles] = useState({});
  const [previews, setPreviews] = useState({});
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const urls = {};
    for (const { key } of ASSETS) {
      if (files[key]) urls[key] = URL.createObjectURL(files[key]);
    }
    setPreviews(urls);
    return () => Object.values(urls).forEach(url => URL.revokeObjectURL(url));
  }, [files]);
  useEffect(() => {
    let alive = true;
    api.get("/institution-identity-settings/").then(data => { if (alive) setSaved(data); })
      .catch(() => { if (alive) setErrors({ general: "Could not load identity references. Refresh to try again." }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  function select(key, file) {
    setMessage("");
    const error = file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)
      ? "Choose a JPEG, PNG or WebP image up to 5 MB." : "";
    setErrors(previous => ({ ...previous, [key]: error }));
    setFiles(previous => ({ ...previous, [key]: error ? null : file }));
  }
  async function save(event) {
    event.preventDefault();
    if (readOnly) return;
    setSaving(true); setMessage("");
    try {
      const body = new FormData();
      for (const { key } of ASSETS) if (files[key]) body.append(key, files[key]);
      const data = await api.patch("/institution-identity-settings/", body);
      setSaved(data); setFiles({}); setErrors({}); event.target.reset();
      setMessage("Institution identity references saved.");
    } catch (error) {
      setErrors(Object.fromEntries(Object.entries(error || {}).map(([key, value]) => [key === "detail" ? "general" : key, Array.isArray(value) ? value.join(" ") : String(value)])));
      setMessage("Could not save references. Check the selected files and try again.");
    } finally { setSaving(false); }
  }
  return <section className={`${styles.panel} space-y-5`}>
    <div><h3 className="text-xl font-semibold text-[#08283F]">Institution identity</h3>
      <p className="mt-2 text-sm text-[#4A5A68]">Official logo, gold certificate seal and blind/embossed transcript seal used to review uploaded certificates and transcripts, including when both documents are uploaded. Each document is checked against its own seal reference, independently of certificate layout settings. </p>
      <p className="mt-2 text-xs text-[#687B8E]">Visual comparison supports manual review; it does not prove authenticity. Existing template revisions keep their own references where available.</p></div>
    {readOnly && <p className="rounded-xl border border-[#E4E1D6] bg-[#F8F7F2] px-4 py-3 text-sm text-[#4A5A68]">Read-only references for credential review. Contact your institution admin if a logo or seal is missing or needs updating.</p>}
    {loading ? <p role="status">Loading references...</p> : <form onSubmit={save} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">{ASSETS.map(({ key, label }, index) => <div key={key} style={{ "--identity-delay": `${index * 75}ms` }} className={`${styles.card} ${files[key] ? styles.selected : ""} rounded-xl border border-[#E4E1D6] p-4`}>
        <h4 className="block text-sm font-semibold text-[#08283F]">{label}</h4>
        <div className={styles.preview}>{previews[key] || saved[key] ? <a href={previews[key] || saved[key]} target="_blank" rel="noopener noreferrer" aria-label={`Open ${previews[key] ? "selected" : "saved"} ${label.toLowerCase()} at full size`} className="block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#08283F]">
          <img src={previews[key] || saved[key]} alt={`${previews[key] ? "Selected" : "Saved"} ${label.toLowerCase()}`} className={`${styles.image} my-4 h-40 w-full object-contain`} />
        </a> : <p className="my-4 text-sm text-[#687B8E]">No reference saved.</p>}</div>
        {(previews[key] || saved[key]) && <p className="mb-3 text-xs text-[#687B8E]">{previews[key] ? "Preview — not saved yet." : "Saved reference."} Click the image to view full size.</p>}
        {!readOnly && <>
        <label htmlFor={key} className="mb-2 block text-xs font-medium text-[#4A5A68]">Upload replacement {label.toLowerCase()}</label>
        <input id={key} type="file" accept="image/jpeg,image/png,image/webp" disabled={saving} aria-invalid={Boolean(errors[key])} aria-describedby={`${key}-help`} onChange={event => select(key, event.target.files?.[0])} className={`${styles.upload} block w-full text-sm`} />
        <p id={`${key}-help`} className={`mt-2 text-xs ${errors[key] ? "text-red-700" : "text-[#687B8E]"}`}>{errors[key] || "JPEG, PNG or WebP; up to 5 MB."}</p>
        </>}
      </div>)}</div>
      {errors.general && <p role="alert" className="text-sm text-red-700">{errors.general}</p>}
      {message && <p role="status" className={`${styles.feedback} text-sm`}>{message}</p>}
      {!readOnly && <ActionButton type="submit" disabled={saving || !Object.values(files).some(Boolean) || ASSETS.some(({key}) => errors[key])} className={`${styles.button} cred-btn cred-btn-primary`}>{saving ? "Saving..." : "Save identity references"}</ActionButton>}
    </form>}
  </section>;
}
