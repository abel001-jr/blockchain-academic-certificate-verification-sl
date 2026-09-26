"use client";
import { useState } from "react";
import { Upload, Sparkles, FileText, CheckCircle } from "lucide-react";

/**
 * WorkflowFlowSelector Component
 * 
 * Displays the three certificate workflow flows and allows users to select one:
 * 1. Full Upload (Upload both certificate and transcript together)
 * 2. Design with Credence (Upload transcript, then design certificate - RECOMMENDED)
 * 3. Upload certificate to transcript (Upload transcript first, certificate later)
 */

const FLOWS = {
  FULL_UPLOAD: {
    id: "full_upload",
    title: "Upload both",
    description: "Certificate and transcript uploaded together as one record.",
    icon: Upload,
    iconColor: "text-[#08283F]",
    bgColor: "bg-[#08283F]/5",
    borderColor: "border-[#08283F]/20",
    steps: [
      "Upload certificate and transcript (PDF)",
      "Registrar submits (first approval)",
      "Registrar, VC, and Dean approval (quorum)",
      "Pin both files to IPFS",
      "Finalize on blockchain"
    ]
  },
  DESIGN_WITH_CREDENCE: {
    id: "system_designed",
    title: "Design with Credence",
    description: "Upload transcript, then design and generate the certificate in Credence.",
    icon: Sparkles,
    iconColor: "text-[#B98A28]",
    bgColor: "bg-[#B98A28]/5",
    borderColor: "border-[#B98A28]/30",
    recommended: true,
    steps: [
      "Upload student transcript (PDF)",
      "Registrar submits (first approval)",
      "Design certificate with Credence",
      "Registrar, VC, and Dean approval (quorum)",
      "System generates certificate PDF",
      "Pin transcript to IPFS, finalize on blockchain"
    ]
  },
  TRANSCRIPT_FIRST: {
    id: "transcript_then_cert",
    title: "Upload certificate to transcript",
    description: "Transcript uploaded now; certificate uploaded later and linked as one record.",
    icon: FileText,
    iconColor: "text-[#2F6F4E]",
    bgColor: "bg-[#2F6F4E]/5",
    borderColor: "border-[#2F6F4E]/20",
    steps: [
      "Upload transcript now (PDF)",
      "Registrar submits (first approval)",
      "Upload certificate when ready, linked to this transcript",
      "Registrar, VC, and Dean approval (quorum)",
      "Pin both files to IPFS",
      "Finalize on blockchain"
    ]
  }
};

export default function WorkflowFlowSelector({ onSelect, selectedFlow, variant = "card" }) {
  const [localSelected, setLocalSelected] = useState(selectedFlow || null);
  const currentSelected = selectedFlow || localSelected;

  const handleSelect = (flowId) => {
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
                    <h4 className="text-[#08283F] font-semibold text-sm mb-1">{flow.title}</h4>
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
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h3 className="text-[#08283F] font-bold text-xl mb-2">Choose Your Workflow</h3>
        <p className="text-[#4A5A68] text-sm max-w-2xl mx-auto">
          Select how you want to process this certificate. Each workflow follows a different approval path.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {Object.values(FLOWS).map((flow) => {
          const Icon = flow.icon;
          const isSelected = currentSelected === flow.id;
          
          return (
            <div
              key={flow.id}
              className={`
                relative rounded-2xl border-2 overflow-hidden transition-all
                ${isSelected 
                  ? `${flow.borderColor} ${flow.bgColor} shadow-lg` 
                  : 'border-[#E4E1D6] bg-white hover:border-[#08283F]/20 hover:shadow-md'
                }
              `}
            >
              {flow.recommended && (
                <div className="absolute top-4 right-4 z-10">
                  <span className="bg-[#B98A28] text-white text-xs font-bold px-3 py-1 rounded-full">
                    Recommended
                  </span>
                </div>
              )}

              <div className="p-6 flex flex-col h-full">
                {/* Icon */}
                <div className={`w-14 h-14 rounded-xl ${flow.bgColor} flex items-center justify-center mb-4`}>
                  <Icon size={28} className={flow.iconColor} />
                </div>

                {/* Title & Description */}
                <h4 className="text-[#08283F] font-bold text-lg mb-2">{flow.title}</h4>
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
                  onClick={() => handleSelect(flow.id)}
                  className={`
                    w-full py-3 rounded-xl font-semibold text-sm transition-all
                    ${isSelected
                      ? 'bg-[#08283F] text-white'
                      : 'bg-[#08283F]/10 text-[#08283F] hover:bg-[#08283F]/20'
                    }
                  `}
                >
                  {isSelected ? (
                    <span className="flex items-center justify-center gap-2">
                      <CheckCircle size={16} />
                      Selected
                    </span>
                  ) : (
                    'Select this flow'
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
            {FLOWS[currentSelected.toUpperCase()] 
              ? `${FLOWS[currentSelected.toUpperCase()].title} workflow selected`
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
  TRANSCRIPT_FIRST: "transcript_then_cert"
};
