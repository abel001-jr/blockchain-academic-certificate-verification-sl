"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck, BadgeCheck, BriefcaseBusiness, ArrowUpRight, X } from "lucide-react";
import VerifyInline from "@/components/VerifyInline";
import { parseCertificateIdFromScan } from "@/lib/parseCertificateScan";
import { useCaptcha } from "@/hooks/useCaptcha";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000/api";

const DEMO_RESULT = {
  found: true,
  verification_outcome: "valid",
  certificate: {
    degree_title: "B.Sc. Computer Science",
    student_name: "Abel Morie Sam",
    institution_name: "Central University Sierra Leone",
    chain_issued_at: "06 September 2026",
  },
};

const OUTCOME_LABELS = {
  valid: { label: "Registry verified", color: "text-[#2F6F4E] bg-[#E7F1EB]" },
  revoked: { label: "Credential revoked", color: "text-[#A23B34] bg-[#F5E5E3]" },
  tampered: { label: "Integrity mismatch", color: "text-[#A9721F] bg-[#F5EBDB]" },
  unavailable: { label: "Verification unavailable", color: "text-[#A9721F] bg-[#F5EBDB]" },
  not_verified: { label: "Not yet issued", color: "text-[#A9721F] bg-[#F5EBDB]" },
  captcha_required: { label: "Complete CAPTCHA to continue", color: "text-[#A9721F] bg-[#F5EBDB]" },
  not_found: { label: "No matching credential", color: "text-[#4A5A68] bg-[#EAF2FB]" },
};

function ResultPanel({ result, loading }) {
  if (loading) return <div className="space-y-4 py-3" role="status"><p className="text-sm text-[#4A5A68]">Fetching credential and checking its record?</p>{["w-3/4", "w-full", "w-2/3"].map(width => <div key={width} className={`h-5 rounded bg-[#E4E1D6] motion-safe:animate-pulse ${width}`} />)}</div>;
  const data = result ?? DEMO_RESULT;
  const outcome = OUTCOME_LABELS[data.verification_outcome] ?? OUTCOME_LABELS.unavailable;
  const cert = data.certificate;
  const rows = cert ? [["Recipient", cert.student_name], ["Institution", cert.institution_name], ["Department", cert.department], ["Graduation year", cert.graduation_year], ["Issued", cert.chain_issued_at], ["Credential ID", cert.certificate_id]].filter(([, value]) => value !== undefined && value !== null && value !== "") : [];
  const states = {matched: "Matches", mismatch: "Mismatch", unavailable: "Unavailable", not_checked: "Not checked", not_applicable: "Not applicable", not_found: "Not found"};
  const checks = {blockchain: "Blockchain record", data: "Credential data", certificate: "Certificate file", transcript: "Transcript file"};
  return <div className="min-w-0 text-[#1B2734]">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E1D6] pb-4">
      <span className="text-xs font-semibold uppercase tracking-widest text-[#687B8E]">{result ? "Public credential record" : "Example record"}</span>
      <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${outcome.color}`}>{outcome.label}</span>
    </div>
    {data.found && cert ? <>
      <h3 className="mt-5 text-xl font-semibold leading-snug text-[#08283F]">{cert.degree_title || "Academic credential"}</h3>
      <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">{rows.map(([label, value]) => <div key={label} className={`min-w-0 rounded-lg border border-[#E4E1D6] bg-white/70 px-3 py-3 ${label === "Credential ID" ? "sm:col-span-2" : ""}`}><dt className="text-[10px] font-semibold uppercase tracking-wider text-[#687B8E]">{label}</dt><dd className="mt-1 break-words text-sm font-medium [overflow-wrap:anywhere]">{String(value)}</dd></div>)}</dl>
      {data.checks && <div className="mt-5 border-t border-[#E4E1D6] pt-4"><h4 className="text-xs font-semibold uppercase tracking-wider text-[#687B8E]">Verification checks</h4><dl className="mt-3 space-y-2">{Object.entries(data.checks).map(([key, check]) => <div key={key} className="flex justify-between gap-3 text-xs"><dt>{checks[key] || key}</dt><dd className={check.status === "matched" ? "font-semibold text-[#2F6F4E]" : "text-[#4A5A68]"}>{states[check.status] || check.status}</dd></div>)}</dl></div>}
      <p className="mt-4 text-xs leading-relaxed text-[#4A5A68]">{data.message || "Public lookup checks the credential record. Use employer verification to compare a file or request access to private details."}</p>
    </> : <p className="py-5 text-sm leading-relaxed text-[#4A5A68]">{data.message || "No matching credential was returned. Check the ID or try again."}</p>}
  </div>;
}

