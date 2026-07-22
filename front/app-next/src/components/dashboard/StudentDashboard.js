"use client";
import Link from "next/link";
import { ScrollText, Settings, ArrowRight } from "lucide-react";

export default function StudentDashboard() {
  return (
    <div className="flex flex-col gap-8 max-w-[720px]">
      <div className="bg-[#022448] rounded-[14px] p-6 text-white">
        <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-1">Student</p>
        <h2 className="font-bold text-2xl">My Credentials</h2>
        <p className="text-white/60 text-sm mt-1">View certificates issued to you by your institution.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link
          href="/dashboard/my-certificates"
          className="bg-white border border-[#c4c6cf]/15 rounded-[14px] p-5 flex items-center justify-between hover:shadow-card transition-all"
        >
          <span className="flex items-center gap-2 text-[#022448] font-semibold text-sm">
            <ScrollText size={16} /> My Certificates
          </span>
          <ArrowRight size={14} className="text-[#7b5900]" />
        </Link>
        <Link
          href="/dashboard/settings"
          className="bg-white border border-[#c4c6cf]/15 rounded-[14px] p-5 flex items-center justify-between hover:shadow-card transition-all"
        >
          <span className="flex items-center gap-2 text-[#022448] font-semibold text-sm">
            <Settings size={16} /> Settings
          </span>
          <ArrowRight size={14} className="text-[#7b5900]" />
        </Link>
      </div>
    </div>
  );
}
