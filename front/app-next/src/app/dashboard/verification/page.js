"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
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
      <p className="text-[#8A929C] text-xs">
        Need the page an employer sees?{" "}
        <Link
          href="/verify"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#B98A28] font-semibold hover:underline inline-flex items-center gap-1"
        >
          Open the public verification page
          <ExternalLink size={11} />
        </Link>
      </p>
    </div>
  );
}