export default function VerifySection() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [certId, setCertId] = useState("");
  const [cleared, setCleared] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const requestVersion = useRef(0);

  function checkAnother() {
    requestVersion.current += 1;
    setResult(null); setLoading(false); setCertId(""); setCleared(true);
    setFormKey(key => key + 1);
    requestAnimationFrame(() => document.querySelector("#verify input[type=text]")?.focus());
  }
  const { captchaNode, execute: runCaptcha } = useCaptcha();

  async function verify(id) {
    const version = ++requestVersion.current;
    setCleared(false);
    const parsed = parseCertificateIdFromScan(id);
    setCertId(parsed);
    setLoading(true);
    setResult(null);
    try {
      const captchaToken = await runCaptcha();
      const headers = {};
      if (captchaToken) headers["X-Captcha-Token"] = captchaToken;
      const res = await fetch(`${API_BASE}/verify/${encodeURIComponent(parsed)}/`, { headers });
      const data = await res.json();
      if (requestVersion.current === version) setResult(res.ok || data.verification_outcome ? data : {found: false, verification_outcome: data.captcha_required ? "captcha_required" : "unavailable", message: data.detail});
    } catch {
      if (requestVersion.current === version) setResult({ found: false, verification_outcome: "unavailable", message: "The verification service could not be reached. Please try again." });
    } finally {
      if (requestVersion.current === version) setLoading(false);
    }
  }

  useEffect(() => {
    function onExternalVerify(e) {
      verify(e.detail.certId);
    }
    window.addEventListener("credence:verify", onExternalVerify);
    return () => window.removeEventListener("credence:verify", onExternalVerify);
  }, []);

  const showResult = Boolean(result || loading);
  const resultDialog = useRef(null);
  useEffect(() => {
    const dialog = resultDialog.current;
    if (showResult && !dialog.open) dialog.showModal();
    if (!showResult && dialog.open) dialog.close();
    if (!showResult) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [showResult]);

  return (
    <section className="scroll-anchor bg-[#08283F] text-[#F8F7F2] py-14 sm:py-20 lg:py-[100px]" id="verify">
      <div className="landing-wrap">
        <div className="max-w-3xl mb-6 sm:mb-8">
          <h2 className="font-serif text-[2.1rem] font-medium leading-[1.22]">What a verification actually returns</h2>
          <p className="mt-3.5 text-[#F8F7F2]/80 text-[1.02rem] max-w-[52ch]">
            Three checks, each confirmed independently — the document, the institution, and the chain record.
          </p>
        </div>
        <div className="w-full">
          <div className="min-w-0 flex flex-col">


          <article className="flex flex-col rounded-2xl border border-white/20 bg-white/5 p-5 sm:p-7"><h3 className="mb-5 flex items-center gap-3 text-xl font-semibold"><ShieldCheck size={23} aria-hidden="true" />Verify a credential</h3>
          <a href="/employer-verification" className="group mb-5 flex w-full items-center gap-3 rounded-xl border border-white/25 bg-white/5 px-4 py-4 text-[#F8F7F2] transition-colors hover:border-white/50 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10"><BriefcaseBusiness size={20} aria-hidden="true" /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Verifying as an employer?</span><span className="mt-1 block text-xs leading-relaxed text-white/75">Compare credential files and review detailed verification results.</span></span>
            <ArrowUpRight size={19} aria-hidden="true" className="shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transform-none" />
          </a>
            <VerifyInline
              key={formKey}
              variant="dark"
              defaultValue=""
              onVerify={verify}
              buttonLabel="Verify"
              placeholder="Paste a credential link or enter its ID"
              className="!mt-0 !max-w-none"
            />
            <p className="mt-[18px] text-[#F8F7F2]/80 text-[0.92rem] max-w-[38ch]">
              Scan the QR with this page, or open the public verify link encoded on the certificate — no account required.
            </p>
          </article>

          </div>
          <dialog ref={resultDialog} onCancel={event => { event.preventDefault(); checkAnother(); }} onClick={event => { if (event.target === event.currentTarget) checkAnother(); }} aria-labelledby="public-verification-result-title" className="fixed inset-0 m-auto max-h-[88dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-2xl border border-[#E4E1D6] bg-[#F8F7F2] p-0 text-[#08283F] shadow-2xl backdrop:bg-[#04131f]/70">
          <div className="p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3"><h2 id="public-verification-result-title" className="flex items-center gap-2 text-lg font-semibold"><BadgeCheck size={21} aria-hidden="true" />Verification result</h2><button type="button" autoFocus onClick={checkAnother} aria-label="Close verification result" className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-[#E4E1D6] focus-visible:outline-2"><X size={20} /></button></div>

            <div role="status" aria-live="polite" aria-atomic="true"><ResultPanel result={result} loading={loading} /></div>
            {result && !loading && <a href="/employer-verification" className="group mt-5 flex items-center gap-3 rounded-xl border border-[#CFE1F2] bg-[#EAF2FB] p-4 text-[#08283F] transition-colors hover:bg-[#DDEAF7] focus-visible:outline-2 focus-visible:outline-offset-4">
              <BriefcaseBusiness size={21} className="shrink-0" aria-hidden="true" />
              <span className="flex-1"><span className="block text-sm font-semibold">Need more access? Open employer verification</span><span className="mt-1 block text-xs leading-relaxed text-[#4A5A68]">Start a separate check with the student share link, or compare files you already hold. Public results are not carried over.</span></span>
              <ArrowUpRight size={18} className="shrink-0" aria-hidden="true" />
            </a>}
            {!loading && <button type="button" onClick={checkAnother} className="cd-btn-secondary mt-5">Check another credential</button>}
          </div></dialog>
        </div>
      </div>

      {/* Invisible hCaptcha widget mount point */}
      {captchaNode}
    </section>
  );
}
