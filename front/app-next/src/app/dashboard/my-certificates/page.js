"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Loader2, ScrollText, Share2, Copy, Trash2,
  ChevronDown, ChevronUp, Check, Plus,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth, ROLES } from "@/lib/useAuth";
import StatusBadge from "@/components/dashboard/StatusBadge";
import CertificateQrCard from "@/components/CertificateQrCard";

// ─── Share code panel for one certificate ────────────────────────────────────

function ShareCodePanel({ cert }) {
  const [open,     setOpen]     = useState(false);
  const [codes,    setCodes]    = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [creating, setCreating] = useState(false);
  const [newCode,  setNewCode]  = useState(null);   // { code, share_url } returned once
  const [label,    setLabel]    = useState("");
  const [singleUse, setSingleUse] = useState(false);
  const [copiedId, setCopiedId]   = useState(null);
  const [error,    setError]    = useState("");

  const loadCodes = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.get(`/my-certificates/${cert.certificate_id}/share-codes/`);
      setCodes(Array.isArray(data) ? data : data.results ?? []);
    } catch {
      setError("Could not load share codes.");
    } finally {
      setLoading(false);
    }
  }, [cert.certificate_id]);

  function toggle() {
    if (!open) loadCodes();
    setOpen(o => !o);
    setNewCode(null);
    setError("");
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true); setError(""); setNewCode(null);
    try {
      const data = await api.post(
        `/my-certificates/${cert.certificate_id}/share-codes/`,
        { label: label.trim(), single_use: singleUse },
      );
      setNewCode({ code: data.code, share_url: data.share_url, label: data.label });
      setLabel(""); setSingleUse(false);
      loadCodes();
    } catch (e) {
      setError(e?.detail || "Failed to create share code.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(codeId) {
    if (!confirm("Revoke this share code? The employer link will stop working immediately.")) return;
    try {
      await api.delete(`/my-certificates/${cert.certificate_id}/share-codes/${codeId}/`);
      loadCodes();
    } catch (e) {
      setError(e?.detail || "Failed to revoke.");
    }
  }

  async function copyToClipboard(text, id) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="border-t border-[#E4E1D6]">
      {/* Toggle */}
      <button
        onClick={toggle}
        className="w-full flex items-center gap-2 px-6 py-2.5 text-xs font-semibold text-[#4A5A68] hover:text-[#08283F] hover:bg-[#F8F7F2] transition-colors"
        aria-expanded={open}
      >
        <Share2 size={13} />
        Share Codes
        {open ? <ChevronUp size={13} className="ml-auto" /> : <ChevronDown size={13} className="ml-auto" />}
      </button>

      {open && (
        <div className="px-6 pb-5 flex flex-col gap-4">

          {/* Explanation */}
          <p className="text-[#4A5A68] text-xs leading-relaxed">
            Generate a share link for an employer. They visit the link to verify your
            certificate — no CAPTCHA, no login required. You can revoke it any time.
          </p>

          {error && (
            <div className="bg-[#F5E5E3] text-[#A23B34] text-xs px-3 py-2 rounded-lg">{error}</div>
          )}

          {/* New code just created — show raw code once */}
          {newCode && (
            <div className="bg-[#E7F1EB] border border-[#2F6F4E]/20 rounded-xl p-4 flex flex-col gap-2">
              <p className="text-[#2F6F4E] text-xs font-semibold">
                ✓ Share code created{newCode.label ? ` — ${newCode.label}` : ""}
              </p>
              <p className="text-[#08283F] text-[11px] font-mono break-all">{newCode.share_url}</p>
              <button
                onClick={() => copyToClipboard(newCode.share_url, "new")}
                className="self-start flex items-center gap-1.5 text-[#2F6F4E] text-xs font-semibold hover:underline"
              >
                {copiedId === "new" ? <Check size={12} /> : <Copy size={12} />}
                {copiedId === "new" ? "Copied!" : "Copy link"}
              </button>
              <p className="text-[#4A5A68] text-[10px]">
                This is the only time the raw code is shown. Save it now.
              </p>
            </div>
          )}

          {/* Create form */}
          <form onSubmit={handleCreate} className="flex flex-col gap-2.5">
            <div className="flex gap-2">
              <input
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="Label e.g. Acme Corp (optional)"
                maxLength={100}
                className="flex-1 text-xs border border-[#E4E1D6] rounded-lg px-3 py-2 text-[#08283F] placeholder-[#8A929C] outline-none focus:border-[#08283F] bg-white"
              />
              <button
                type="submit"
                disabled={creating}
                className="flex items-center gap-1.5 bg-[#08283F] text-white text-xs font-semibold px-3.5 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
              >
                {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                {creating ? "Creating…" : "New code"}
              </button>
            </div>
            <label className="flex items-center gap-2 text-xs text-[#4A5A68] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={singleUse}
                onChange={e => setSingleUse(e.target.checked)}
                className="rounded"
              />
              Single-use (code expires after one verification)
            </label>
          </form>

          {/* Active codes list */}
          {loading ? (
            <Loader2 size={14} className="text-[#08283F] animate-spin" />
          ) : codes.length === 0 ? (
            <p className="text-[#8A929C] text-xs">No active share codes.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {codes.map(sc => (
                <div
                  key={sc.id}
                  className="flex items-center justify-between gap-3 bg-[#F8F7F2] border border-[#E4E1D6] rounded-lg px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[#08283F] text-xs font-semibold truncate">
                      {sc.label || "Unlabelled code"}
                      {sc.single_use && (
                        <span className="ml-2 text-[#B98A28] font-normal">single-use</span>
                      )}
                      {sc.used && (
                        <span className="ml-2 text-[#4A5A68] font-normal">used</span>
                      )}
                    </p>
                    {sc.expires_at && (
                      <p className="text-[#8A929C] text-[10px] mt-0.5">
                        Expires {new Date(sc.expires_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleRevoke(sc.id)}
                    className="shrink-0 flex items-center gap-1 text-[#A23B34] text-[11px] font-semibold hover:underline"
                    title="Revoke this code"
                  >
                    <Trash2 size={11} /> Revoke
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MyCertificatesPage() {
  const { role, loading: authLoading } = useAuth();
  const [certs, setCerts] = useState([]);
  const [busy,  setBusy]  = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (role && role !== ROLES.STUDENT && role !== ROLES.SUPER_ADMIN) {
      setBusy(false);
      return;
    }
    api.get("/my-certificates/")
      .then(data => setCerts(data.results ?? data))
      .catch(() => setError("Could not load your certificates."))
      .finally(() => setBusy(false));
  }, [role, authLoading]);

  if (authLoading || busy) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={28} className="text-[#022448] animate-spin" />
      </div>
    );
  }

  if (role && role !== ROLES.STUDENT && role !== ROLES.SUPER_ADMIN) {
    return <p className="text-[#C62828] text-sm">Student access only.</p>;
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      <div>
        <h2 className="text-[#022448] font-bold text-xl">My Certificates</h2>
        <p className="text-[#43474e] text-sm mt-1">
          Credentials issued to your student account.
        </p>
      </div>

      {error && (
        <div className="bg-[#ffdad6] text-[#93000a] text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      {certs.length === 0 ? (
        <div className="bg-white rounded-[14px] border border-[#c4c6cf]/15 py-16 flex flex-col items-center gap-2">
          <ScrollText size={28} className="text-[#c4c6cf]" />
          <p className="text-[#43474e] text-sm">No certificates yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-[14px] border border-[#c4c6cf]/15 divide-y divide-[#c4c6cf]/10 overflow-hidden">
          {certs.map(cert => (
            <div key={cert.id} className="flex flex-col">
              {/* Certificate header row */}
              <div className="flex flex-col gap-4 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-[#022448] text-sm font-semibold truncate">
                      {cert.degree_title}
                    </p>
                    <p className="text-[#43474e] text-xs truncate">{cert.student_name}</p>
                    <p className="font-mono text-[#08283F] text-[11px] mt-1">
                      {cert.certificate_id}
                    </p>
                  </div>
                  <StatusBadge status={cert.status} />
                </div>

                {/* QR card — issued certs only */}
                {cert.status === "issued" && cert.certificate_id && (
                  <CertificateQrCard certificateId={cert.certificate_id} compact />
                )}
              </div>

              {/* Share codes — issued certs only */}
              {cert.status === "issued" && cert.certificate_id && (
                <ShareCodePanel cert={cert} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
