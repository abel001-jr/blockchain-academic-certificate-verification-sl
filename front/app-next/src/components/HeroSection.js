import Link from "next/link";
import { Shield, QrCode, BadgeCheck } from "lucide-react";

export default function HeroSection() {
  return (
    <section id="home" className="px-4 md:px-10 py-20 flex flex-col items-center text-center max-w-[1280px] mx-auto">

      {/* Pill badge */}
      <div className="inline-flex items-center gap-2 bg-[#7b5900]/10 px-4 py-1.5 rounded-full mb-6">
        <Shield size={14} className="text-[#7b5900]" fill="currentColor" />
        <span className="text-[#7b5900] text-xs font-semibold uppercase tracking-widest">
          Blockchain-Powered Academic Certificate Platform
        </span>
      </div>

      {/* Headline */}
      <h1 className="text-[#022448] font-bold text-4xl md:text-[48px] leading-tight md:leading-[56px] tracking-tight max-w-3xl mb-6">
        Issue, Manage & Verify Academic Certificates with Blockchain Trust.
      </h1>

      {/* Subheading */}
      <p className="text-[#43474e] text-lg leading-relaxed max-w-2xl mb-10">
        CREDENCE gives higher education institutions a secure, transparent platform to issue tamper-proof certificates — verified cryptographically, not just administratively.
      </p>

      {/* CTAs */}
      <div className="flex flex-col sm:flex-row gap-4 mb-16 w-full sm:w-auto">
        <Link
          href="#verify"
          className="bg-[#022448] text-white px-8 py-4 rounded-[14px] font-semibold text-sm hover:opacity-90 transition-all active:scale-95 shadow-md text-center"
        >
          Verify a Certificate
        </Link>
        <Link
          href="/login"
          className="border border-[#022448] text-[#022448] px-8 py-4 rounded-[14px] font-semibold text-sm hover:bg-[#022448] hover:text-white transition-all active:scale-95 text-center"
        >
          Institution Sign In
        </Link>
      </div>

      {/* Certificate mockup */}
      <div className="w-full max-w-3xl relative">
        <div className="bg-white rounded-[14px] shadow-card p-6 md:p-12 relative z-10">
          <div className="border-2 border-[#022448]/5 rounded-xl p-6 md:p-10 flex flex-col items-center gap-6">

            {/* Cert header */}
            <div className="flex items-center gap-3 mb-2 w-full">
              <BadgeCheck size={32} className="text-[#7b5900] shrink-0" />
              <div className="text-left">
                <p className="text-xs text-[#43474e] uppercase tracking-widest font-semibold">
                  Central University Sierra Leone
                </p>
                <p className="text-[#022448] font-bold text-lg">Bachelor of Science in Computer Science</p>
              </div>
            </div>

            {/* Cert body */}
            <div className="w-full bg-[#FAF7F2] rounded-xl p-6 flex flex-col gap-4">
              <div className="flex justify-between items-start flex-wrap gap-4">
                <div>
                  <p className="text-xs text-[#43474e] uppercase tracking-widest font-semibold mb-1">Issued To</p>
                  <p className="text-[#022448] font-bold text-xl">Abel Morie Sam</p>
                  <p className="text-[#43474e] text-sm">Department of Computer Science — 2026</p>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-16 h-16 bg-[#022448] rounded-lg flex items-center justify-center">
                    <QrCode size={36} className="text-[#fcca66]" />
                  </div>
                  <p className="text-xs text-[#43474e]">Scan to Verify</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-6 pt-3 border-t border-[#c4c6cf]/30">
                <div>
                  <p className="text-xs text-[#43474e] uppercase tracking-widest font-semibold mb-0.5">Certificate ID</p>
                  <p className="text-[#022448] text-sm font-mono font-medium">CR-2026-CUSL-0042</p>
                </div>
                <div>
                  <p className="text-xs text-[#43474e] uppercase tracking-widest font-semibold mb-0.5">IPFS Storage</p>
                  <p className="text-[#022448] text-sm font-mono font-medium truncate max-w-[160px]">Qm3xK…9pTrF</p>
                </div>
                <div className="ml-auto">
                  <p className="text-xs text-[#43474e] uppercase tracking-widest font-semibold mb-0.5">Blockchain Status</p>
                  <span className="inline-flex items-center gap-1.5 bg-[#7b5900]/10 text-[#022448] text-xs font-semibold px-3 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#2E7D32] inline-block" />
                    Verified On-Chain
                  </span>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Decorative blobs */}
        <div className="absolute -bottom-8 -right-8 w-40 h-40 bg-[#7b5900]/10 rounded-full blur-3xl -z-10" />
        <div className="absolute -top-6 -left-6 w-32 h-32 bg-[#022448]/5 rounded-full blur-2xl -z-10" />
      </div>
    </section>
  );
}
