"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  AlertTriangle, Bell, CheckCircle2, HelpCircle,
  Loader2, ScanLine, XCircle,
} from "lucide-react";
import { parseCertificateIdFromScan } from "@/lib/parseCertificateScan";
import { useCaptcha } from "@/hooks/useCaptcha";

const QrScanner = dynamic(() => import("@/components/QrScanner"), { ssr: false });

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000/api";

const OUTCOMES = {
  valid:            { icon: CheckCircle2,  color: "text-[#2F6F4E]", bg: "bg-[#E7F1EB] border-[#2F6F4E]/20", label: "Valid" },
  revoked:          { icon: XCircle,       color: "text-[#A23B34]", bg: "bg-[#F5E5E3] border-[#A23B34]/20", label: "Revoked" },
  tampered:         { icon: AlertTriangle, color: "text-[#A9721F]", bg: "bg-[#F5EBDB] border-[#A9721F]/20", label: "Tampered" },
  not_verified:     { icon: AlertTriangle, color: "text-[#A9721F]", bg: "bg-[#F5EBDB] border-[#A9721F]/20", label: "Not yet issued" },
  not_found:        { icon: HelpCircle,    color: "text-[#4A5A68]", bg: "bg-[#EAF2FB] border-[#CFE1F2]",    label: "Not Found" },
  captcha_required: { icon: AlertTriangle, color: "text-[#A9721F]", bg: "bg-[#F5EBDB] border-[#A9721F]/20", label: "Please complete the CAPTCHA and try again" },
};

// ─── Consent request flow ─────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 5000;

/**
 * ConsentRequestFlow
 *
 * Shown below the verify result (or instead of it) so an employer can request
 * live consent from the certificate holder.
 *
 * States:
 *   idle      → form to submit name / org
 *   pending   → polling loop + countdown
 *   approved  → result injected back into parent via onApproved(certPayload)
 *   denied    → message
 *   expired   → message
 */
