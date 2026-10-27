"use client";
import { ActionButton } from "@/components/ui/AnimatedControls";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  AlertTriangle, BadgeCheck, Bell, CheckCircle2, HelpCircle,
  Loader2, ScanLine, XCircle,
} from "lucide-react";
import { parseCertificateIdFromScan, parseShareCodeFromScan } from "@/lib/parseCertificateScan";
import { useCaptcha } from "@/hooks/useCaptcha";

const QrScanner = dynamic(() => import("@/components/QrScanner"), { ssr: false });

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000/api";

const OUTCOMES = {
  unavailable: { icon: AlertTriangle, color: "text-[#A9721F]", bg: "bg-[#F5EBDB] border-[#A9721F]/20", label: "Verification unavailable" },
  valid:            { icon: CheckCircle2,  color: "text-[#2F6F4E]", bg: "bg-[#E7F1EB] border-[#2F6F4E]/20", label: "Valid" },
  revoked:          { icon: XCircle,       color: "text-[#A23B34]", bg: "bg-[#F5E5E3] border-[#A23B34]/20", label: "Revoked" },
  tampered:         { icon: AlertTriangle, color: "text-[#A9721F]", bg: "bg-[#F5EBDB] border-[#A9721F]/20", label: "Integrity mismatch" },
  not_verified:     { icon: AlertTriangle, color: "text-[#A9721F]", bg: "bg-[#F5EBDB] border-[#A9721F]/20", label: "Not yet issued" },
  not_found:        { icon: HelpCircle,    color: "text-[#4A5A68]", bg: "bg-[#EAF2FB] border-[#CFE1F2]",    label: "Not Found" },
  captcha_required: { icon: AlertTriangle, color: "text-[#A9721F]", bg: "bg-[#F5EBDB] border-[#A9721F]/20", label: "Please complete the CAPTCHA and try again" },
};

