"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CertificateVerifyPanel from "@/components/CertificateVerifyPanel";
import { parseCertificateIdFromScan } from "@/lib/parseCertificateScan";

/**
 * Share links (`/verify/<id>?code=<raw>`) and consent poll URLs
 * (`/verify/<id>?consent=<request_id>`) land here, so the query string has to
 * be read as well as the path segment — reading only `params.id` silently
 * dropped the code and downgraded every share link to the public scope.
 */
function VerifyIdContent() {
  const params     = useParams();
  const search     = useSearchParams();
  const initialId  = parseCertificateIdFromScan(params?.id || "");
  const shareCode  = search.get("code") || "";
  const consentId  = search.get("consent") || "";

  return (
    <CertificateVerifyPanel
      initialId={initialId}
      // A consent link renders the consent flow instead of the verify form
      // (the panel short-circuits on `directConsentId`), so auto-verifying
      // would fetch a result nobody ever sees. The public verify endpoint
      // writes a `certificate.verified` audit entry, which is what the
      // super-admin verification trend counts — so the redundant call would
      // inflate those stats with verifications that never happened on screen.
      autoVerify={!!initialId && !consentId}
      initialShareCode={shareCode}
      initialConsentId={consentId}
    />
  );
}

export default function PublicVerifyIdPage() {
  return (
    <>
      <Navbar />
      <main className="flex-1 bg-[#F8F7F2]">
        <div className="landing-wrap py-16 max-w-3xl">
          <h1 className="font-serif text-[#08283F] text-3xl font-medium">Certificate verification</h1>
          <p className="text-[#4A5A68] text-[1.02rem] mt-3 max-w-[52ch]">
            This page opened from a certificate QR code. You can scan another code or enter a different ID below.
          </p>
          <div className="mt-8">
            <Suspense fallback={null}>
              <VerifyIdContent />
            </Suspense>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
