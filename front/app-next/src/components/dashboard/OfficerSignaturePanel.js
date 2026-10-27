"use client";
import { ActionButton } from "@/components/ui/AnimatedControls";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Check, Upload, Type, ShieldAlert } from "lucide-react";
import { renderTypedSignature } from "@/lib/signatureCanvas";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000/api";

function authHeaders() {
  const t = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/**
 * Institution signer cosmetic signature — upload scan or typed name.
 * Image is display-only; on-chain tx is the real proof (see notice below).
 */
export default function OfficerSignaturePanel({
  defaultName = "",
  compact = false,
  allowSkip = false,
  onSaved,
  onSkip,
}) {
  const [mode, setMode] = useState("upload");
  const [typedName, setTypedName] = useState(defaultName);
  const nameEdited = useRef(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [savedUrl, setSavedUrl] = useState("");
  const [signatureSetAt, setSignatureSetAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/signature/`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw data;
      setSavedUrl(data.signature_url || "");
      setPreviewUrl(data.signature_url || "");
      setSignatureSetAt(data.signature_set_at);
      if (data.full_name && !nameEdited.current) {
        setTypedName(current => current || data.full_name);
      }
    } catch (e) {
      setError(e?.detail || "Failed to load signature.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => { if (active) load(); });
    return () => { active = false; };
  }, [load]);

  useEffect(() => {
    if (defaultName && !nameEdited.current) {
      setTypedName(current => current || defaultName);
    }
  }, [defaultName]);

  useEffect(() => {
    let active = true;
    if (uploadFile) {
      const url = URL.createObjectURL(uploadFile);
      Promise.resolve().then(() => { if (active) setPreviewUrl(url); });
      return () => { active = false; URL.revokeObjectURL(url); };
    }
    Promise.resolve().then(() => { if (active) setPreviewUrl(savedUrl); });
    return () => { active = false; };
  }, [uploadFile, savedUrl]);

  async function buildBlob() {
    if (mode === "upload") {
      if (!uploadFile) throw new Error("Select a signature image to upload.");
      return uploadFile;
    }
    const blob = await renderTypedSignature(typedName);
    if (!blob) throw new Error("Enter your name to generate a signature.");
    return blob;
  }

  async function handleSave(e) {
    e?.preventDefault?.();
    setSaving(true);
    setSuccess("");
    setError("");
    try {
      const blob = await buildBlob();
      const fd = new FormData();
      fd.append("signature_image", blob, "signature.png");

      const res = await fetch(`${API_BASE}/auth/signature/`, {
        method: "POST",
        headers: authHeaders(),
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw data;

      setSavedUrl(data.signature_url || "");
      setPreviewUrl(data.signature_url || "");
      setSignatureSetAt(data.signature_set_at);
      setUploadFile(null);
      setSuccess(data.detail || "Signature saved.");
      onSaved?.(data);
    } catch (err) {
      setError(err?.detail || err?.message || JSON.stringify(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="animate-spin text-[#022448]" size={24} />
      </div>
    );
  }

  // ── Read-only view once a signature is saved ──────────────────────────────
  if (savedUrl) {
    return (
      <div className="flex flex-col gap-5">
        {!compact && (
          <div>
            <h3 className="text-[#022448] font-semibold text-base">Digital Signature</h3>
            <p className="text-[#43474e] text-sm mt-1">
              Your signature is set and will appear on certificates you sign.
            </p>
          </div>
        )}

        <div className="bg-[#eef4ff] rounded-[10px] p-3 flex gap-2 items-start">
          <ShieldAlert size={16} className="text-[#7b5900] mt-0.5 shrink-0" />
          <p className="text-[#43474e] text-xs leading-relaxed">
            <strong className="text-[#022448]">Cosmetic only.</strong> The signature image makes the
            certificate look official — it is not cryptographic proof. Authenticity comes from your
            on-chain submission or approval transaction, which is
            always shown alongside the image.
          </p>
        </div>

        <div>
          <p className="text-[#022448] text-xs font-semibold uppercase tracking-widest mb-2">
            Your Signature
          </p>
          <div className="bg-white border border-[#c4c6cf]/30 rounded-[10px] p-4 min-h-[80px] flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={savedUrl} alt="Saved signature" className="max-h-16 max-w-full object-contain" />
          </div>
          {signatureSetAt && (
            <p className="text-[#74777f] text-[10px] mt-1.5 flex items-center gap-1">
              <Check size={10} className="text-[#2E7D32]" />
              Set on {new Date(signatureSetAt).toLocaleString()} · Contact your administrator to update.
            </p>
          )}
        </div>

        {allowSkip && <ActionButton type="button" onClick={() => onSaved?.()} className="cd-btn-primary">Use saved signature &amp; complete setup</ActionButton>}
        {error && (
          <div className="bg-[#ffdad6] text-[#93000a] text-sm px-4 py-3 rounded-lg break-all">{error}</div>
        )}
      </div>
    );
  }

  // ── First-time setup ───────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5">
      {!compact && (
        <div>
          <h3 className="text-[#022448] font-semibold text-base">Digital Signature</h3>
          <p className="text-[#43474e] text-sm mt-1">
            Set your signature once — upload a scan or type your name. It cannot be changed after saving.
          </p>
        </div>
      )}

      <div className="bg-[#eef4ff] rounded-[10px] p-3 flex gap-2 items-start">
        <ShieldAlert size={16} className="text-[#7b5900] mt-0.5 shrink-0" />
        <p className="text-[#43474e] text-xs leading-relaxed">
          <strong className="text-[#022448]">Cosmetic only.</strong> The signature image makes the
          certificate look official — it is not cryptographic proof. Authenticity comes from your
          on-chain <code className="font-mono text-[10px]">approveAsVC</code> /{" "}
          <code className="font-mono text-[10px]">approveAsDean</code> transaction, which is
          always shown alongside the image.
        </p>
      </div>

      {success && (
        <div className="bg-[#2E7D32]/10 text-[#2E7D32] text-sm px-4 py-3 rounded-lg flex items-center gap-2">
          <Check size={14} /> {success}
        </div>
      )}
      {error && (
        <div className="bg-[#ffdad6] text-[#93000a] text-sm px-4 py-3 rounded-lg break-all">{error}</div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-[10px] text-xs font-semibold transition-all ${
            mode === "upload" ? "bg-[#022448] text-white" : "bg-[#eef4ff] text-[#43474e]"
          }`}
        >
          <Upload size={13} /> Upload scan
        </button>
        <button
          type="button"
          onClick={() => setMode("type")}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-[10px] text-xs font-semibold transition-all ${
            mode === "type" ? "bg-[#022448] text-white" : "bg-[#eef4ff] text-[#43474e]"
          }`}
        >
          <Type size={13} /> Type name
        </button>
      </div>

      {mode === "upload" ? (
        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[#c4c6cf]/50 hover:border-[#022448]/30 rounded-[12px] p-6 cursor-pointer bg-[#FAF7F2]">
          <Upload size={24} className="text-[#74777f]" />
          <span className="text-[#022448] text-sm font-medium">
            {uploadFile ? uploadFile.name : "PNG or JPEG · transparent PNG recommended"}
          </span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
          />
        </label>
      ) : (
        <div>
          <label className="text-[#022448] text-xs font-semibold uppercase tracking-widest block mb-1.5">
            Your name
          </label>
          <input
            className="w-full bg-[#eef4ff] border border-transparent focus:border-[#022448] rounded-[10px] px-4 py-3 text-sm text-[#121c28] outline-none"
            value={typedName}
            onChange={(e) => {
              nameEdited.current = true;
              setTypedName(e.target.value);
            }}
            placeholder="e.g. Prof. Bob Karankay Conteh"
          />
        </div>
      )}

      <div>
        <p className="text-[#022448] text-xs font-semibold uppercase tracking-widest mb-2">
          Preview
        </p>
        <div className="bg-white border border-[#c4c6cf]/30 rounded-[10px] p-4 min-h-[80px] flex items-center justify-center">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Signature preview" className="max-h-16 max-w-full object-contain" />
          ) : mode === "type" && typedName ? (
            <p
              className="text-2xl italic text-[#022448]"
              style={{ fontFamily: '"Segoe Script", "Brush Script MT", cursive' }}
            >
              {typedName}
            </p>
          ) : (
            <p className="text-[#74777f] text-xs">No signature yet</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <ActionButton
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="cred-btn cred-btn-primary gap-2 self-start"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          {saving ? "Saving…" : "Save Signature"}
        </ActionButton>
        {allowSkip && (
          <button
            type="button"
            onClick={() => onSkip?.()}
            className="px-5 py-2.5 rounded-[12px] border border-[#c4c6cf]/40 text-[#43474e] text-sm font-medium hover:bg-[#eef4ff]"
          >
            Skip for now
          </button>
        )}
      </div>
    </div>
  );
}
