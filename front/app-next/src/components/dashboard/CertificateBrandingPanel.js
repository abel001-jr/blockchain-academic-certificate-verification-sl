"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Check, Upload, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { PRESET_LIST, SAMPLE_CERT } from "@/lib/certPresets";
import CertificatePreview from "@/components/dashboard/CertificatePreview";

const API_BASE = "http://127.0.0.1:8000/api";

export default function CertificateBrandingPanel() {
  const [preset, setPreset] = useState("classic_navy");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoFile, setLogoFile] = useState(null);
  const [institutionName, setInstitutionName] = useState(SAMPLE_CERT.institution_name);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [clearLogo, setClearLogo] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.get("/certificate-branding/");
      setPreset(data.preset || "classic_navy");
      setLogoUrl(data.logo_url || "");
      if (data.institution_name) setInstitutionName(data.institution_name);
    } catch (e) {
      setError(e?.detail || "Failed to load branding settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSuccess("");
    setError("");
    try {
      const token = localStorage.getItem("access_token");
      const fd = new FormData();
      fd.append("preset", preset);
      if (logoFile) fd.append("logo", logoFile);
      if (clearLogo && !logoFile) fd.append("clear_logo", "true");

      const res = await fetch(`${API_BASE}/certificate-branding/`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw data;

      setPreset(data.preset);
      setLogoUrl(data.logo_url || "");
      setLogoFile(null);
      setClearLogo(false);
      setSuccess("Certificate branding saved. It applies to every new certificate.");
    } catch (err) {
      setError(err?.detail || err?.preset?.[0] || JSON.stringify(err));
    } finally {
      setSaving(false);
    }
  }

  const previewLogo =
    logoFile ? URL.createObjectURL(logoFile) : clearLogo ? "" : logoUrl;

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin text-[#022448]" size={24} />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-6">
      <div>
        <h3 className="text-[#022448] font-semibold text-base">Certificate Branding</h3>
        <p className="text-[#43474e] text-sm mt-1">
          Choose a theme and optional crest. Saved once — applies to every certificate from this institution.
        </p>
      </div>

      {success && (
        <div className="bg-[#2E7D32]/10 text-[#2E7D32] text-sm px-4 py-3 rounded-lg flex items-center gap-2">
          <Check size={14} /> {success}
        </div>
      )}
      {error && (
        <div className="bg-[#ffdad6] text-[#93000a] text-sm px-4 py-3 rounded-lg">⚠ {error}</div>
      )}

      <div>
        <p className="text-[#022448] text-xs font-semibold uppercase tracking-widest mb-3">Theme</p>
        <div className="flex flex-wrap gap-3">
          {PRESET_LIST.map((p) => {
            const selected = preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] border transition-all text-left ${
                  selected
                    ? "border-[#022448] bg-[#eef4ff] ring-1 ring-[#022448]/20"
                    : "border-[#c4c6cf]/40 hover:border-[#022448]/30"
                }`}
              >
                <span
                  className="w-8 h-8 rounded-full shrink-0 border border-black/10"
                  style={{
                    background: `linear-gradient(135deg, ${p.primary} 55%, ${p.accent})`,
                  }}
                />
                <span className="text-[#022448] text-xs font-semibold">{p.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-[#022448] text-xs font-semibold uppercase tracking-widest mb-2">
          Logo / Crest (optional)
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[10px] border border-[#c4c6cf]/40 text-sm text-[#022448] font-medium cursor-pointer hover:bg-[#eef4ff]">
            <Upload size={14} />
            {logoFile ? logoFile.name : "Upload image"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                setLogoFile(e.target.files?.[0] ?? null);
                setClearLogo(false);
              }}
            />
          </label>
          {(logoUrl || logoFile) && !clearLogo && (
            <button
              type="button"
              onClick={() => {
                setLogoFile(null);
                setClearLogo(true);
              }}
              className="inline-flex items-center gap-1.5 text-xs text-[#C62828] font-medium hover:underline"
            >
              <Trash2 size={12} /> Remove logo
            </button>
          )}
        </div>
      </div>

      <div>
        <p className="text-[#022448] text-xs font-semibold uppercase tracking-widest mb-3">
          Live preview
        </p>
        <CertificatePreview
          certificate={SAMPLE_CERT}
          presetId={preset}
          logoUrl={previewLogo}
          institutionName={institutionName}
        />
      </div>

      <button
        type="submit"
        disabled={saving}
        className="flex items-center gap-2 bg-[#022448] text-white px-6 py-3 rounded-[12px] text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-60 self-start"
      >
        {saving && <Loader2 size={14} className="animate-spin" />}
        {saving ? "Saving…" : "Save branding"}
      </button>
    </form>
  );
}
