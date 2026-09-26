"use client";
/**
 * /dashboard/verifications — student verification hub
 *
 * Tab 1 — Share Codes
 *   All active employer share codes across every issued certificate.
 *   Student can generate new codes and revoke existing ones.
 *
 * Tab 2 — Consent Requests  (populated by Phase E)
 *   Incoming live-consent verification requests from employers who didn't
 *   have a pre-shared code.  Student can approve or deny each one.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Loader2, Share2, Bell, Plus, Trash2, Copy,
  Check, ChevronDown, ChevronUp,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth, ROLES } from "@/lib/useAuth";
import { verificationSharePath } from "@/lib/parseCertificateScan";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000/api";
const FRONTEND = typeof window !== "undefined" ? window.location.origin : "";

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: "numeric",
  });
}

function shareUrl(certificateId, rawCode) {
  return `${FRONTEND}${verificationSharePath(certificateId, rawCode)}`;
}

// ─── Share code row ───────────────────────────────────────────────────────────

function ShareCodeRow({ sc, certId, onRevoked }) {
  const [revoking, setRevoking] = useState(false);
  const [copied,   setCopied]   = useState(false);

  async function handleRevoke() {
    if (!confirm("Revoke this share code? The employer link will stop working immediately.")) return;
    setRevoking(true);
    try {
      await api.delete(`/my-certificates/${certId}/share-codes/${sc.id}/`);
      onRevoked(sc.id);
    } catch {
      alert("Failed to revoke. Please try again.");
      setRevoking(false);
    }
  }

  async function handleCopy() {
    // codes listing doesn't return raw code (only shown at creation time)
    // so we copy the share_url hint pattern so the employer can re-use the URL
    try {
      await navigator.clipboard.writeText(sc.share_url || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[#F8F7F2] transition-colors">
      <div className="min-w-0 flex-1">
        <p className="text-[#08283F] text-sm font-medium truncate">
          {sc.label || <span className="text-[#8A929C] italic">Unlabelled</span>}
          {sc.single_use && (
            <span className="ml-2 text-xs bg-[#B98A28]/10 text-[#B98A28] px-2 py-0.5 rounded-full font-semibold">
              single-use
            </span>
          )}
          {sc.used && (
            <span className="ml-2 text-xs bg-[#4A5A68]/10 text-[#4A5A68] px-2 py-0.5 rounded-full">
              used
            </span>
          )}
        </p>
        <p className="text-[#8A929C] text-xs mt-0.5">
          Created {fmtDate(sc.created_at)}
          {sc.expires_at ? ` · Expires ${fmtDate(sc.expires_at)}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {sc.share_url && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-[#4A5A68] text-xs hover:text-[#08283F] transition-colors"
            title="Copy share URL"
          >
            {copied ? <Check size={13} className="text-[#2F6F4E]" /> : <Copy size={13} />}
            <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
          </button>
        )}
        <button
          onClick={handleRevoke}
          disabled={revoking}
          className="flex items-center gap-1 text-[#A23B34] text-xs font-semibold hover:underline disabled:opacity-50"
          title="Revoke this code"
        >
          {revoking ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          <span className="hidden sm:inline">Revoke</span>
        </button>
      </div>
    </div>
  );
}

// ─── Per-certificate expandable section ──────────────────────────────────────

function CertShareSection({ cert, defaultOpen = false }) {
  const [open,     setOpen]     = useState(defaultOpen);
  const [codes,    setCodes]    = useState(cert.share_codes ?? []);
  const [loading,  setLoading]  = useState(false);
  const [creating, setCreating] = useState(false);
  const [label,    setLabel]    = useState("");
  const [singleUse, setSingleUse] = useState(false);
  const [newCode,  setNewCode]  = useState(null);
  const [error,    setError]    = useState("");

  const loadCodes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get(`/my-certificates/${cert.certificate_id}/share-codes/`);
      setCodes(Array.isArray(data) ? data : data.results ?? []);
    } catch {
      setError("Could not load codes.");
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
      setNewCode(data);
      setLabel(""); setSingleUse(false);
      loadCodes();
    } catch (e) {
      setError(e?.detail || "Failed to create.");
    } finally {
      setCreating(false);
    }
  }

  function handleRevoked(id) {
    setCodes(prev => prev.filter(sc => sc.id !== id));
  }

  return (
    <div className="border border-[#E4E1D6] rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-3.5 bg-[#F8F7F2] hover:bg-[#EAF2FB] transition-colors text-left"
      >
        <div className="min-w-0">
          <p className="text-[#08283F] text-sm font-semibold truncate">{cert.degree_title}</p>
          <p className="text-[#4A5A68] text-xs mt-0.5 font-mono">{cert.certificate_id}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          <span className="text-[#4A5A68] text-xs">{codes.length} code{codes.length !== 1 ? "s" : ""}</span>
          {open ? <ChevronUp size={15} className="text-[#4A5A68]" /> : <ChevronDown size={15} className="text-[#4A5A68]" />}
        </div>
      </button>

      {open && (
        <div className="divide-y divide-[#E4E1D6]">
          {/* New code banner (shown once after creation) */}
          {newCode && (
            <div className="bg-[#E7F1EB] border-b border-[#2F6F4E]/20 px-4 py-3 flex flex-col gap-1.5">
              <p className="text-[#2F6F4E] text-xs font-semibold">
                ✓ Share code created{newCode.label ? ` — ${newCode.label}` : ""}
              </p>
              <p className="font-mono text-[#08283F] text-xs break-all">{newCode.share_url}</p>
              <p className="text-[#4A5A68] text-[10px]">
                This link is shown once only — copy it now and send it to the employer.
              </p>
            </div>
          )}

          {error && (
            <div className="bg-[#F5E5E3] text-[#A23B34] text-xs px-4 py-2">{error}</div>
          )}

          {/* Code rows */}
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 size={16} className="text-[#08283F] animate-spin" />
            </div>
          ) : codes.length === 0 ? (
            <p className="text-[#8A929C] text-xs px-4 py-3">No active codes.</p>
          ) : (
            <div className="divide-y divide-[#E4E1D6]">
              {codes.map(sc => (
                <ShareCodeRow key={sc.id} sc={sc} certId={cert.certificate_id} onRevoked={handleRevoked} />
              ))}
            </div>
          )}

          {/* Create form */}
          <form onSubmit={handleCreate} className="px-4 py-3 bg-[#FAFAFA] flex flex-col gap-2.5">
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
              Single-use (invalidated after first successful verify)
            </label>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Share codes tab ──────────────────────────────────────────────────────────

