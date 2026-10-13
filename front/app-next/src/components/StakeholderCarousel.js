"use client";
import LandingCard from "./ui/LandingCard";
import { ShieldCheck } from "lucide-react";
import NavigationButton from "./ui/NavigationButton";

import { useEffect, useRef } from "react";

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

function StakeNode({ index, title, body, onStudentAccess }) {
  return (
    <LandingCard variant="luminous" icon={ShieldCheck} title={title} footer={index}
      href={title === "Student" ? undefined : title === "Employer / verifier" ? "/#verify" : "/login"}
      onAction={title === "Student" ? onStudentAccess : undefined}
      cta={title === "Student" ? "How to access your credentials" : title === "Employer / verifier" ? "Verify a credential" : "Sign in to your account"}
      className="flex-[0_0_250px] !h-auto">
      <p>{body}</p>
    </LandingCard>
  );
}

export default function StakeholderCarousel() {
  const scrollerRef = useRef(null);
  const studentDialogRef = useRef(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let hovered = false;
    let touching = false;
    let resumeAt = 0;
    let lastTime = 0;
    let position = scroller.scrollLeft;
    let maxScroll = 0;
    let endWait = 0;
    let rewindElapsed = 0;
    let rewindFrom = null;
    let rafId;

    function measure() {
      maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      position = Math.min(scroller.scrollLeft, maxScroll);
      rewindFrom = null;
      endWait = 0;
    }
    function frame(now) {
      const delta = lastTime ? Math.min(now - lastTime, 50) : 0;
      lastTime = now;
      const paused = motionQuery.matches || hovered || touching ||
        scroller.contains(document.activeElement) || studentDialogRef.current?.open || now < resumeAt;
      if (!paused && maxScroll > 0) {
        if (rewindFrom !== null) {
          rewindElapsed += delta;
          const progress = Math.min(rewindElapsed / 900, 1);
          const eased = progress < .5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
          position = rewindFrom * (1 - eased);
          if (progress === 1) { rewindFrom = null; endWait = 0; }
        } else if (position >= maxScroll - 1) {
          endWait += delta;
          if (endWait >= 1500) { rewindFrom = position; rewindElapsed = 0; }
        } else {
          position = Math.min(position + delta * .027, maxScroll);
        }
        scroller.scrollLeft = position;
      } else {
        position = scroller.scrollLeft;
      }
      rafId = requestAnimationFrame(frame);
    }
    function enter() { hovered = true; }
    function leave() { hovered = false; }
    function touchStart() { touching = true; }
    function defer() {
      touching = false;
      resumeAt = performance.now() + 3500;
      rewindFrom = null;
      endWait = 0;
    }
    function manualNudge(dir) {
      defer();
      const atStart = scroller.scrollLeft <= 1;
      const atEnd = scroller.scrollLeft >= maxScroll - 1;
      scroller.scrollTo({
        left: dir < 0 && atStart ? maxScroll : dir > 0 && atEnd ? 0 : scroller.scrollLeft + dir * 268,
        behavior: motionQuery.matches ? "instant" : "smooth",
      });
    }
    const prev = document.getElementById("stakePrev");
    const next = document.getElementById("stakeNext");
    const previousCard = () => manualNudge(-1);
    const nextCard = () => manualNudge(1);
    prev?.addEventListener("click", previousCard);
    next?.addEventListener("click", nextCard);
    scroller.addEventListener("mouseenter", enter);
    scroller.addEventListener("mouseleave", leave);
    scroller.addEventListener("touchstart", touchStart, { passive: true });
    scroller.addEventListener("touchend", defer);
    scroller.addEventListener("touchcancel", defer);
    scroller.addEventListener("wheel", defer, { passive: true });
    scroller.addEventListener("focusout", defer);
    window.addEventListener("resize", measure);
    measure();
    rafId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafId);
      prev?.removeEventListener("click", previousCard);
      next?.removeEventListener("click", nextCard);
      scroller.removeEventListener("mouseenter", enter);
      scroller.removeEventListener("mouseleave", leave);
      scroller.removeEventListener("touchstart", touchStart);
      scroller.removeEventListener("touchend", defer);
      scroller.removeEventListener("touchcancel", defer);
      scroller.removeEventListener("wheel", defer);
      scroller.removeEventListener("focusout", defer);
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <div className="relative">
      <dialog ref={studentDialogRef} aria-labelledby="student-access-title" aria-describedby="student-access-description" className="student-access-dialog">
        <h3 id="student-access-title">Access your student credentials</h3>
        <p id="student-access-description">Contact your registrar to get your account details, then sign in using the mobile app to access your credentials.</p>
        <form method="dialog"><button autoFocus className="cred-btn cred-btn-primary">Got it</button></form>
      </dialog>
      <div className="stake-carousel-mask">
        <div className="stake-diagram" id="stakeScroll" ref={scrollerRef}>
          {STAKEHOLDERS.map((s) => (
            <StakeNode key={s.index} {...s} onStudentAccess={() => studentDialogRef.current?.showModal()} />
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2.5 mt-0.5">
        <NavigationButton direction="back"
          id="stakePrev"
          type="button"
          aria-label="Scroll left"
          className="w-[38px] h-[38px] rounded-full border border-[#E4E1D6] bg-white flex items-center justify-center cursor-pointer text-[#08283F] hover:bg-[#08283F] hover:border-[#08283F] hover:text-white transition-colors"
        >
          Previous
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </NavigationButton>
        <NavigationButton
          id="stakeNext"
          type="button"
          aria-label="Scroll right"
          className="w-[38px] h-[38px] rounded-full border border-[#E4E1D6] bg-white flex items-center justify-center cursor-pointer text-[#08283F] hover:bg-[#08283F] hover:border-[#08283F] hover:text-white transition-colors"
        >
          Next
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </NavigationButton>
      </div>
    </div>
  );
}
