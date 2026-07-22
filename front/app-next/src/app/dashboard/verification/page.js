"use client";
import { useState } from "react";
import { Search, CheckCircle2, XCircle, AlertTriangle, HelpCircle } from "lucide-react";

const OUTCOMES = {
  valid:     { icon: CheckCircle2, color: "text-[#2E7D32]", bg: "bg-[#2E7D32]/10", label: "Valid" },
  revoked:   { icon: XCircle,      color: "text-[#C62828]", bg: "bg-[#C62828]/10", label: "Revoked" },
  tampered:  { icon: AlertTriangle,color: "text-[#ED8A19]", bg: "bg-[#ED8A19]/10", label: "Tampered" },
  not_found: { icon: HelpCircle,   color: "text-[#74777f]", bg: "bg-[#74777f]/10", label: "Not Found" },
};

export default function VerificationPage() {
  const [certId,  setCertId]  = useState("");
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);

  async function verify() {
    if (!certId.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res  = await fetch(`http://127.0.0.1:8000/api/verify/${certId.trim()}/`);
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ found: false, verification_outcome: "not_found" });
    } finally {
      setLoading(false);
    }
  }

  const outcome = result ? OUTCOMES[result.verification_outcome] ?? OUTCOMES.not_found : null;

  return (
    <div className="flex flex-col gap-6 max-w-[700px]">
      <div>
        <h2 className="text-[#022448] font-bold text-2xl">Verification</h2>
        <p className="text-[#43474e] text-sm mt-0.5">Look up a certificate by ID against the blockchain and database</p>
      </div>

      {/* Search */}
      <div className="bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 p-6">
        <label className="text-[#022448] text-xs font-semibold uppercase tracking-widest block mb-2">Certificate ID</label>
        <div className="flex gap-3">
          <input
            value={certId}
            onChange={(e) => setCertId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && verify()}
            placeholder="e.g. CR-2026-CUSL-0042"
            className="flex-1 bg-[#eef4ff] border border-transparent focus:border-[#022448] rounded-[10px] px-4 py-3 text-sm text-[#121c28] outline-none transition-all"
          />
          <button
            onClick={verify}
            disabled={loading}
            className="bg-[#022448] text-white px-6 py-3 rounded-[12px] text-sm font-semibold hover:opacity-90 transition-all active:scale-95 disabled:opacity-60 whitespace-nowrap"
          >
            {loading ? "Checking…" : "Verify"}
          </button>
        </div>
      </div>

      {/* Result */}
      {result && outcome && (
        <div className={`bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 p-6`}>
          <div className={`flex items-center gap-3 mb-5 p-4 rounded-[10px] ${outcome.bg}`}>
            <outcome.icon size={22} className={outcome.color} />
            <div>
              <p className={`font-bold text-base ${outcome.color}`}>{outcome.label}</p>
              <p className="text-[#43474e] text-sm">Verification outcome</p>
            </div>
          </div>

          {result.found && result.certificate && (
            <div className="grid grid-cols-2 gap-4">
              {[
                ["Certificate ID",   result.certificate.certificate_id],
                ["Student Name",     result.certificate.student_name],
                ["Degree",           result.certificate.degree_title],
                ["Institution",      result.certificate.institution_name],
                ["Graduation Year",  result.certificate.graduation_year],
                ["Issued At",        result.certificate.chain_issued_at ?? "—"],
                ["Tx Hash",          result.certificate.tx_hash || "—"],
                ["IPFS CID",         result.certificate.ipfs_cid_json || "—"],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5">
                  <p className="text-[#43474e] text-xs font-semibold uppercase tracking-wider">{label}</p>
                  <p className="text-[#022448] text-sm font-medium break-all">{value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