function ShareCodesTab() {
  const [certs,   setCerts]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    api.get("/my-certificates/")
      .then(data => {
        const all = Array.isArray(data) ? data : data.results ?? [];
        setCerts(all.filter(c => c.status === "issued"));
      })
      .catch(() => setError("Could not load certificates."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 size={22} className="text-[#08283F] animate-spin" /></div>;
  }
  if (error) {
    return <div className="bg-[#F5E5E3] text-[#A23B34] text-sm px-4 py-3 rounded-lg">{error}</div>;
  }
  if (certs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <Share2 size={28} className="text-[#c4c6cf]" />
        <p className="text-[#43474e] text-sm">No issued certificates yet.</p>
        <p className="text-[#8A929C] text-xs max-w-xs">
          Share codes become available once your institution anchors a certificate on-chain.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[#4A5A68] text-sm leading-relaxed">
        Generate a share link for each certificate. Send the link to an employer — they can verify
        your credential without a CAPTCHA or account. You can revoke any link instantly.
      </p>
      {certs.map(cert => (
        <CertShareSection key={cert.id} cert={cert} />
      ))}
    </div>
  );
}

// ─── Consent requests tab (Phase E) ──────────────────────────────────────────

function ConsentRequestCard({ cr, onResponded }) {
  const [busy,    setBusy]    = useState(null); // "approve" | "deny" | null
  const [error,   setError]   = useState("");

  // Time remaining until expiry
  const msLeft = Math.max(0, new Date(cr.expires_at) - Date.now());
  const minLeft = Math.ceil(msLeft / 60000);

  async function respond(action) {
    setBusy(action); setError("");
    try {
      await api.post(`/verify/consent/${cr.id}/respond/`, { action });
      onResponded(cr.id, action);
    } catch (e) {
      setError(e?.detail || "Failed. Please try again.");
      setBusy(null);
    }
  }

  return (
    <div className="border border-[#E4E1D6] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3.5 bg-[#F8F7F2] flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[#08283F] text-sm font-semibold truncate">
            {cr.verifier_name}
            {cr.verifier_org && (
              <span className="text-[#4A5A68] font-normal"> · {cr.verifier_org}</span>
            )}
          </p>
          <p className="text-[#8A929C] text-xs mt-0.5 font-mono">{cr.certificate_id}</p>
        </div>
        <span className="shrink-0 text-[#B98A28] text-xs font-semibold bg-[#B98A28]/10 px-2.5 py-1 rounded-full">
          {minLeft > 0 ? `${minLeft}m left` : "Expiring"}
        </span>
      </div>

      {/* Body */}
      <div className="px-4 py-3 flex flex-col gap-3">
        <p className="text-[#4A5A68] text-sm">
          <span className="font-semibold text-[#08283F]">{cr.verifier_name}</span>
          {cr.verifier_org ? ` from ${cr.verifier_org}` : ""} wants to verify your&nbsp;
          <span className="font-semibold text-[#08283F]">{cr.certificate_id}</span> certificate.
          Approving will show them the full certificate details.
        </p>

        {error && (
          <p className="text-[#A23B34] text-xs">{error}</p>
        )}

        <div className="flex gap-2.5">
          <button
            onClick={() => respond("approve")}
            disabled={!!busy}
            className="flex-1 flex items-center justify-center gap-1.5 bg-[#2F6F4E] text-white text-sm font-semibold py-2.5 rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {busy === "approve" ? <Loader2 size={14} className="animate-spin" /> : "✓"}
            Approve
          </button>
          <button
            onClick={() => respond("deny")}
            disabled={!!busy}
            className="flex-1 flex items-center justify-center gap-1.5 border border-[#A23B34] text-[#A23B34] text-sm font-semibold py-2.5 rounded-xl hover:bg-[#A23B34]/5 disabled:opacity-50 transition-colors"
          >
            {busy === "deny" ? <Loader2 size={14} className="animate-spin" /> : "✗"}
            Deny
          </button>
        </div>
      </div>
    </div>
  );
}

function ConsentRequestsTab() {
  const [requests, setRequests] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await api.get("/verify/consent/pending/");
      setRequests(Array.isArray(data) ? data : data.results ?? []);
    } catch {
      setError("Could not load consent requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Poll every 15 seconds for new requests
  useEffect(() => {
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  function handleResponded(id, action) {
    // Optimistically remove from list
    setRequests(prev => prev.filter(r => r.id !== id));
  }

  if (loading && requests.length === 0) {
    return <div className="flex justify-center py-12"><Loader2 size={22} className="text-[#08283F] animate-spin" /></div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-[#4A5A68] text-sm leading-relaxed">
          Employers who don&apos;t have a share code can request live consent. You have
          {" "}<span className="font-semibold text-[#08283F]">30 minutes</span> to respond
          before each request expires.
        </p>
        <button
          onClick={load}
          className="shrink-0 text-[#4A5A68] text-xs hover:text-[#08283F] transition-colors ml-3"
          title="Refresh"
        >
          ↻ Refresh
        </button>
      </div>

      {error && (
        <div className="bg-[#F5E5E3] text-[#A23B34] text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      {requests.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <Bell size={28} className="text-[#c4c6cf]" />
          <p className="text-[#43474e] text-sm">No pending consent requests.</p>
          <p className="text-[#8A929C] text-xs max-w-xs">
            When an employer requests live verification, it will appear here. This page
            auto-refreshes every 15 seconds.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {requests.map(cr => (
            <ConsentRequestCard key={cr.id} cr={cr} onResponded={handleResponded} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VerificationsPage() {
  const { role, loading: authLoading } = useAuth();
  const [tab, setTab] = useState("codes"); // "codes" | "consent"
  const [pendingCount, setPendingCount] = useState(0);

  // Poll pending consent count for the badge
  useEffect(() => {
    if (!authLoading && (role === ROLES.STUDENT || role === ROLES.SUPER_ADMIN)) {
      const fetchCount = () =>
        api.get("/verify/consent/pending/")
          .then(data => setPendingCount((Array.isArray(data) ? data : data.results ?? []).length))
          .catch(() => {});
      fetchCount();
      const id = setInterval(fetchCount, 15000);
      return () => clearInterval(id);
    }
  }, [role, authLoading]);

  if (authLoading) {
    return <div className="flex justify-center py-16"><Loader2 size={28} className="text-[#022448] animate-spin" /></div>;
  }

  if (role && role !== ROLES.STUDENT && role !== ROLES.SUPER_ADMIN) {
    return <p className="text-[#C62828] text-sm">Student access only.</p>;
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Header */}
      <div>
        <h2 className="text-[#022448] font-bold text-xl">Verifications</h2>
        <p className="text-[#43474e] text-sm mt-1">
          Manage employer share codes and incoming consent requests for your certificates.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#E4E1D6]">
        <button
          onClick={() => setTab("codes")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            tab === "codes"
              ? "border-[#08283F] text-[#08283F]"
              : "border-transparent text-[#4A5A68] hover:text-[#08283F]"
          }`}
        >
          <Share2 size={15} /> Share Codes
        </button>
        <button
          onClick={() => setTab("consent")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            tab === "consent"
              ? "border-[#08283F] text-[#08283F]"
              : "border-transparent text-[#4A5A68] hover:text-[#08283F]"
          }`}
        >
          <Bell size={15} />
          Consent Requests
          {pendingCount > 0 && (
            <span className="ml-1.5 bg-[#A23B34] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* Tab content */}
      {tab === "codes"   && <ShareCodesTab />}
      {tab === "consent" && <ConsentRequestsTab />}
    </div>
  );
}