function VerificationEvidence({ result }) {
  if (!result?.checks) return result?.message ? <p className="mt-3 text-sm">{result.message}</p> : null;
  const labels = { blockchain: "Blockchain record", data: "Structured credential data", certificate: "Certificate PDF", transcript: "Transcript PDF" };
  const states = { matched: "Matches", mismatch: "Does not match", unavailable: "Unavailable - retry", not_checked: "Not checked", not_applicable: "Not applicable", not_found: "No on-chain record" };
  return <div className="my-4 space-y-3 text-sm">
    <p>{result.message}</p>
    <div className="grid gap-3 sm:grid-cols-2">{Object.entries(result.checks).map(([key, check]) => <section key={key} className="min-w-0 rounded-xl border border-[#E4E1D6] bg-[#F8F7F2] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><h4 className="font-semibold text-[#08283F]">{labels[key] || key}</h4><span className={`rounded-full px-2 py-1 text-xs font-semibold ${check.status === "matched" ? "bg-[#E7F1EB] text-[#2F6F4E]" : check.status === "mismatch" ? "bg-[#F5E5E3] text-[#A23B34]" : "bg-[#EAF2FB] text-[#4A5A68]"}`}>{states[check.status] || check.status}</span></div>
      {check.source && <p className="mt-2 text-xs font-medium text-[#687B8E]">Source: {check.source === "uploaded_file" ? "Your uploaded original PDF" : check.source === "ipfs" ? "Stored institution document" : check.source}</p>}
      {check.explanation && <p className="mt-2 text-xs leading-relaxed text-[#4A5A68]">{check.explanation}</p>}
      {check.status !== "matched" && check.next_step && <p className="mt-3 border-t border-[#E4E1D6] pt-2 text-xs leading-relaxed"><strong>Next step:</strong> {check.next_step}</p>}
    </section>)}</div>
    {result.recommendation && <section className="rounded-xl border border-[#CFE1F2] bg-[#EAF2FB] p-4"><h4 className="font-semibold">How to interpret this report</h4><p className="mt-2 text-sm leading-relaxed">{result.recommendation}</p></section>}
    {result.verified_at && <p className="text-xs text-[#4A5A68]">Checked at {new Date(result.verified_at).toLocaleString()}. Status reflects this check; it can change after issuance or revocation updates.</p>}

    {result.blockchain?.block_number !== undefined && <p className="break-all text-xs text-[#4A5A68]">Network {result.blockchain.chain_id} | Block {result.blockchain.block_number} | Contract {result.blockchain.contract_address}</p>}
    {result.verification_scope === "public" && <p className="text-xs">An ID or QR lookup alone does not check the file in your possession. Upload your original PDF for a file comparison. Fetching stored documents and viewing private details requires student-authorized access.</p>}
  </div>;
}

// ─── Result detail grid ───────────────────────────────────────────────────────

/**
 * Build the "certificate details" grid.
 *
 * Public results include programme, department and graduation year; full scope
 * (share code or granted consent) adds grade and hashes. Rendering
 * the full label list unconditionally produced empty cells, so only the
 * fields actually present are shown.
 */
function detailRows(c) {
  if (!c) return [];
  const all = [
    ["Certificate ID",  c.certificate_id],
    ["Student",         c.student_name],
    ["Institution",     c.institution_name],
    ["Programme",       c.degree_title],
    ["Department",      c.department],
    ["Graduation Year", c.graduation_year],
    ["Grade",           c.grade],
    ["Issued At",       c.chain_issued_at],
    ["Tx Hash",         c.tx_hash],
    ["Revoked At",      c.revoked_at],
    ["Revocation Tx",   c.revocation_tx_hash],
  ];
  return all
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([label, value]) => [label, String(value)]);
}

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

    let polling = false;
    let active = true;
    const controller = new AbortController();
    async function poll() {
      if (polling || !active) return;
      polling = true;
      try {
        const res = await fetch(`${API_BASE}/verify/consent/${requestId}/`, { signal: controller.signal });
        const data = await res.json();
        if (!active) return;
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
        // A failed request can be retried by the next polling tick.
      } finally {
        polling = false;
      }
    }

    poll(); // immediate first check
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => { active = false; controller.abort(); clearInterval(pollRef.current); };
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
  initialShareCode = "",   // ?code=<raw> — unlocks the full (share-scoped) payload
  employerAccess = false,
}) {
  const [certId,        setCertId]        = useState(initialId);
  const [result,        setResult]        = useState(null);
  const [validatedAccess, setValidatedAccess] = useState(null);
  const [accessError, setAccessError] = useState("");
  const [verificationFiles, setVerificationFiles] = useState({});
  const [downloadError, setDownloadError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [scanning,      setScanning]      = useState(false);
  const [consentResult, setConsentResult] = useState(null);
  const [shareCode,     setShareCode]     = useState(initialShareCode || "");
  // If the page loaded with ?consent=<id>, jump straight to polling
  const [directConsentId, setDirectConsentId] = useState(initialConsentId || null);
  const { captchaNode, execute: runCaptcha } = useCaptcha();

  function updateShareAccess(value) {
    setValidatedAccess(null); setAccessError("");
    const entered = value.trim();
    if (/^https?:\/\//i.test(entered)) {
      const linkedId = parseCertificateIdFromScan(entered);
      if (linkedId !== entered) setCertId(linkedId);
      setShareCode(parseShareCodeFromScan(entered));
    } else setShareCode(entered);
    setResult(null);
    setConsentResult(null);
  }

  async function fetchCredentialFiles() {
    if (!result?.certificate?.certificate_id || !shareCode) return;
    setDownloading(true); setDownloadError("");
    try {
      const response = await fetch(`${API_BASE}/verify/${encodeURIComponent(result.certificate.certificate_id)}/documents/?code=${encodeURIComponent(shareCode)}`, {cache: "no-store"});
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Credential files could not be fetched.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url; link.download = `${result.certificate.certificate_id}-documents.zip`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setDownloadError(error.message); }
    finally { setDownloading(false); }
  }

  async function validateEmployerAccess(rawScan = "") {
    const raw = rawScan || certId;
    const id = parseCertificateIdFromScan(raw);
    const code = parseShareCodeFromScan(raw) || shareCode;
    if (!id || !code) { setAccessError("Paste the full student share link, or enter its credential ID and share code."); return; }
    setCertId(id); setShareCode(code); setLoading(true); setAccessError(""); setValidatedAccess(null); setResult(null);
    try {
      const response = await fetch(`${API_BASE}/verify/${encodeURIComponent(id)}/access/`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({code}), cache: "no-store"});
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Access validation failed.");
      setValidatedAccess({...data, code});
    } catch (error) { setAccessError(error.message); }
    finally { setLoading(false); }
  }

  async function verify(id, rawScan = "") {
    const scanned = parseShareCodeFromScan(rawScan || id || certId);
    if (scanned) setShareCode(scanned);
    const codeToSend = scanned || shareCode;

    const parsed = parseCertificateIdFromScan(id || certId);
    if (!parsed) {
      setResult({ verification_outcome: "unavailable", message: "Enter a credential ID, paste the student's full share link, or scan a QR code." });
      return;
    }
    if (employerAccess && (!validatedAccess || validatedAccess.certificate_id !== parsed || validatedAccess.code !== codeToSend)) {
      await validateEmployerAccess(rawScan || id || certId); return;
    }
    if (employerAccess && !verificationFiles.certificate) { setAccessError("Upload the original certificate PDF before verifying. Transcript is optional."); return; }
    setCertId(parsed);
    setLoading(true);
    setResult(null);
    setConsentResult(null);
    try {
      // A valid share code bypasses the CAPTCHA gate and rate limits server-side,
      // so skip the widget entirely when one is present.
      const captchaToken = codeToSend ? null : await runCaptcha();
      const headers = { "Content-Type": "application/json" };
      if (captchaToken) headers["X-Captcha-Token"] = captchaToken;

      const qs = codeToSend ? `?code=${encodeURIComponent(codeToSend)}` : "";
      const files = Object.entries(verificationFiles).filter(([, file]) => file);
      const body = files.length ? new FormData() : null;
      if (body) {
        delete headers["Content-Type"];
        files.forEach(([kind, file]) => body.append(kind, file));
      }
      const res = await fetch(`${API_BASE}/verify/${encodeURIComponent(parsed)}/${employerAccess ? "verify-documents/" : ""}${qs}`, { headers, method: body ? "POST" : "GET", ...(body ? { body } : {}) });
      const data = await res.json();

      if (res.status === 403 && data.captcha_required) {
        setResult({ found: false, verification_outcome: "captcha_required" });
      } else if (!res.ok && data.verification_outcome !== "not_found") {
        setResult({ verification_outcome: "unavailable", message: data.detail || "Verification could not complete. Retry shortly." });
      } else {
        setResult(data);
        if (employerAccess && data.access_consumed) setValidatedAccess(null);
      }
    } catch {
      setResult({ found: false, verification_outcome: "unavailable", message: "The verification service could not be reached. Retry shortly." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    if (autoVerify && initialId) queueMicrotask(() => { if (active) verify(initialId); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoVerify, initialId, initialShareCode]);

  // When consent is approved, merge the approved cert data into result
  function handleConsentApproved(certPayload) {
    setConsentResult(certPayload);
    // Inject as a valid result so the cert detail grid renders
    setResult({
      ...certPayload,
      found: true,
      verification_outcome: certPayload.verification_outcome ?? "unavailable",
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
            {result.access_consumed && <p className="mb-3 text-sm font-medium">This single-use access has now been consumed. Keep this report open; a new verification requires a new student link.</p>}
          <VerificationEvidence result={result} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {detailRows(result.certificate).map(([label, value]) => (
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
            onChange={(e) => { setCertId(e.target.value); setValidatedAccess(null); setAccessError(""); setResult(null); }}
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
            <ActionButton
              tone={isDark ? "inverse" : undefined}
              type="button"
              onClick={() => employerAccess ? validateEmployerAccess() : verify()}
              disabled={loading}
              className={isDark
                ? "bg-[#F8F7F2] text-[#08283F] rounded px-6 font-semibold text-[1rem] whitespace-nowrap disabled:opacity-60"
                : "cd-btn-primary px-6 whitespace-nowrap disabled:opacity-60"}
            >
              {loading ? "Checking…" : "Verify"}
            </ActionButton>
          </div>
        </div>

        {employerAccess && <label className="mt-4 block text-sm font-medium">Student-provided share link or code
          <input type="text" value={shareCode} onChange={event => updateShareAccess(event.target.value)} autoComplete="off" spellCheck={false} placeholder="Paste the full student share link or code" className="cd-input mt-2 w-full" />
          <span className="mt-1 block text-xs text-[#4A5A68]">Required for private details and stored files. An ID-only check remains public; request student consent after lookup.</span>
        </label>}
        {shareCode && (
          <div className="flex items-center gap-2 mt-3 text-xs">
            <BadgeCheck size={13} className="text-[#2F6F4E] shrink-0" />
            <span className="text-[#2F6F4E] font-medium">{result?.verification_scope === "full" ? "Student access confirmed" : "Share code entered"}</span>
            <span className="text-[#8A929C]">{result?.verification_scope === "full" ? "Authorized result below" : "Select Verify to validate access"}</span>
            <button
              type="button"
              onClick={() => { setShareCode(""); setValidatedAccess(null); setResult(null); }}
              className="ml-auto text-[#8A929C] hover:text-[#A23B34] underline shrink-0"
            >
              Remove
            </button>
          </div>
        )}
      </div>

      {(employerAccess ? Boolean(validatedAccess) : Boolean(shareCode)) && <fieldset className="space-y-3 rounded-xl border border-[#E4E1D6] p-4"><legend className="text-sm font-semibold">2. Upload original documents</legend><p className="text-xs">Certificate PDF is required; transcript is optional. Maximum 20 MB each. Files are compared in memory and not saved. Use the original issued PDFs: scans or re-saved copies have different hashes. An omitted transcript is marked Not checked.</p>{[["certificate", "Certificate PDF (required)"], ["transcript", "Transcript PDF (optional)"]].map(([kind, label]) => <label key={kind} className="block text-sm">{label}<input className="mt-1 block w-full text-xs" type="file" accept="application/pdf,.pdf" disabled={loading} onChange={event => { setVerificationFiles(previous => ({ ...previous, [kind]: event.target.files?.[0] || null })); setResult(null); }} /></label>)}</fieldset>}
      {employerAccess && accessError && <p role="alert" className="text-sm text-red-700">{accessError}</p>}
      {employerAccess && validatedAccess && <p role="status" className="text-sm text-[#2F6F4E]">Access validated without consuming it. Expires {new Date(validatedAccess.expires_at).toLocaleString()}. Upload your files, then verify once.</p>}
      {employerAccess && <ActionButton type="button" onClick={() => verify()} disabled={loading || !validatedAccess || !verificationFiles.certificate} className="cd-btn-primary w-full justify-center disabled:opacity-60">{loading ? "Verifying credential…" : "Verify documents"}</ActionButton>}
      {/* Verification result */}
      {result && outcome && (
        <div className={isDark ? "bg-[#F8F7F2] text-[#1B2734] rounded-md p-8" : "dash-card p-5"}>
          <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border mb-5 ${outcome.bg}`}>
            <outcome.icon size={20} className={`${outcome.color} shrink-0`} />
            <div>
              <p className={`font-bold text-base ${outcome.color}`}>{outcome.label}</p>
              <p className="text-[#4A5A68] text-xs">{result.verification_scope === "full" ? "Student-authorized verification" : "Public verification ? private access has not been granted"}</p>
            </div>
          </div>

          {result.access_consumed && <p className="mb-3 text-sm font-medium">This single-use access has now been consumed. Keep this report open; a new verification requires a new student link.</p>}
          <VerificationEvidence result={result} />
          {employerAccess && !result.access_consumed && result.verification_scope === "full" && shareCode && result.verification_outcome === "valid" && <button type="button" disabled={downloading} onClick={fetchCredentialFiles} className="cd-btn-secondary mb-4">{downloading ? "Fetching credential files?" : "Fetch issued certificate and transcript"}</button>}
          {downloadError && <p role="alert" className="mb-3 text-sm text-red-700">{downloadError}</p>}

          {result.found && result.certificate && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {detailRows(result.certificate).map(([label, value]) => (
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
          onScan={(id) => verify(id, id)}
        />
      )}

      {captchaNode}
    </div>
  );
}
