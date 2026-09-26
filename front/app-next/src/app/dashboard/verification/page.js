"use client";

import CertificateVerifyPanel from "@/components/CertificateVerifyPanel";

export default function DashboardVerificationPage() {
  return (
    <div className="flex flex-col gap-5 w-full">
      <div>
        <h2 className="text-[#08283F] font-bold text-2xl">Verification</h2>
        <p className="text-[#4A5A68] text-sm mt-0.5">
          Look up a certificate by ID or scan its QR code. Works for both Credence-designed and uploaded certificates.
        </p>
      </div>
      <CertificateVerifyPanel />
    </div>
  );
}
