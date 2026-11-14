"use client";
import NavigationButton from "@/components/ui/NavigationButton";


import { useEffect, useRef, useState } from "react";
import { BookOpen, ArrowRight, ArrowLeft, X } from "lucide-react";
import BrandingGuideVisual from "./BrandingGuideVisual";
import styles from "./BrandingStartGuide.module.css";

export default function BrandingStartGuide({ onContinue, initiallyOpen = true, seenKey = "credence:branding-guide-seen" }) {
  "use no memo";
  const dialog = useRef(null);
  const body = useRef(null);
  const heading = useRef(null);
  const continueRef = useRef(onContinue);
  const [slide, setSlide] = useState(0);
  const [variant, setVariant] = useState("live");
  const titles = ["1. Before field input", "2. Label and configure fields", "3. Saved preview"];
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (!alive || !initiallyOpen) return;
      try {
        if (localStorage.getItem(seenKey)) return;
        localStorage.setItem(seenKey, "1");
      } catch { return; }
      setOpen(true);
    });
    return () => { alive = false; };
  }, [initiallyOpen, seenKey]);
  function finishGuide() {
    dialog.current?.close();
    setOpen(false);
    continueRef.current?.();
  }
  function navigate(next) {
    setSlide(next);
    body.current?.scrollTo({ top: 0 });
    heading.current?.focus();
  }
  useEffect(() => {
    continueRef.current = onContinue;
  }, [onContinue]);
  useEffect(() => {
    const element = dialog.current;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);
  useEffect(() => {
    const element = dialog.current;
    return () => element.close();
  }, []);

  return <div className="self-start" data-branding-start-guide>
    <button type="button" onClick={() => { setSlide(0); setOpen(true); }} className="cred-btn cred-btn-secondary gap-2 self-start">
      <BookOpen size={18} /> Quick guide
    </button>
    <dialog ref={dialog} className={styles.guide} aria-labelledby="branding-start-title" aria-describedby="branding-start-description" onCancel={event => { event.preventDefault(); finishGuide(); }}>
      <header className="border-b border-[#D8DEE6] p-5 sm:p-6">
        <div className="flex items-center gap-3"><BookOpen size={24} className="shrink-0 text-[#B98A28]" /><h3 ref={heading} tabIndex={-1} id="branding-start-title" className="flex-1 text-xl font-semibold">{titles[slide]}</h3><button type="button" onClick={finishGuide} aria-label="Close guide and return to setup" className="rounded-lg p-2 hover:bg-[#EAF2FB]"><X size={20} /></button></div>
        <p id="branding-start-description" className="mt-2 text-sm text-[#4A5A68]">{"Follow these examples made from the two supplied Credence drafts."}</p>
      </header>
      <div ref={body} className={`${styles.body} p-5 sm:p-6`}>
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Example PDF format">
          {[['live', 'Live-text draft'], ['flattened', 'Flattened draft']].map(([value, name]) => <button key={value} type="button" aria-pressed={variant === value} onClick={() => setVariant(value)} className={`cred-btn ${variant === value ? 'cred-btn-primary' : 'cred-btn-secondary'}`}>{name}</button>)}
        </div>
        <BrandingGuideVisual stage={slide} variant={variant} />
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#D8DEE6] bg-white p-5">
        <span role="status" className="text-sm text-[#687B8E]">Step {slide + 1} of 3</span>
        <div className="flex items-center gap-3">
          {slide > 0 && <NavigationButton direction="back" type="button" onClick={() => navigate(slide - 1)} className="cd-btn-secondary inline-flex items-center gap-2"><ArrowLeft size={18} /> Back</NavigationButton>}
          {slide < 2 ? <NavigationButton type="button" onClick={() => navigate(slide + 1)} className="cd-btn-primary inline-flex items-center gap-2">{slide === 0 ? "Next: field setup" : "Next: saved preview"} <ArrowRight size={18} /></NavigationButton> : <NavigationButton type="button" onClick={finishGuide} className="cd-btn-primary inline-flex items-center gap-2">Continue to setup <ArrowRight size={18} /></NavigationButton>}
        </div>
      </footer>
    </dialog>
  </div>;
}
