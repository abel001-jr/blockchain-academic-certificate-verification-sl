"use client";
import { useState } from "react";
import DashboardTooltip from "./DashboardTooltip";
import styles from "./SignerCharts.module.css";

export default function SignerCharts({ pending, approvals, loading }) {
  const [activeSlice, setActiveSlice] = useState("ready");
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    return { label: date.toLocaleDateString("en", { month: "short" }), title: date.toLocaleDateString("en", { month: "long", year: "numeric" }), count: approvals.filter(entry => { const event = new Date(entry.timestamp); return event.getFullYear() === date.getFullYear() && event.getMonth() === date.getMonth(); }).length };
  });
  const max = Math.max(1, ...months.map(month => month.count));
  const ready = pending.filter(cert => !!cert.tx_hash).length;
  const awaiting = pending.length - ready;
  const percent = pending.length ? ready / pending.length * 100 : 0;
  const angle = percent / 100 * Math.PI * 2;
  const point = `${100 + 88 * Math.sin(angle)},${100 - 88 * Math.cos(angle)}`;
  const sliceCount = activeSlice === "ready" ? ready : awaiting;
  const sliceLabel = activeSlice === "ready" ? "Submitted on-chain" : "Submission needed";
  return <section className={styles.grid} aria-label="Signing analytics">
    <article className={styles.card}><h3>Approval activity</h3><p>Recorded approvals for your role - last six months</p>
      {loading ? <div className={styles.loading} role="status" aria-label="Loading approval chart"><span>Loading approval activity...</span><div className={styles.skeletonBars} aria-hidden="true">{[45,75,55,90,65,80].map((height,index) => <i key={index} style={{ height: `${height}%` }} />)}</div></div> : <div className={styles.bars}>{months.map((month,index) => <DashboardTooltip key={month.title} title={month.title} detail={`${month.count} approvals recorded for your role.`}><button type="button" className={styles.column} style={{ "--bar-delay": `${index * 70}ms` }} aria-label={`${month.title}: ${month.count} approvals`}><strong>{month.count}</strong><span className={styles.track}><i style={{ height: `${month.count / max * 100}%` }} /></span><span>{month.label}</span></button></DashboardTooltip>)}</div>}
      {!loading && months.every(month => month.count === 0) && <p className={styles.empty}>No approvals recorded in the last six months.</p>}
    </article>
    <article className={styles.card}><h3>Signature queue readiness</h3><p>Current pending credentials, grouped by on-chain submission</p>
      <div className={styles.pieLayout}><DashboardTooltip className={styles.pieWrapper} title={sliceLabel} detail={`${sliceCount} credentials ? ${pending.length ? (sliceCount / pending.length * 100).toFixed(1) : 0}% of the signature queue.`}>
        <svg className={styles.pie} viewBox="0 0 200 200" role="group" aria-label="Signature queue readiness">
          {pending.length === 0 ? <circle cx="100" cy="100" r="88" fill="#E4E1D6" /> : <>
            {awaiting > 0 && (ready === 0 ? <circle cx="100" cy="100" r="88" fill="#D8D5CA" tabIndex={0} aria-label={`Submission needed: ${awaiting}`} onMouseEnter={() => setActiveSlice("awaiting")} onFocus={() => setActiveSlice("awaiting")} /> : <path d={`M100,100 L${point} A88,88 0 ${percent < 50 ? 1 : 0},1 100,12 Z`} fill="#D8D5CA" tabIndex={0} aria-label={`Submission needed: ${awaiting}`} onMouseEnter={() => setActiveSlice("awaiting")} onFocus={() => setActiveSlice("awaiting")} onClick={() => setActiveSlice("awaiting")} />)}
            {ready > 0 && (awaiting === 0 ? <circle cx="100" cy="100" r="88" fill="#08283F" tabIndex={0} aria-label={`Submitted on-chain: ${ready}`} onMouseEnter={() => setActiveSlice("ready")} onFocus={() => setActiveSlice("ready")} /> : <path d={`M100,100 L100,12 A88,88 0 ${percent > 50 ? 1 : 0},1 ${point} Z`} fill="#08283F" tabIndex={0} aria-label={`Submitted on-chain: ${ready}`} onMouseEnter={() => setActiveSlice("ready")} onFocus={() => setActiveSlice("ready")} onClick={() => setActiveSlice("ready")} />)}
          </>}
        </svg>
      </DashboardTooltip>
      <div className={styles.legend}>{[{ label: "Submitted on-chain", count: ready, color: "#08283F", detail: "Pending credentials with a submission transaction. Review the documents before signing." }, { label: "Submission needed", count: awaiting, color: "#D8D5CA", detail: "Pending credentials without a submission transaction. Ask the Registrar to submit them before approval." }].map(item => <DashboardTooltip key={item.label} title={item.label} detail={item.detail}><button type="button"><i style={{ background: item.color }} />{item.label}<strong>{item.count}</strong></button></DashboardTooltip>)}{!pending.length && <p>No credentials awaiting your signature.</p>}</div></div>
    </article>
  </section>;
}