function ConsentRequestFlow({ certId, onApproved, initialRequestId = null }) {
  const [phase,  setPhase]  = useState(initialRequestId ? "pending" : "idle");
  const [name,   setName]   = useState("");
  const [org,    setOrg]    = useState("");
  const [email,  setEmail]  = useState("");
  const [error,  setError]  = useState("");
  const [requestId,  setRequestId]  = useState(initialRequestId);
  const [expiresAt,  setExpiresAt]  = useState(null);
  const [msLeft,     setMsLeft]     = useState(null);
  const pollRef = useRef(null);

  // Countdown timer
  useEffect(() => {
    if (!expiresAt || phase !== "pending") return;
    const id = setInterval(() => {
      const left = Math.max(0, new Date(expiresAt) - Date.now());
      setMsLeft(left);
      if (left === 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt, phase]);

  // Polling loop
  useEffect(() => {
    if (phase !== "pending" || !requestId) return;

    async function poll() {
      try {
        const res = await fetch(`${API_BASE}/verify/consent/${requestId}/`);
        const data = await res.json();
        if (data.status === "approved") {
          clearInterval(pollRef.current);
          setPhase("approved");
          // data.certificate is the full _build_payload() object
          if (onApproved && data.certificate) onApproved(data.certificate);
        } else if (data.status === "denied") {
          clearInterval(pollRef.current);
          setPhase("denied");
        } else if (data.status === "expired") {
          clearInterval(pollRef.current);
          setPhase("expired");
        }
      } catch {
        // network hiccup — keep polling
      }
    }

    poll(); // immediate first check
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [phase, requestId, onApproved]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setPhase("submitting"); setError("");
    try {
      const res = await fetch(
        `${API_BASE}/verify/${encodeURIComponent(certId)}/request-consent/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            verifier_name:  name.trim(),
            verifier_org:   org.trim(),
            verifier_email: email.trim(),
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Failed to send consent request.");
        setPhase("idle");
        return;
      }
      setRequestId(data.request_id);
      setExpiresAt(data.expires_at);
      setMsLeft(data.ttl_minutes * 60 * 1000);
      setPhase("pending");
    } catch {
      setError("Network error. Please try again.");
      setPhase("idle");
    }
  }

  function reset() {
    clearInterval(pollRef.current);
    setPhase("idle"); setRequestId(null); setExpiresAt(null);
    setMsLeft(null); setError(""); setName(""); setOrg(""); setEmail("");
  }

  const minLeft = msLeft !== null ? Math.ceil(msLeft / 60000) : null;
  const secLeft = msLeft !== null ? Math.floor((msLeft % 60000) / 1000) : null;

  // ── Approved ──
  if (phase === "approved") {
    return (
      <div className="flex items-center gap-3 bg-[#E7F1EB] border border-[#2F6F4E]/20 rounded-xl px-4 py-3">
        <CheckCircle2 size={18} className="text-[#2F6F4E] shrink-0" />
        <p className="text-[#2F6F4E] text-sm font-semibold">
          Student approved — certificate details loaded above.
        </p>
      </div>
    );
  }

  // ── Denied ──
  if (phase === "denied") {
    return (
      <div className="flex flex-col gap-2 bg-[#F5E5E3] border border-[#A23B34]/20 rounded-xl px-4 py-3">
        <p className="text-[#A23B34] text-sm font-semibold">Consent denied by the certificate holder.</p>
        <button onClick={reset} className="text-[#A23B34] text-xs underline self-start">Try again</button>
      </div>
    );
  }

  // ── Expired ──
  if (phase === "expired") {
    return (
      <div className="flex flex-col gap-2 bg-[#F5EBDB] border border-[#A9721F]/20 rounded-xl px-4 py-3">
        <p className="text-[#A9721F] text-sm font-semibold">Consent request expired without a response.</p>
        <button onClick={reset} className="text-[#A9721F] text-xs underline self-start">Send a new request</button>
      </div>
    );
  }

  // ── Polling / pending ──
  if (phase === "pending") {
    return (
      <div className="border border-[#E4E1D6] rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3.5 bg-[#EAF2FB]">
          <Loader2 size={16} className="text-[#08283F] animate-spin shrink-0" />
          <div className="min-w-0">
            <p className="text-[#08283F] text-sm font-semibold">Waiting for student approval…</p>
            <p className="text-[#4A5A68] text-xs mt-0.5">
              A WhatsApp message has been sent. Request expires in{" "}
              <span className="font-semibold text-[#08283F]">
                {minLeft !== null ? `${minLeft}m ${secLeft}s` : "…"}
              </span>
            </p>
          </div>
        </div>
        <div className="px-4 py-2.5 border-t border-[#E4E1D6] flex items-center justify-between">
          <p className="text-[#8A929C] text-xs">Checking every 5 seconds…</p>
          <button onClick={reset} className="text-[#A23B34] text-xs hover:underline">Cancel</button>
        </div>
      </div>
    );
  }

  // ── Idle / submitting — form ──
  return (
    <div className="border border-[#E4E1D6] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 bg-[#F8F7F2] border-b border-[#E4E1D6]">
        <Bell size={15} className="text-[#B98A28] shrink-0" />
        <p className="text-[#08283F] text-sm font-semibold">Request live consent</p>
      </div>
      <form onSubmit={handleSubmit} className="px-4 py-4 flex flex-col gap-3">
        <p className="text-[#4A5A68] text-xs leading-relaxed">
          Don&apos;t have a share code? Enter your details and we&apos;ll send the certificate holder a
          WhatsApp notification asking them to approve this verification.
        </p>
        {error && <p className="text-[#A23B34] text-xs">{error}</p>}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <input
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your name *"
            maxLength={200}
            className="flex-1 text-sm border border-[#E4E1D6] rounded-lg px-3 py-2.5 text-[#08283F] placeholder-[#8A929C] outline-none focus:border-[#08283F] bg-white"
          />
          <input
            value={org}
            onChange={e => setOrg(e.target.value)}
            placeholder="Organisation (optional)"
            maxLength={200}
            className="flex-1 text-sm border border-[#E4E1D6] rounded-lg px-3 py-2.5 text-[#08283F] placeholder-[#8A929C] outline-none focus:border-[#08283F] bg-white"
          />
        </div>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Your email (optional — for follow-up)"
          maxLength={254}
          className="text-sm border border-[#E4E1D6] rounded-lg px-3 py-2.5 text-[#08283F] placeholder-[#8A929C] outline-none focus:border-[#08283F] bg-white"
        />
        <button
          type="submit"
          disabled={phase === "submitting" || !name.trim()}
          className="self-start flex items-center gap-2 bg-[#08283F] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {phase === "submitting"
            ? <><Loader2 size={14} className="animate-spin" /> Sending…</>
            : <><Bell size={14} /> Send Consent Request</>
          }
        </button>
      </form>
    </div>
  );
}

export default function CertificateVerifyPanel({
  initialId = "",
  variant = "dashboard",
  autoVerify = false,
  initialConsentId = "",   // if set, skip verify form and go straight to consent polling
}) {
  const [certId,        setCertId]        = useState(initialId);
  const [result,        setResult]        = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [scanning,      setScanning]      = useState(false);
  const [consentResult, setConsentResult] = useState(null);
  // If the page loaded with ?consent=<id>, jump straight to polling
  const [directConsentId, setDirectConsentId] = useState(initialConsentId || null);
  const { captchaNode, execute: runCaptcha } = useCaptcha();

  async function verify(id) {
    const parsed = parseCertificateIdFromScan(id || certId);
    if (!parsed) return;
    setCertId(parsed);
    setLoading(true);
    setResult(null);
    setConsentResult(null);
    try {
      const captchaToken = await runCaptcha();
      const headers = { "Content-Type": "application/json" };
      if (captchaToken) headers["X-Captcha-Token"] = captchaToken;

      const res  = await fetch(`${API_BASE}/verify/${encodeURIComponent(parsed)}/`, { headers });
      const data = await res.json();

      if (res.status === 403 && data.captcha_required) {
        setResult({ found: false, verification_outcome: "captcha_required" });
      } else {
        setResult(data);
      }
    } catch {
      setResult({ found: false, verification_outcome: "not_found" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (autoVerify && initialId) verify(initialId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoVerify, initialId]);

  // When consent is approved, merge the approved cert data into result
  function handleConsentApproved(certPayload) {
    setConsentResult(certPayload);
    // Inject as a valid result so the cert detail grid renders
    setResult({
      found: true,
      verification_outcome: certPayload.verification_outcome ?? "valid",
      status: certPayload.status,
      certificate: certPayload.certificate ?? certPayload,
    });
  }

  const outcome   = result ? OUTCOMES[result.verification_outcome] ?? OUTCOMES.not_found : null;
  const isDark    = variant === "dark";

  const showConsentFlow =
    !consentResult &&
    certId.trim().length > 3 &&
    result !== null &&
    result.verification_outcome !== "captcha_required";

  // ── Direct consent poll mode (employer landed via poll_url) ──────────────
  if (directConsentId) {
    return (
      <div className="flex flex-col gap-5 w-full">
        <ConsentRequestFlow
          certId={certId.trim() || "—"}
          initialRequestId={directConsentId}
          onApproved={(certPayload) => {
            setDirectConsentId(null);
            handleConsentApproved(certPayload);
          }}
        />
        {/* Show cert detail if approved */}
        {result && outcome && result.found && result.certificate && (
          <div className={isDark ? "bg-[#F8F7F2] text-[#1B2734] rounded-md p-8" : "dash-card p-5"}>
            <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border mb-5 ${outcome.bg}`}>
              <outcome.icon size={20} className={`${outcome.color} shrink-0`} />
              <p className={`font-bold text-base ${outcome.color}`}>{outcome.label}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {[
                ["Certificate ID",  result.certificate.certificate_id],
                ["Student",         result.certificate.student_name],
                ["Degree",          result.certificate.degree_title],
                ["Institution",     result.certificate.institution_name],
                ["Graduation Year", result.certificate.graduation_year],
                ["Issued At",       result.certificate.chain_issued_at ?? "—"],
              ].map(([label, value]) => (
                <div key={label} className="bg-[#F8F7F2] rounded-lg px-3 py-2.5 border border-[#E4E1D6]">
                  <p className="text-[#8A929C] text-xs font-semibold uppercase tracking-wider mb-0.5">{label}</p>
                  <p className="text-[#08283F] text-sm font-medium break-all">{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 w-full">
      <div className={isDark ? "" : "dash-card p-5"}>
        {!isDark && <label className="cd-label mb-2.5">Certificate ID or QR</label>}
        {isDark && (
          <label className="block text-[0.875rem] font-medium mb-2.5 text-[#B9C6D2]">
            Certificate ID or QR
          </label>
        )}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <input
            value={certId}
            onChange={(e) => setCertId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && verify()}
            placeholder="e.g. CR-2026-CUSL-A3F92C01"
            className={isDark
              ? "flex-1 px-[14px] py-[13px] border border-[#E4E1D6] rounded text-[0.95rem] text-[#1B2734] bg-white outline-none focus:outline-2 focus:outline-[#08283F]"
              : "cd-input"}
          />
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => setScanning(true)}
              className={isDark
                ? "inline-flex items-center justify-center gap-2 px-4 rounded border border-white/30 text-[#F8F7F2] font-semibold text-sm hover:bg-white/10 whitespace-nowrap"
                : "cd-btn-secondary whitespace-nowrap"}
            >
              <ScanLine size={16} /> Scan QR
            </button>
            <button
              type="button"
              onClick={() => verify()}
              disabled={loading}
              className={isDark
                ? "bg-[#F8F7F2] text-[#08283F] rounded px-6 font-semibold text-[1rem] whitespace-nowrap disabled:opacity-60"
                : "cd-btn-primary px-6 whitespace-nowrap disabled:opacity-60"}
            >
              {loading ? "Checking…" : "Verify"}
            </button>
          </div>
        </div>
      </div>

      {/* Verification result */}
      {result && outcome && (
        <div className={isDark ? "bg-[#F8F7F2] text-[#1B2734] rounded-md p-8" : "dash-card p-5"}>
          <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border mb-5 ${outcome.bg}`}>
            <outcome.icon size={20} className={`${outcome.color} shrink-0`} />
            <div>
              <p className={`font-bold text-base ${outcome.color}`}>{outcome.label}</p>
              <p className="text-[#4A5A68] text-xs">Verification outcome</p>
            </div>
          </div>

          {result.found && result.certificate && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {[
                ["Certificate ID",  result.certificate.certificate_id],
                ["Student",         result.certificate.student_name],
                ["Degree",          result.certificate.degree_title],
                ["Institution",     result.certificate.institution_name],
                ["Graduation Year", result.certificate.graduation_year],
                ["Issued At",       result.certificate.chain_issued_at ?? "—"],
                ["Tx Hash",         result.certificate.tx_hash || "—"],
              ].map(([label, value]) => (
                <div key={label} className="bg-[#F8F7F2] rounded-lg px-3 py-2.5 border border-[#E4E1D6]">
                  <p className="text-[#8A929C] text-xs font-semibold uppercase tracking-wider mb-0.5">{label}</p>
                  <p className="text-[#08283F] text-sm font-medium break-all">{value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Employer consent request flow */}
      {showConsentFlow && (
        <ConsentRequestFlow
          certId={certId.trim()}
          onApproved={handleConsentApproved}
        />
      )}

      {scanning && (
        <QrScanner
          open
          onClose={() => setScanning(false)}
          onScan={(id) => verify(id)}
        />
      )}

      {captchaNode}
    </div>
  );
}
