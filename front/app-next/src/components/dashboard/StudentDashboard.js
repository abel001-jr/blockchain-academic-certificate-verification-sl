"use client";
import Link from "next/link";
import { ScrollText, Settings, ArrowRight } from "lucide-react";

export default function StudentDashboard() {
  return (
    <div className="flex flex-col gap-8 w-full">
      <div className="bg-[#08283F] rounded-xl p-6 text-white">
        <p className="text-white/75 text-xs font-semibold uppercase tracking-wider mb-1">Student</p>
        <h2 className="font-bold text-2xl">My Credentials</h2>
        <p className="text-white/70 text-sm mt-1">View and share certificates issued to you by your institution.</p>
      </div>

      {/* Info block */}
      <div className="bg-[#EAF2FB] border border-[#CFE1F2] rounded-xl p-5">
        <p className="text-[#08283F] text-sm font-semibold mb-1">About your verified credentials</p>
        <p className="text-[#4A5A68] text-sm leading-relaxed">
          Each certificate issued to you is anchored on the Ethereum blockchain. Anyone can verify its authenticity
          using the certificate ID or QR code — no need to contact your institution.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link
          href="/dashboard/my-certificates"
          className="bg-white border border-[#E4E1D6]/50 rounded-xl p-5 flex items-center justify-between hover:shadow-card transition-all"
        >
          <span className="flex items-center gap-2 text-[#08283F] font-semibold text-sm">
            <ScrollText size={16} /> My Certificates
          </span>
          <ArrowRight size={14} className="text-[#B98A28]" />
        </Link>
        <Link
          href="/dashboard/settings"
          className="bg-white border border-[#E4E1D6]/50 rounded-xl p-5 flex items-center justify-between hover:shadow-card transition-all"
        >
          <span className="flex items-center gap-2 text-[#08283F] font-semibold text-sm">
            <Settings size={16} /> Settings
          </span>
          <ArrowRight size={14} className="text-[#B98A28]" />
        </Link>
      </div>
    </div>
  );
}
