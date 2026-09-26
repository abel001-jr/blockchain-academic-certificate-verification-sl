"use client";
/**
 * Issue Certificate — flow selector
 *
 * Three flows:
 *   1. Upload both (full_upload):        Upload certificate and transcript together
 *   2. Design with Credence (system_designed): Upload transcript → Design cert in system
 *   3. Transcript first (transcript_then_cert): Upload transcript now, certificate later
 */

import { Suspense, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useAuth, isInstitutionHead } from "@/lib/useAuth";
import WorkflowFlowSelector, { FLOW_IDS } from "@/components/WorkflowFlowSelector";
import SystemDesignedFlow from "./SystemDesignedFlow";
import ExternalUploadFlow from "./ExternalUploadFlow";

export default function IssueCertificatePage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16">Loading workflow…</div>}>
      <IssueCertificateContent />
    </Suspense>
  );
}

function IssueCertificateContent() {
  const { role } = useAuth();
  const searchParams = useSearchParams();
  const draftId = searchParams.get("draft");
  const requestedFlow = searchParams.get("flow");
  const [flow, setFlow] = useState(() => (
    Object.values(FLOW_IDS).includes(requestedFlow) ? requestedFlow : null
  )); // null | "full_upload" | "system_designed" | "transcript_then_cert"

  if (role && !isInstitutionHead(role)) {
    return (
      <div className="w-full">
        <p className="text-[#A23B34] text-sm">Only the institution Registrar can issue certificates.</p>
      </div>
    );
  }

  // ── Flow selector ──
  if (!flow) {
    return (
      <div className="flex flex-col gap-6 w-full">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/certificates"
            className="p-2 rounded-lg hover:bg-[#EAF2FB] transition-colors text-[#4A5A68]">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h2 className="text-[#08283F] font-bold text-2xl">Issue Certificate</h2>
            <p className="text-[#4A5A68] text-sm mt-0.5">Choose how this certificate will be created</p>
          </div>
        </div>

        <WorkflowFlowSelector 
          selectedFlow={flow}
          onSelect={(selectedFlow) => setFlow(selectedFlow)}
        />

        <p className="text-[#8A929C] text-xs text-center">
          All flows anchor a tamper-evident hash on the Ethereum blockchain. The issued certificate can be verified by anyone using the certificate ID or QR code.
        </p>
      </div>
    );
  }

  // Route to the appropriate flow component
  if (flow === FLOW_IDS.DESIGN_WITH_CREDENCE) {
    return <SystemDesignedFlow draftId={draftId} onBack={() => setFlow(null)} />;
  }

  if (flow === FLOW_IDS.FULL_UPLOAD || flow === FLOW_IDS.TRANSCRIPT_FIRST) {
    return <ExternalUploadFlow draftId={draftId} onBack={() => setFlow(null)} flowType={flow} />;
  }

  return null;
}
