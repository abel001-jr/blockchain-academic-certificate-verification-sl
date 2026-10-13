"use client";
import NavigationButton from "@/components/ui/NavigationButton";

/**
 * Issue Certificate — flow selector
 *
 * Three flows:
 *   1. Upload both (full_upload):        Upload certificate and transcript together
 *   2. Design with Intelligent Academic Credentialing (system_designed): Upload transcript → Design cert in system
 *   3. Assisted placement (assisted_placement): planned unsigned-document workflow
 */

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import WorkflowFlowSelector, { FLOW_IDS } from "@/components/WorkflowFlowSelector";
import SystemDesignedFlow from "./SystemDesignedFlow";
import ExternalUploadFlow from "./ExternalUploadFlow";
import { api } from "@/lib/api";

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
  const [branding, setBranding] = useState(null);
  const [brandingError, setBrandingError] = useState("");
  useEffect(() => {
    if (role !== "registrar") return;
    let alive = true;
    api.get("/certificate-branding/").then(data => { if (alive) setBranding(data); }).catch(() => { if (alive) setBrandingError("Could not load institution issuance settings. Reload this page to try again."); });
    return () => { alive = false; };
  }, [role]);
  const effectiveFlow = !draftId && branding?.active_revision_id && flow ? FLOW_IDS.DESIGN_WITH_CREDENCE : flow;

  if (role && role !== "registrar") {
    return (
      <div className="w-full">
        <p className="text-[#A23B34] text-sm">Only the institution Registrar can issue certificates.</p>
      </div>
    );
  }
  if (brandingError) return <p role="alert">{brandingError}</p>;
  if (!branding) return <p role="status">Loading institution issuance settings...</p>;

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
            <h2 className="text-[#08283F] font-bold text-2xl">Issue Credential</h2>
            <p className="text-[#4A5A68] text-sm mt-0.5">Choose how the certificate and transcript will be prepared</p>
          </div>
        </div>

        <WorkflowFlowSelector 
          templateActive={Boolean(branding.active_revision_id)}
          selectedFlow={flow}
          onSelect={(selectedFlow) => setFlow(selectedFlow)}
        />

        <div className="grid gap-4 md:grid-cols-3" aria-label="Shared issuance stages">
          {[
            ["1. Prepare and review", "Upload or generate the documents, check student and award details, and resolve differences."],
            ["2. Attest and approve", "Registrar attests to the record. VC and Chancellor review the documents and approve in order."],
            ["3. Finalize and issue", "Registrar completes blockchain finalization. The graduate receives access to the credential documents."],
          ].map(([title, description]) => (
            <div key={title} className="rounded-xl border border-[#E4E1D6] bg-white p-4">
              <h3 className="text-sm font-semibold text-[#08283F]">{title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-[#4A5A68]">{description}</p>
            </div>
          ))}
        </div>

        <p className="text-[#8A929C] text-xs text-center">
          All flows anchor a tamper-evident hash on the Ethereum blockchain. The issued certificate can be verified by anyone using the certificate ID or QR code.
        </p>
      </div>
    );
  }

  if (effectiveFlow === FLOW_IDS.ASSISTED_PLACEMENT) {
    return (
      <div className="flex flex-col gap-6 w-full">
        <NavigationButton direction="back" type="button" onClick={() => setFlow(null)} className="flex items-center gap-2 text-sm text-[#4A5A68] self-start">
          <ArrowLeft size={18} /> Back to workflows
        </NavigationButton>
        <div className="rounded-2xl border border-[#E4E1D6] bg-white p-6">
          <span className="text-xs font-semibold text-[#A9721F]">Planned workflow</span>
          <h2 className="mt-2 text-2xl font-bold text-[#08283F]">Sign unsigned documents</h2>
          <p className="mt-3 text-sm text-[#4A5A68]">Layout recommendations and editable signature placements will be available after model integration. This workflow is not available for issuance yet.</p>
          <ol className="mt-6 space-y-4 list-decimal pl-5 text-sm text-[#4A5A68]">
            <li>Upload both PDFs and review extracted student, institution, and award details.</li>
            <li>Review recommended field positions beside the document preview. Accept, move, reject, or manually place Registrar, VC, and Chancellor signature fields using configured signature assets.</li>
            <li>Apply signatures and finalize both documents before hashing, then proceed through Registrar attestation, VC approval, Chancellor approval, and Registrar anchoring.</li>
          </ol>
          <p className="mt-6 text-xs text-[#687B8E]">Recommendations require Registrar review. Changing a placement must invalidate the previous final document hash.</p>
        </div>
      </div>
    );
  }

  // Route to the appropriate flow component
  if (effectiveFlow === FLOW_IDS.DESIGN_WITH_CREDENCE) {
    return <SystemDesignedFlow draftId={draftId} onBack={() => setFlow(null)} />;
  }

  if (effectiveFlow === FLOW_IDS.FULL_UPLOAD || effectiveFlow === FLOW_IDS.TRANSCRIPT_FIRST) {
    return <ExternalUploadFlow draftId={draftId} onBack={() => setFlow(null)} flowType={effectiveFlow} emailDomain={branding.email_domain} />;
  }

  return null;
}
