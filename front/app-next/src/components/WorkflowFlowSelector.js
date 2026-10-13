"use client";
import styles from "./WorkflowFlowSelector.module.css";
import { useState } from "react";
import CredentialSignerIndicator from "./CredentialSignerIndicator";
import { Upload, Sparkles, FileText, CheckCircle } from "lucide-react";

/**
 * WorkflowFlowSelector Component
 * 
 * Displays the three certificate workflow flows and allows users to select one:
 * 1. Full Upload (Upload both certificate and transcript together)
 * 2. Design with Intelligent Academic Credentialing (Upload transcript, then design certificate - RECOMMENDED)
 * 3. Unsigned documents with assisted signature placement (planned)
 */

const FLOWS = {
  FULL_UPLOAD: {
    id: "full_upload",
    title: "Upload completed documents",
    description: "Upload the signed certificate and transcript, review their details, and issue one paired credential.",
    icon: Upload,
    iconColor: "text-[#08283F]",
    bgColor: "bg-[#08283F]/5",
    borderColor: "border-[#08283F]/20",
    steps: [
      "Upload both PDFs and check extracted student and award details",
      "Resolve differences and attest; VC and Chancellor approve in order",
      "Registrar finalizes the paired document hashes on-chain"
    ]
  },
  DESIGN_WITH_CREDENCE: {
    id: "system_designed",
    title: "Generate certificate + upload transcript",
    description: "Generate a certificate from your institutional template and upload the existing transcript for review.",
    icon: Sparkles,
    iconColor: "text-[#B98A28]",
    bgColor: "bg-[#B98A28]/5",
    borderColor: "border-[#B98A28]/30",
    recommended: true,
    steps: [
      "Enter student details, preview the certificate, and upload the transcript",
      "Review the transcript and submit the review copy for VC and Chancellor approval",
      "Generate the sealed certificate and finalize the credential on-chain"
    ]
  },
  ASSISTED_PLACEMENT: {
    id: "assisted_placement",
    title: "Sign unsigned documents",
    description: "Upload unsigned documents, review suggested field positions, and apply configured officer signatures. Model integration is planned.",
    icon: FileText,
    iconColor: "text-[#2F6F4E]",
    bgColor: "bg-[#2F6F4E]/5",
    borderColor: "border-[#2F6F4E]/20",
    planned: true,
    steps: [
      "Upload certificate and transcript; review extracted identity and award data",
      "Review layout recommendations and adjust officer signature placements",
      "Apply signatures, fix final hashes, then complete the shared approvals"
    ]
  }
};

