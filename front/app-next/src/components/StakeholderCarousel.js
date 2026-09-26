"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/prefersReducedMotion";

const STAKEHOLDERS = [
  {
    index: "01 · Issuer",
    title: "Registrar",
    body:  "Creates certificate records, triggers the on-chain anchoring transaction, and delivers the finished credential to the student.",
  },
  {
    index: "02 · Oversight",
    title: "Institutional admin",
    body:  "Manages the institution's officer accounts, approves role assignments, and controls which staff can issue or approve credentials.",
  },
  {
    index: "03 · Recipient",
    title: "Student",
    body:  "Receives their blockchain-anchored certificate, generates shareable links or QR codes, and controls who can access their record.",
  },
  {
    index: "04 · Verifier",
    title: "Employer / verifier",
    body:  "Pastes a certificate ID or scans a QR code to confirm authenticity instantly — no account, no contact with the institution.",
  },
  {
    index: "05 · Platform",
    title: "System administrator",
    body:  "Onboards institutions, anchors them on-chain, and keeps the platform's contract and user roles in a consistent state.",
  },
];

function StakeNode({ index, title, body, hidden = false }) {
  return (
    <div
      className="flex-[0_0_250px] p-[26px_24px] bg-white border border-[#E4E1D6] border-l-[3px] border-l-[#B98A28]"
      aria-hidden={hidden || undefined}
    >
      <span className="block text-[0.78rem] text-[#B98A28] font-semibold mb-2.5">{index}</span>
      <h3 className="text-base font-semibold text-[#08283F] mb-2">{title}</h3>
      <p className="text-[0.88rem] text-[#4A5A68] leading-normal">{body}</p>
    </div>
  );
}

export default function StakeholderCarousel() {
  const scrollerRef = useRef(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const reduceMotion = prefersReducedMotion();
    const speed = 0.45;
    let halfWidth = 0;
    let paused = reduceMotion;
    let resumeTimeout = null;
    let rafId = null;

    function measure() {
      halfWidth = scroller.scrollWidth / 2;
    }

    function frame() {
      if (!paused) {
        scroller.scrollLeft += speed;
        if (scroller.scrollLeft >= halfWidth) {
          scroller.scrollLeft -= halfWidth;
        }
      }
      rafId = requestAnimationFrame(frame);
    }

    function pause() {
      paused = true;
    }
    function resumeSoon() {
      if (reduceMotion) return;
      if (resumeTimeout) clearTimeout(resumeTimeout);
      resumeTimeout = setTimeout(() => {
        paused = false;
      }, 3500);
    }
    function resumeNow() {
      if (reduceMotion) return;
      if (resumeTimeout) clearTimeout(resumeTimeout);
      paused = false;
    }
    function manualNudge(dir) {
      pause();
      scroller.scrollBy({
        left: dir * 268,
        behavior: reduceMotion ? "instant" : "smooth",
      });
      resumeSoon();
    }

    const prev = document.getElementById("stakePrev");
    const next = document.getElementById("stakeNext");

    prev?.addEventListener("click", () => manualNudge(-1));
    next?.addEventListener("click", () => manualNudge(1));
    scroller.addEventListener("mouseenter", pause);
    scroller.addEventListener("mouseleave", resumeNow);
    scroller.addEventListener("focusin", pause);
    scroller.addEventListener("focusout", resumeSoon);
    scroller.addEventListener("touchstart", pause, { passive: true });
    scroller.addEventListener("touchend", resumeSoon, { passive: true });
    scroller.addEventListener("wheel", () => {
      pause();
      resumeSoon();
    }, { passive: true });

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    function onMotionChange(e) {
      if (e.matches) {
        paused = true;
        if (resumeTimeout) clearTimeout(resumeTimeout);
      }
    }
    motionQuery.addEventListener("change", onMotionChange);
    window.addEventListener("resize", measure);

    measure();
    if (!reduceMotion) {
      rafId = requestAnimationFrame(frame);
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (resumeTimeout) clearTimeout(resumeTimeout);
      window.removeEventListener("resize", measure);
      motionQuery.removeEventListener("change", onMotionChange);
    };
  }, []);

  return (
    <div className="relative">
      <div className="stake-carousel-mask">
        <div className="stake-diagram" id="stakeScroll" ref={scrollerRef}>
          {STAKEHOLDERS.map((s) => (
            <StakeNode key={s.index} {...s} />
          ))}
          {STAKEHOLDERS.map((s) => (
            <StakeNode key={`dup-${s.index}`} {...s} hidden />
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2.5 mt-0.5">
        <button
          id="stakePrev"
          type="button"
          aria-label="Scroll left"
          className="w-[38px] h-[38px] rounded-full border border-[#E4E1D6] bg-white flex items-center justify-center cursor-pointer text-[#08283F] hover:bg-[#08283F] hover:border-[#08283F] hover:text-white transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <button
          id="stakeNext"
          type="button"
          aria-label="Scroll right"
          className="w-[38px] h-[38px] rounded-full border border-[#E4E1D6] bg-white flex items-center justify-center cursor-pointer text-[#08283F] hover:bg-[#08283F] hover:border-[#08283F] hover:text-white transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
