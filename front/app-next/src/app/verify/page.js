"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CertificateVerifyPanel from "@/components/CertificateVerifyPanel";

function VerifyContent() {
  const params     = useSearchParams();
  const initialId  = params.get("id")      || params.get("cert") || "";
  const consentId  = params.get("consent") || "";
  const shareCode  = params.get("code")    || "";

  return (
    <CertificateVerifyPanel
      initialId={initialId}
      autoVerify={!!initialId && !consentId}
      initialConsentId={consentId}
      initialShareCode={shareCode}
    />
  );
}

export default function PublicVerifyPage() {
  return (
    <>
      <Navbar />
      <main className="flex-1 bg-[#F8F7F2]">
        <div className="landing-wrap py-16 max-w-3xl">
          <h1 className="font-serif text-[#08283F] text-3xl font-medium">Verify a certificate</h1>
          <p className="text-[#4A5A68] text-[1.02rem] mt-3 max-w-[52ch]">
            Scan the QR printed on a Credence credential, or enter the certificate ID. System-designed and
            externally uploaded certificates use the same check.
          </p>
          <div className="mt-8">
            <Suspense fallback={null}>
              <VerifyContent />
            </Suspense>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
