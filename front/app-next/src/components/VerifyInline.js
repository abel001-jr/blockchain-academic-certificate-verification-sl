"use client";
import { ActionButton } from "@/components/ui/AnimatedControls";

import { useId, useState } from "react";
import dynamic from "next/dynamic";
import { ScanLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { employerVerificationPath, parseCertificateIdFromScan } from "@/lib/parseCertificateScan";

const QrScanner = dynamic(() => import("@/components/QrScanner"), { ssr: false });

export default function VerifyInline({
  variant = "default",
  placeholder = "e.g. CR-2026-CUSL-A3F92C01",
  buttonLabel = "Verify",
  defaultValue = "",
  onVerify,
  employerDetails = false,
  className = "",
}) {
  const router = useRouter();
  const errorId = useId();
  const [error, setError] = useState("");
  const [certId, setCertId] = useState(defaultValue);
  const [scanning, setScanning] = useState(false);

  function submit(id) {
    const value = parseCertificateIdFromScan(id ?? certId);
    if (!value) { setError("Please paste the credential ID."); return; }
    setError("");
    if (employerDetails) { router.push(employerVerificationPath(id ?? certId)); return; }
    setCertId(value);

    if (onVerify) {
      onVerify(value);
      return;
    }

    window.dispatchEvent(new CustomEvent("credence:verify", { detail: { certId: value } }));
    document.getElementById("verify")?.scrollIntoView({ behavior: "smooth" });
  }

  function handleSubmit(e) {
    e?.preventDefault();
    submit();
  }

  const isDark = variant === "dark";

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className={`mt-9 p-[20px_22px] bg-white border border-[#E4E1D6] rounded max-w-[520px] ${
          isDark ? "!bg-transparent !border-white/20" : ""
        } ${className}`}
      >
        <label className={`block text-[0.875rem] font-medium mb-2.5 ${isDark ? "text-[#B9C6D2]" : "text-[#4A5A68]"}`}>
          Certificate ID
        </label>
        <div className="flex flex-col gap-2.5">
          <input
            type="text"
            value={certId}
            onChange={(e) => { setCertId(e.target.value); setError(""); }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            onPaste={e => {
              const raw = e.clipboardData.getData("text").trim();
              if (employerDetails && /^https?:\/\//i.test(raw) && parseCertificateIdFromScan(raw) !== raw) {
                e.preventDefault(); router.push(employerVerificationPath(raw));
              }
            }}
            placeholder={placeholder}
            className={`w-full px-[14px] py-[13px] border border-[#E4E1D6] rounded text-[0.95rem] text-[#1B2734] outline-none focus:outline-2 focus:outline-[#08283F] focus:outline-offset-1 ${
              isDark ? "bg-white" : ""
            }`}
          />
          {error && <p id={errorId} role="alert" className={`text-sm font-medium ${isDark ? "text-[#FFD2CC]" : "text-[#A23B34]"}`}>{error}</p>}
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => setScanning(true)}
              className={`cred-btn cred-btn-secondary flex-1 gap-2 ${isDark ? "cred-btn-inverse" : ""}`}
            >
              <ScanLine size={16} /> Scan QR
            </button>
            <ActionButton
              tone={isDark ? "inverse" : undefined}
              type="submit"
              className="flex-1 bg-[#08283F] text-[#F8F7F2] border-none rounded px-6 font-semibold text-[1rem] cursor-pointer hover:bg-[#12374F] whitespace-nowrap transition-colors"
            >
              {buttonLabel}
            </ActionButton>
          </div>
        </div>
      </form>
      {scanning && (
        <QrScanner
          open
          onClose={() => setScanning(false)}
          onScan={(id) => {
            setCertId(id);
            submit(id);
          }}
        />
      )}
    </>
  );
}
