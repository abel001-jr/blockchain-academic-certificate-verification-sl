"use client";

import { useEffect, useState } from "react";
import LandingCard from "./ui/LandingCard";
import { ShieldCheck, BadgeCheck } from "lucide-react";
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
  valid: { label: "Verified", color: "text-[#2F6F4E]" },
  revoked: { label: "Revoked", color: "text-[#A23B34]" },
  tampered: { label: "Tampered", color: "text-[#A9721F]" },
  not_found: { label: "Not found", color: "text-[#4A5A68]" },
};

function ResultPanel({ result, loading }) {
  if (loading) {
    return (
      <div className="bg-[#F8F7F2] text-[#1B2734] rounded-md min-w-0 p-0">
        <p className="text-[#4A5A68] text-sm">Checking certificate record…</p>
      </div>
    );
  }

  const data = result ?? DEMO_RESULT;
  const outcome = OUTCOME_LABELS[data.verification_outcome] ?? OUTCOME_LABELS.not_found;
  const cert = data.certificate;
  const isValid = data.verification_outcome === "valid" && data.found;

  return (
    <div className="bg-[#F8F7F2] text-[#1B2734] rounded-md min-w-0 p-0">
      <div className={`flex items-center gap-2.5 ${outcome.color} font-semibold text-[1.05rem] pb-3 border-b border-[#E4E1D6] mb-2`}>
        {isValid && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
        {outcome.label}
      </div>

      {data.found && cert ? (
        <>
          <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4 py-2 text-[0.92rem] border-b border-dashed border-[#E4E1D6]">
            <span className="text-[#4A5A68]">Credential</span>
            <span className="min-w-0 font-semibold break-words [overflow-wrap:anywhere] sm:text-right">{cert.degree_title}</span>
          </div>
          <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4 py-2 text-[0.92rem] border-b border-dashed border-[#E4E1D6]">
            <span className="text-[#4A5A68]">Recipient</span>
            <span className="min-w-0 font-semibold break-words [overflow-wrap:anywhere] sm:text-right">{cert.student_name}</span>
          </div>
          <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4 py-2 text-[0.92rem] border-b border-dashed border-[#E4E1D6]">
            <span className="text-[#4A5A68]">Institution</span>
            <span className="min-w-0 font-semibold break-words [overflow-wrap:anywhere] sm:text-right">{cert.institution_name}</span>
          </div>
          <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4 py-2 text-[0.92rem]">
            <span className="text-[#4A5A68]">Issued</span>
            <span className="min-w-0 font-semibold break-words [overflow-wrap:anywhere] sm:text-right">{cert.chain_issued_at ?? cert.graduation_year ?? "—"}</span>
          </div>
          {isValid && (
            <div className="mt-3 pt-3 border-t border-[#E4E1D6] flex flex-col gap-1.5">
              {["Institution confirmed", "Document integrity valid", "Blockchain record verified"].map((item) => (
                <div key={item} className="flex items-center gap-2 text-[0.88rem] text-[#2F6F4E] font-medium">
                  ✓ {item}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="text-[#4A5A68] text-sm">No matching certificate was found for that ID.</p>
      )}
    </div>
  );
}

export default function VerifySection() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [certId, setCertId] = useState("");
  const { captchaNode, execute: runCaptcha } = useCaptcha();

  async function verify(id) {
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
      setResult(data);
    } catch {
      setResult({ found: false, verification_outcome: "not_found" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    function onExternalVerify(e) {
      verify(e.detail.certId);
    }
    window.addEventListener("credence:verify", onExternalVerify);
    return () => window.removeEventListener("credence:verify", onExternalVerify);
  }, []);

  return (
    <section className="scroll-anchor bg-[#08283F] text-[#F8F7F2] py-14 sm:py-20 lg:py-[100px]" id="verify">
      <div className="landing-wrap">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-6 sm:gap-8 xl:gap-14 items-start">
          <div className="min-w-0">
        <div className="max-w-[560px] mb-6 sm:mb-8">
          <h2 className="font-serif text-[2.1rem] font-medium leading-[1.22]">What a verification actually returns</h2>
          <p className="mt-3.5 text-[#F8F7F2]/80 text-[1.02rem] max-w-[52ch]">
            Three checks, each confirmed independently — the document, the institution, and the chain record.
          </p>
        </div>

          <LandingCard variant="luminous" borderless icon={ShieldCheck} title="Verify a credential">
            <VerifyInline
              variant="dark"
              defaultValue=""
              onVerify={verify}
              className="!mt-0"
            />
            <p className="mt-[18px] text-[#F8F7F2]/80 text-[0.92rem] max-w-[38ch]">
              Scan the QR with this page, or open the public verify link encoded on the certificate — no account required.
            </p>
          </LandingCard>
          </div>
          <LandingCard compact className="!h-auto" icon={BadgeCheck} title={result || loading ? "Verification result" : "Example verification result"} footer={!result && !loading ? "Illustrative preview. Enter a credential ID to check a real record." : undefined} href="#verify" cta="Check another credential">
            <div role="status" aria-live="polite" aria-atomic="true"><ResultPanel result={result} loading={loading} /></div>
          </LandingCard>
        </div>
      </div>

      {/* Invisible hCaptcha widget mount point */}
      {captchaNode}
    </section>
  );
}
