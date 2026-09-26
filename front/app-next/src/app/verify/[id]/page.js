"use client";

import { useParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CertificateVerifyPanel from "@/components/CertificateVerifyPanel";
import { parseCertificateIdFromScan } from "@/lib/parseCertificateScan";

export default function PublicVerifyIdPage() {
  const params = useParams();
  const initialId = parseCertificateIdFromScan(params?.id || "");

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
            <CertificateVerifyPanel initialId={initialId} autoVerify />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
