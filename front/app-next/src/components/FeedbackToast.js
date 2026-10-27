"use client";

import { createContext, useCallback, useContext, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

const FeedbackContext = createContext(null);
const variants = {
  error: { icon: AlertCircle, color: "#A23B34", title: "Action failed" },
  warning: { icon: AlertTriangle, color: "#916319", title: "Attention required" },
  success: { icon: CheckCircle2, color: "#2F6B4F", title: "Action completed" },
  info: { icon: Info, color: "#08283F", title: "Issuance update" },
};

export function FeedbackToastProvider({ children }) {
  const [messages, setMessages] = useState({});
  const [portalTarget, setPortalTarget] = useState(null);
  useEffect(() => {
    const updateTarget = () => {
      const dialogs = document.querySelectorAll("dialog[open]");
      setPortalTarget(dialogs[dialogs.length - 1] || document.body);
    };
    queueMicrotask(updateTarget);
    const observer = new MutationObserver(updateTarget);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
    return () => observer.disconnect();
  }, []);
  const publish = useCallback((id, notice) => {
    setMessages(previous => {
      const next = { ...previous };
      if (notice) next[id] = notice; else delete next[id];
      return next;
    });
  }, []);
  return <FeedbackContext.Provider value={publish}>
    {children}
    {Object.keys(messages).length > 0 && createPortal(
      <aside aria-label="Action feedback" className="fixed right-4 top-4 z-[200] flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md flex-col gap-3 overflow-y-auto">
        {Object.entries(messages).map(([id, notice]) => {
          const variant = variants[notice.tone] || variants.error;
          const Icon = variant.icon;
          return <div key={id} role={notice.tone === "error" || notice.tone === "warning" ? "alert" : "status"} aria-atomic="true" className="flex shrink-0 items-start gap-3 rounded-xl border border-[#E4E1D6] border-l-4 bg-white p-4 shadow-xl" style={{ borderLeftColor: variant.color }}>
            <Icon size={20} className="mt-0.5 shrink-0" style={{ color: variant.color }} aria-hidden="true" />
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold" style={{ color: variant.color }}>{notice.title || variant.title}</p><p className="mt-1 whitespace-pre-line break-words text-sm leading-relaxed text-[#4A5A68]">{notice.message}</p></div>
            <button type="button" onClick={() => publish(id, null)} aria-label={`Dismiss ${notice.title || variant.title}`} className="shrink-0 rounded p-1 text-[#4A5A68] hover:bg-[#F5F3ED] focus-visible:outline-2 focus-visible:outline-offset-2"><X size={16} aria-hidden="true" /></button>
          </div>;
        })}
      </aside>, portalTarget || document.body,
    )}
  </FeedbackContext.Provider>;
}

export default function FeedbackToast({ message, title, tone = "error" }) {
  const publish = useContext(FeedbackContext);
  const id = useId();
  useEffect(() => {
    if (!publish || !message) return;
    publish(id, { message, title, tone });
    return () => publish(id, null);
  }, [publish, id, message, title, tone]);
  return null;
}
