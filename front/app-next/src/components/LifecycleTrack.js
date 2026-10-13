"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import styles from "./LifecycleTrack.module.css";

const STEPS = [
  { title: "Prepare the credential", role: "Registrar", body: "Enter the graduate's verified details, upload the transcript, and upload or generate the certificate. Review the entered data against both documents.", result: "Draft credential ready for attestation", href: "/login", cta: "Registrar sign in" },
  { title: "Review and approve", role: "Institutional signatories", body: "The Registrar attests the documents. The Vice-Chancellor and Chancellor review and sign the approval actions on-chain. Returned records go back for correction.", chain: ["Registrar", "Vice-Chancellor", "Chancellor"], result: "Required approvals recorded", href: "/login", cta: "Staff sign in" },
  { title: "Finalize documents and hashes", role: "Registrar / system", body: "Finalize the approved files and calculate separate hashes for the certificate and transcript. Store the documents off-chain through IPFS / Pinata.", result: "Final documents and their fingerprints prepared", href: "#why", cta: "Explore Web3" },
  { title: "Anchor the credential", role: "Registrar", body: "Record the paired document hashes under one credential ID on-chain. Any subsequent change to a document's bytes produces a different hash.", result: "Issued credential linked to its anchored proof", href: "/login", cta: "Registrar sign in" },
  { title: "Graduate claims and shares", role: "Graduate", body: "The Registrar sends a one-time claim token with a 24-hour window. The graduate signs in using the mobile app and claims the certificate and transcript as one credential.", result: "Credential available in the graduate's account", href: "#stakeholders", cta: "Student access guidance" },
  { title: "Verify the issued record", role: "Public / employer", body: "A verifier enters the credential ID or follows its QR link. Public verification returns permitted record details; access to the full documents requires graduate-approved sharing.", result: "Verification outcome displayed", href: "#verify", cta: "Verify a credential" },
];

export default function LifecycleTrack() {
  const timelineRef = useRef(null);
  useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    let frame = null;
    function update() {
      frame = null;
      const markers = timeline.querySelectorAll("[data-timeline-marker]");
      const first = markers[0]?.getBoundingClientRect();
      const last = markers[markers.length - 1]?.getBoundingClientRect();
      if (!first || !last) return;
      const top = first.top + first.height / 2;
      const bottom = last.top + last.height / 2;
      const progress = Math.max(0, Math.min(1, (window.innerHeight * .6 - top) / Math.max(1, bottom - top)));
      timeline.style.setProperty("--timeline-progress", progress);
      timeline.style.setProperty("--timeline-start", `${top - timeline.getBoundingClientRect().top}px`);
      timeline.style.setProperty("--timeline-length", `${bottom - top}px`);
    }
    function schedule() { if (frame === null) frame = requestAnimationFrame(update); }
    const observer = new ResizeObserver(schedule);
    observer.observe(timeline);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <section className={`scroll-anchor ${styles.section}`} id="lifecycle">
      <div className="landing-wrap">
        <div className={styles.heading}>
          <p className="cred-section-kicker">How it works</p>
          <h2 className="cred-section-title mt-3">From academic record to verifiable credential.</h2>
          <p>Follow the certificate and transcript through preparation, institutional approval, anchoring and graduate access.</p>
        </div>
        <ol ref={timelineRef} className={styles.timeline}>
          {STEPS.map((step, index) => (
            <li key={step.title} className={styles.step}>
              <span data-timeline-marker className={styles.number} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <article className={styles.card}>
                <div className={styles.cardHeading}><h3>{step.title}</h3><span className={styles.role}>{step.role}</span></div>
                <p className={styles.body}>{step.body}</p>
                {step.chain && <ol className={styles.chain} aria-label="Approval order">{step.chain.map((role) => <li key={role}>{role}</li>)}</ol>}
                <div className={styles.footer}>
                  <p className={styles.result}><span>Result</span>{step.result}</p>
                  <Link href={step.href} className={styles.cta}>{step.cta}<ArrowUpRight size={14} aria-hidden="true" /></Link>
                </div>
              </article>
            </li>
          ))}
        </ol>
        <p className={styles.note}><strong>Process overview:</strong> these numbered steps explain the lifecycle; they do not indicate that a particular credential has completed it. Hash matching establishes document integrity against the anchored version.</p>
      </div>
    </section>
  );
}
