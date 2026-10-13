"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export default function FloatingDetailDialog({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; dialog.close(); };
  }, []);
  return <dialog ref={ref} onCancel={event => { event.preventDefault(); onClose(); }} aria-labelledby="floating-detail-title" className="fixed inset-0 m-auto max-h-[90vh] w-[min(1000px,94vw)] overflow-y-auto rounded-2xl border bg-[#F8F7F2] p-5 shadow-2xl backdrop:bg-black/40">
    <div className="sticky top-0 z-10 mb-5 flex items-center justify-between gap-4 rounded-xl bg-white p-4"><h2 id="floating-detail-title" className="text-xl font-semibold">{title}</h2><button type="button" onClick={onClose} aria-label="Close details" className="rounded-lg p-2"><X size={20} /></button></div>
    {children}
  </dialog>;
}
