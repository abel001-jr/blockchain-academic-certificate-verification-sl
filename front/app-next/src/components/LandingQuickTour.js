"use client";
import {useRef, useState} from "react";
import {ArrowRight, X, Compass, ShieldCheck, GraduationCap, Building2} from "lucide-react";
import styles from "./LandingQuickTour.module.css";

const steps = [
  {title: "Institutions issue trusted records", description: "Authorized institution staff prepare credentials, collect officer approvals and finalize the record on the blockchain.", icon: Building2},
  {title: "Graduates keep control of access", description: "Claim the invitation from your institution in the student app. View your documents and create a time-limited, single-use link when an employer needs access.", icon: GraduationCap},
  {title: "Employers check the evidence", description: "Use a credential ID for a public record check. With a student share link, validate access and compare original PDFs against the on-chain commitments.", icon: ShieldCheck},
];

export default function LandingQuickTour() {
  const [step, setStep] = useState(0);
  const dialog = useRef(null);
  const heading = useRef(null);
  function start() {setStep(0); dialog.current.showModal();}
  function advance() {
    if (step === steps.length - 1) {
      dialog.current.close();
      document.getElementById("verify")?.scrollIntoView({behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
      document.querySelector("#verify input[type=text]")?.focus({preventScroll: true});
      return;
    }
    setStep(value => value + 1);
    requestAnimationFrame(() => heading.current?.focus());
  }
  const StepIcon = steps[step].icon;
  return <section id="quick-tour" className={`scroll-anchor ${styles.section}`} aria-labelledby="quick-tour-title">
    <div className={`landing-wrap ${styles.layout}`}>
      <div className={styles.intro}>
        <p className={styles.eyebrow}><Compass size={15} aria-hidden="true" /> A quick introduction</p>
        <h2 id="quick-tour-title">Your credentials.<br />A clearer path to trust.</h2>
        <p className={styles.description}>See how Credence connects institutions, graduates and employers?from issuing a record to checking its authenticity.</p>
        <button type="button" onClick={start} className="cred-btn cred-btn-primary">Take the quick tour <ArrowRight size={17} aria-hidden="true" /></button>
      </div>
      <ol className={styles.steps}>{steps.map((item, index) => <li key={item.title}><span className={styles.number}>0{index + 1}</span><div><h3>{item.title}</h3><p>{index === 0 ? "Prepare, approve and issue." : index === 1 ? "Access your records. Choose who can verify." : "Check the record and original documents."}</p></div></li>)}</ol>
    </div>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="tour-step-title" onClick={event => {if (event.target === event.currentTarget) dialog.current.close();}}>
      <div className={styles.dialogBody}>
        <button type="button" className={styles.close} aria-label="Close quick tour" onClick={() => dialog.current.close()}><X size={21} /></button>
        <p className={styles.eyebrow}>Quick tour ? {step + 1} of {steps.length}</p>
        <StepIcon size={32} className={styles.stepIcon} aria-hidden="true" />
        <h2 ref={heading} tabIndex={-1} id="tour-step-title">{steps[step].title}</h2>
        <p className={styles.description}>{steps[step].description}</p>
        <div className={styles.progress} aria-hidden="true">{steps.map((item, index) => <span key={item.title} data-active={index <= step} />)}</div>
        <button type="button" onClick={advance} className="cred-btn cred-btn-primary">{step === steps.length - 1 ? "Start verifying" : "Continue"}<ArrowRight size={17} aria-hidden="true" /></button>
      </div>
    </dialog>
  </section>;
}