export default function WorkflowFlowSelector({ onSelect, selectedFlow, variant = "card", templateActive = false }) {
  const [localSelected, setLocalSelected] = useState(selectedFlow || null);
  const currentSelected = selectedFlow || localSelected;
  const selectedDefinition = Object.values(FLOWS).find(item => item.id === currentSelected);

  const handleSelect = (flowId) => {
    if (templateActive && flowId !== "system_designed") return;
    setLocalSelected(flowId);
    if (onSelect) {
      onSelect(flowId);
    }
  };

  if (variant === "compact") {
    return (
      <div className="flex flex-col gap-3">
        <label className="text-[#08283F] text-sm font-semibold">Select Workflow</label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Object.values(FLOWS).map((flow) => {
            const Icon = flow.icon;
            const isSelected = currentSelected === flow.id;
            
            return (
              <button
                key={flow.id}
                type="button"
                disabled={templateActive && flow.id !== "system_designed"}
                onClick={() => handleSelect(flow.id)}
                className={`
                  relative p-4 rounded-xl border-2 text-left transition-all
                  ${isSelected 
                    ? `${flow.borderColor} ${flow.bgColor}` 
                    : 'border-[#E4E1D6] bg-white hover:border-[#08283F]/20'
                  }
                `}
              >
                {flow.recommended && (
                  <div className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                    <span className="bg-[#B98A28] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      RECOMMENDED
                    </span>
                  </div>
                )}
                
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${flow.bgColor} shrink-0`}>
                    <Icon size={20} className={flow.iconColor} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[#08283F] font-semibold text-sm mb-1">{flow.title}{flow.planned && <span className="ml-2 text-xs font-medium text-[#A9721F]">Planned</span>}</h4>
                    <p className="text-[#4A5A68] text-xs leading-relaxed">{flow.description}</p>
                  </div>
                  {isSelected && (
                    <CheckCircle size={18} className="text-[#2F6F4E] shrink-0" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Full card variant (default)
  return (
    <div className={`${styles.chooser} flex flex-col gap-6`}>
      <CredentialSignerIndicator />
      <div className={styles.intro}>
        <h3 className="text-[#08283F] font-bold text-xl mb-2">Choose how to prepare the credential</h3>
        <p className="text-[#4A5A68] text-sm max-w-2xl mx-auto">
          Choose a preparation method. Every available flow follows the same institutional approval and finalization process.
        </p>
      </div>

      {templateActive && <p className={styles.notice}>Your institution has an active certificate template. Use the recommended flow to generate the certificate and upload its transcript.</p>}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {Object.values(FLOWS).map((flow) => {
          const Icon = flow.icon;
          const isSelected = currentSelected === flow.id;
          
          return (
            <div
              key={flow.id}
              className={`
                ${styles.flowCard} ${isSelected ? styles.selected : ""} ${flow.recommended ? styles.recommended : ""} ${templateActive && flow.id !== "system_designed" ? styles.unavailable : ""} relative rounded-2xl border overflow-hidden transition-all
                ${isSelected 
                  ? `${flow.borderColor} ${flow.bgColor} shadow-lg` 
                  : 'border-[#E4E1D6] bg-white hover:border-[#08283F]/20 hover:shadow-md'
                }
              `}
            >
              {flow.recommended && (
                <div className={styles.badge}>
                  <span className="bg-[#B98A28] text-white text-xs font-bold px-3 py-1 rounded-full">
                    Recommended
                  </span>
                </div>
              )}

              <div className="p-5 flex flex-col h-full">
                {/* Icon */}
                <div className={`w-11 h-11 rounded-xl ${flow.bgColor} flex items-center justify-center mb-4`}>
                  <Icon size={23} className={flow.iconColor} />
                </div>

                {/* Title & Description */}
                <h4 className="text-[#08283F] font-bold text-lg mb-2">{flow.title}{flow.planned && <span className="ml-2 text-xs font-medium text-[#A9721F]">Planned</span>}</h4>
                <p className="text-[#4A5A68] text-sm mb-4 leading-relaxed">{flow.description}</p>

                {/* Workflow Steps */}
                <div className="mb-6 flex-1">
                  <p className="text-[#08283F] text-xs font-semibold uppercase tracking-wide mb-3">
                    Workflow Steps
                  </p>
                  <div className="space-y-2.5">
                    {flow.steps.map((step, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-[#08283F]/10 text-[#08283F] text-[10px] font-bold shrink-0 mt-0.5">
                          {index + 1}
                        </div>
                        <p className="text-[#4A5A68] text-xs leading-relaxed">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Select Button */}
                <button
                  type="button"
                  disabled={templateActive && flow.id !== "system_designed"}
                  onClick={() => handleSelect(flow.id)}
                  className={`
                    ${styles.selectButton} cred-btn w-full font-semibold text-sm transition-all
                    ${isSelected
                      ? 'cred-btn-primary'
                      : flow.recommended && !(templateActive && flow.id !== 'system_designed') ? 'cred-btn-primary' : 'cred-btn-secondary'
                    }
                  `}
                >
                  {isSelected ? (
                    <span className="flex items-center justify-center gap-2">
                      <CheckCircle size={16} />
                      Selected
                    </span>
                  ) : (
                    templateActive && flow.id !== "system_designed" ? "Unavailable with active template" : flow.planned ? 'View planned workflow' : 'Start this workflow'
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {currentSelected && (
        <div className="bg-[#E7F1EB] border border-[#2F6F4E]/20 rounded-xl p-4 text-center">
          <p className="text-[#2F6F4E] text-sm font-semibold flex items-center justify-center gap-2">
            <CheckCircle size={16} />
            {selectedDefinition
              ? `${selectedDefinition.title} workflow selected`
              : 'Workflow selected'
            }
          </p>
        </div>
      )}
    </div>
  );
}

// Export flow IDs for easy reference
export const FLOW_IDS = {
  FULL_UPLOAD: "full_upload",
  DESIGN_WITH_CREDENCE: "system_designed",
  TRANSCRIPT_FIRST: "transcript_then_cert", // Existing certificate-only drafts
  ASSISTED_PLACEMENT: "assisted_placement"
};
