"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/prefersReducedMotion";
import { FilePenLine, Link2, ShieldCheck } from "lucide-react";

const STEPS = [
  {
    number: "01",
    title: "Issued",
    body: "The registrar creates the credential record inside the university's system and populates it with the recipient's verified academic details.",
    state: "Certificate state: drafted, unsigned",
  },
  {
    number: "02",
    title: "Hashed",
    body: "A unique digital fingerprint is generated from the certificate's contents. Any later change to the document would produce a different fingerprint.",
    state: "Certificate state: fingerprint generated",
  },
  {
    number: "03",
    title: "Stored",
    body: "The certificate document itself is placed in secure, redundant storage, separate from the fingerprint that will be recorded on-chain.",
    state: "Certificate state: document secured",
  },
  {
    number: "04",
    title: "Recorded",
    body: "The fingerprint, issuer, and timestamp are written to the blockchain — an integrity record that no single party, including the university, can quietly alter.",
    state: "Certificate state: anchored on-chain",
  },
  {
    number: "05",
    title: "Received",
    body: "The student receives the finished credential, including its certificate ID and QR code, ready to share with any employer or institution.",
    state: "Certificate state: delivered",
  },
  {
    number: "06",
    title: "Verified",
    body: "An employer or third party checks the certificate ID or scans the QR code. The record is confirmed directly against the blockchain — no call to the registrar required.",
    state: "Certificate state: independently confirmed",
  },
];

const SUMMARY_STEPS = [
  { icon: FilePenLine, title: "Issue credential", body: "Universities create and issue a digital credential on the blockchain." },
  { icon: Link2, title: "Share with recipient", body: "The finished credential is shared securely with the graduate or employer." },
  { icon: ShieldCheck, title: "Verify anywhere", body: "Anyone can verify the credential instantly." },
];

function CheckIcon() {
  return (
    <svg className="lc-check hidden w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function applyRowState(row, marker, cls) {
  row.classList.remove("reached", "complete");
  marker.classList.remove("reached", "complete");
  if (!cls) {
    marker.querySelector(".lc-check")?.classList.add("hidden");
    marker.querySelector(".lc-check")?.classList.remove("block");
    marker.querySelector(".lc-num-text")?.classList.remove("hidden");
    return;
  }
  row.classList.add(cls);
  marker.classList.add(cls);
  if (cls === "complete") {
    marker.querySelector(".lc-check")?.classList.remove("hidden");
    marker.querySelector(".lc-check")?.classList.add("block");
    marker.querySelector(".lc-num-text")?.classList.add("hidden");
  }
}

function applyStaticReducedMotion(track, fill) {
  fill.style.clipPath = "inset(0 0 0 0)";
  const rows = Array.from(track.querySelectorAll(".lc-row"));
  rows.forEach((row, i) => {
    const marker = row.querySelector(".lc-marker");
    const cls = i === rows.length - 1 ? "complete" : "reached";
    applyRowState(row, marker, cls);
  });
}

export default function LifecycleTrack() {
  const trackRef = useRef(null);
  const fillRef = useRef(null);

  useEffect(() => {
    const track = trackRef.current;
    const fill = fillRef.current;
    if (!track || !fill) return;

    const reduceMotion = prefersReducedMotion();
    if (reduceMotion) {
      applyStaticReducedMotion(track, fill);
      return;
    }

    const rows = Array.from(track.querySelectorAll(".lc-row"));

    function update() {
      const rect = track.getBoundingClientRect();
      const trackHeight = track.offsetHeight;
      const viewportLine = window.innerHeight * 0.58;
      let progressPx = viewportLine - rect.top;
      progressPx = Math.max(0, Math.min(progressPx, trackHeight));
      const progressPct = trackHeight ? (progressPx / trackHeight) * 100 : 0;
      fill.style.clipPath = `inset(0 0 ${100 - progressPct}% 0)`;

      rows.forEach((row, i) => {
        const marker = row.querySelector(".lc-marker");
        const markerCenter = row.offsetTop + marker.offsetTop + marker.offsetHeight / 2;
        const isLast = i === rows.length - 1;
        if (progressPx >= markerCenter) {
          applyRowState(row, marker, isLast ? "complete" : "reached");
        } else {
          applyRowState(row, marker, null);
        }
      });
    }

    let ticking = false;
    function onScroll() {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          update();
          ticking = false;
        });
        ticking = true;
      }
    }

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    function onMotionChange(e) {
      if (e.matches) {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
        applyStaticReducedMotion(track, fill);
      }
    }
    motionQuery.addEventListener("change", onMotionChange);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      motionQuery.removeEventListener("change", onMotionChange);
    };
  }, []);

  return (
    <section className="scroll-anchor bg-[#F8F7F2] py-20 sm:py-24" id="lifecycle">
      <div className="landing-wrap">
        <div className="max-w-[600px] mb-10">
          <p className="cred-section-kicker">How it works</p>
          <h2 className="font-serif text-[2.5rem] font-medium text-[#08283F] leading-[1.22] max-lg:text-[2.1rem]">
            The certificate&apos;s path from issue to verification
          </h2>
          <p className="mt-4 text-[#4A5A68] text-[1.08rem] max-w-[54ch]">
            One credential, six stages — each one building directly on the last.
          </p>
        </div>

        <div className="mb-14 grid gap-3 sm:grid-cols-3">
          {SUMMARY_STEPS.map(({ icon: Icon, title, body }, index) => (
            <article key={title} className="relative rounded-md border border-[#E4E1D6] bg-white p-5">
              <span className="absolute -left-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-[#B98A28] text-[.68rem] font-bold text-white">{index + 1}</span>
              <Icon size={22} className="text-[#B98A28]" strokeWidth={1.5} />
              <h3 className="mt-5 text-sm font-semibold text-[#08283F]">{title}</h3>
              <p className="mt-2 text-[.82rem] leading-5 text-[#4A5A68]">{body}</p>
            </article>
          ))}
        </div>
        <div className="relative max-w-[760px]" ref={trackRef}>
          <div className="lc-track-line" />
          <div className="lc-track-fill" ref={fillRef} />

          {STEPS.map((step) => (
            <div key={step.number} className="lc-row grid grid-cols-[44px_1fr] gap-8 py-[34px] items-start relative z-[2]" data-stage={step.number}>
              <div className="lc-marker w-11 h-11 rounded-full bg-[#F8F7F2] border-[1.5px] border-[#E4E1D6] flex items-center justify-center font-serif text-[0.82rem] text-[#4A5A68] font-medium transition-all duration-350">
                <span className="lc-num-text">{step.number}</span>
                <CheckIcon />
              </div>
              <div>
                <h3 className="text-[1.25rem] font-semibold text-[#08283F] mb-2">{step.title}</h3>
                <p className="text-[#4A5A68] text-[1rem] leading-relaxed max-w-[64ch]">{step.body}</p>
                <div className="lc-state text-[0.85rem] text-[#4A5A68] mt-2.5 italic">{step.state}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
