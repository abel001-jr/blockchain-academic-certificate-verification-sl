"use client";
import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CertificateVerifyPanel from "@/components/CertificateVerifyPanel";

function EmployerVerification() {
  const search = useSearchParams();
  return <CertificateVerifyPanel key={search.toString()} employerAccess autoVerify={false} initialId={search.get("id") || ""} initialShareCode={search.get("code") || ""} initialConsentId={search.get("consent") || ""} />;
}
export default function EmployerVerificationPage() {
  return <><Navbar />
    <main className="flex-1 bg-[#F8F7F2] px-5 py-12 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <Link href="/#verify" className="text-sm font-semibold text-[#780110] underline underline-offset-4">Back to public verification</Link>
        <p className="mt-8 text-xs font-semibold uppercase tracking-widest text-[#687B8E]">Employer access</p>
        <h1 className="mt-2 text-3xl font-bold text-[#08283F] sm:text-4xl">Verify a graduate?s credential</h1>
        <p className="mt-4 max-w-2xl leading-relaxed text-[#4A5A68]">Start with the private share link supplied by the student. A public verification result does not grant access to private details or stored documents.</p>
        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section aria-label="Employer verification form" className="min-w-0 rounded-2xl border border-[#E4E1D6] bg-white p-5 sm:p-7">
            <h2 className="text-lg font-semibold text-[#08283F]">1. Validate the student?s access link</h2>
            <p className="mb-6 mt-2 text-sm leading-relaxed text-[#4A5A68]">Paste the student?s full share link in the share-link field. The credential ID will be filled automatically. Select Validate access first. Then upload the certificate and optional transcript and select Verify documents. Single-use access is consumed only when checks complete; unavailable services allow retry.</p>
            <Suspense fallback={<p>Loading verification?</p>}><EmployerVerification /></Suspense>
          </section>
          <aside className="space-y-4">
            <div className="rounded-2xl bg-[#08283F] p-6 text-[#F8F7F2]">
              <h2 className="font-semibold">What access do you have?</h2>
              <dl className="mt-5 space-y-5 text-sm">
                <div><dt className="font-semibold">Credential ID only</dt><dd className="mt-1 leading-relaxed text-white/75">Use public verification for registry and blockchain checks. This upload flow requires a student share link.</dd></div>
                <div><dt className="font-semibold">Original PDFs already supplied</dt><dd className="mt-1 leading-relaxed text-white/75">Upload the original certificate and optional transcript after validating the student share link. Files are not saved.</dd></div>
                <div><dt className="font-semibold">Valid student share link</dt><dd className="mt-1 leading-relaxed text-white/75">Validate access without spending it. Upload the certificate and optional transcript, then receive one verification report.</dd></div>
              </dl>
            </div>
            <div className="rounded-xl border border-[#E4E1D6] p-5 text-sm leading-relaxed text-[#4A5A68]"><h3 className="font-semibold text-[#08283F]">No student link yet?</h3><p className="mt-2">Ask the graduate to create an employer share link. For an ID-only registry check, return to public verification above.</p></div>
          </aside>
        </div>
      </div>
    </main><Footer /></>;
}
