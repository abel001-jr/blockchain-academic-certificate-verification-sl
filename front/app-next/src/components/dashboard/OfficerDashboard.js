"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2, Gavel, ArrowRight, ScrollText } from "lucide-react";
import { api } from "@/lib/api";
import { ROLES } from "@/lib/useAuth";
import StatusBadge from "@/components/dashboard/StatusBadge";

export default function OfficerDashboard({ role }) {
  const [certs, setCerts] = useState([]);
  const [busy, setBusy] = useState(true);
  const isVc = role === ROLES.VC;
  const title = isVc ? "Vice Chancellor" : "Chancellor";
  const statusFilter = isVc ? "pending_vc" : "pending_chancellor";

  useEffect(() => {
    api.get(`/certificates/?status=${statusFilter}`)
      .then(data => setCerts((data.results ?? data).slice(0, 8)))
      .catch(() => {})
      .finally(() => setBusy(false));
  }, [statusFilter]);

  if (busy) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={28} className="text-[#022448] animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 max-w-[960px]">
      <div className="bg-[#022448] rounded-[14px] p-6 text-white">
        <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-1">{title}</p>
        <h2 className="font-bold text-2xl">Certificate Approvals</h2>
        <p className="text-white/60 text-sm mt-1">
          {isVc
            ? "Review prepared certificates and approve with MetaMask (approveAsVC)."
            : "Final institutional sign-off via MetaMask (approveAsChancellor) issues the certificate."}
        </p>
      </div>

      <Link
        href="/dashboard/approvals"
        className="bg-white border border-[#c4c6cf]/15 rounded-[14px] p-5 flex items-center justify-between hover:shadow-card"
      >
        <span className="flex items-center gap-2 text-[#022448] font-semibold text-sm">
          <Gavel size={16} /> Open approval queue ({certs.length})
        </span>
        <ArrowRight size={14} className="text-[#7b5900]" />
      </Link>

      <div className="bg-white rounded-[14px] border border-[#c4c6cf]/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-[#c4c6cf]/15">
          <h3 className="text-[#022448] font-semibold text-sm">Waiting for you</h3>
        </div>
        <div className="divide-y divide-[#c4c6cf]/10">
          {certs.length === 0 && (
            <p className="px-6 py-10 text-center text-[#43474e] text-sm">No certificates awaiting your approval.</p>
          )}
          {certs.map(c => (
            <div key={c.id} className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3 min-w-0">
                <ScrollText size={16} className="text-[#022448] shrink-0" />
                <div className="min-w-0">
                  <p className="text-[#022448] text-sm font-semibold truncate">{c.student_name}</p>
                  <p className="text-[#43474e] text-xs truncate">{c.degree_title}</p>
                </div>
              </div>
              <StatusBadge status={c.status} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
