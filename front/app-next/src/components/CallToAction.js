"use client";
import Link from "next/link";
import { Search, Building2, QrCode } from "lucide-react";

export default function CallToAction() {
  return (
    <section className="bg-[#e5eeff] py-20 px-4 md:px-10" id="verify">
      <div className="max-w-[780px] mx-auto text-center">

        {/* Section label */}
        <p className="text-[#7b5900] text-xs font-semibold uppercase tracking-widest mb-4">
          Public Verification — No Account Required
        </p>

        <h2 className="text-[#022448] font-bold text-4xl md:text-[48px] leading-tight tracking-tight mb-5">
          Verify a Certificate Instantly
        </h2>
        <p className="text-[#43474e] text-lg leading-relaxed mb-10">
          Enter a Certificate ID to confirm authenticity directly against the blockchain.
          No login. No waiting. No institutional contact required.
        </p>

        {/* Search bar */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
          <div className="flex flex-1 max-w-lg bg-white rounded-[14px] shadow-card overflow-hidden border border-[#c4c6cf]/40 focus-within:border-[#022448] transition-colors">
            <div className="px-4 flex items-center text-[#74777f]">
              <Search size={18} />
            </div>
            <input
              type="text"
              placeholder="Enter Certificate ID (e.g. CR-2026-CUSL-0042)"
              className="flex-1 py-4 pr-4 text-sm text-[#121c28] bg-transparent outline-none placeholder:text-[#74777f]"
              aria-label="Certificate ID"
            />
          </div>
          <button className="bg-[#022448] text-white px-8 py-4 rounded-[14px] font-semibold text-sm hover:opacity-90 transition-all active:scale-95 shrink-0">
            Verify Now
          </button>
        </div>

        {/* QR hint */}
        <div className="flex items-center justify-center gap-2 text-[#43474e] text-sm mb-8">
          <QrCode size={16} className="text-[#7b5900]" />
          <span>Or scan a certificate QR code with your phone camera</span>
        </div>

        <div className="flex items-center justify-center gap-3 text-[#43474e] text-sm mb-6">
          <span className="h-px w-16 bg-[#c4c6cf]" />
          <span>Institutional access</span>
          <span className="h-px w-16 bg-[#c4c6cf]" />
        </div>

        <div className="flex items-center justify-center">
          <Link
            href="/login"
            className="flex items-center gap-2 border border-[#022448] text-[#022448] px-7 py-3.5 rounded-[14px] font-semibold text-sm hover:bg-[#022448] hover:text-white transition-all"
          >
            <Building2 size={16} />
            Institution Sign In
          </Link>
        </div>

        {/* Verification outcomes */}
        <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Valid", color: "bg-[#2E7D32]/10 text-[#2E7D32]" },
            { label: "Tampered", color: "bg-[#ED8A19]/10 text-[#ED8A19]" },
            { label: "Revoked", color: "bg-[#C62828]/10 text-[#C62828]" },
            { label: "Not Found", color: "bg-[#74777f]/10 text-[#43474e]" },
          ].map(({ label, color }) => (
            <div key={label} className={`px-4 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-widest ${color}`}>
              {label}
            </div>
          ))}
        </div>
        <p className="text-[#74777f] text-xs mt-3">Possible verification outcomes</p>
      </div>
    </section>
  );
}
