"use client";
import { useState } from "react";
import DashboardTooltip from "./DashboardTooltip";
import OfficerMonthlyBar from "./OfficerMonthlyBar";
import styles from "./SignerCharts.module.css";

export function SignatureQueueCard({ pending: allPending }) {
  const [period, setPeriod] = useState(6);
  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth() - period + 1, 1);
  const pending = allPending.filter(cert => { const date = new Date(cert.created_at); return date >= since && date <= now; });
  const [activeSlice, setActiveSlice] = useState("ready");
  const ready = pending.filter(cert => !!cert.tx_hash).length;
  const awaiting = pending.length - ready;
  const percent = pending.length ? ready / pending.length * 100 : 0;
  const angle = percent / 100 * Math.PI * 2;
  const point = `${100 + 88 * Math.sin(angle)},${100 - 88 * Math.cos(angle)}`;
  const sliceCount = activeSlice === "ready" ? ready : awaiting;
  const sliceLabel = activeSlice === "ready" ? "Submitted on-chain" : "Submission needed";
  return <article className={`${styles.card} ${styles.queueCard}`}><div className={styles.chartHeader}><div className="flex flex-wrap items-start justify-between gap-3"><h3>Signature queue readiness</h3><label className="text-xs text-[#4A5A68]">Period<select data-dropdown="compact" aria-label="Signature queue period" className="cd-input mt-1" value={period} onChange={event => setPeriod(Number(event.target.value))}>{[3, 6, 9, 12].map(value => <option key={value} value={value}>{value} months</option>)}</select></label></div><p>Current pending credentials created in the last {period} months</p></div>
      <div className={styles.pieLayout}><DashboardTooltip className={styles.pieWrapper} title={sliceLabel} detail={`${sliceCount} credentials ? ${pending.length ? (sliceCount / pending.length * 100).toFixed(1) : 0}% of the signature queue.`}>
        <svg key={period} className={styles.pie} viewBox="0 0 200 200" role="group" aria-label="Signature queue readiness">
          {pending.length === 0 ? <circle cx="100" cy="100" r="88" fill="#E4E1D6" /> : <>
            {awaiting > 0 && (ready === 0 ? <circle cx="100" cy="100" r="88" fill="#D8D5CA" tabIndex={0} aria-label={`Submission needed: ${awaiting}`} onMouseEnter={() => setActiveSlice("awaiting")} onFocus={() => setActiveSlice("awaiting")} /> : <path d={`M100,100 L${point} A88,88 0 ${percent < 50 ? 1 : 0},1 100,12 Z`} fill="#D8D5CA" tabIndex={0} aria-label={`Submission needed: ${awaiting}`} onMouseEnter={() => setActiveSlice("awaiting")} onFocus={() => setActiveSlice("awaiting")} onClick={() => setActiveSlice("awaiting")} />)}
            {ready > 0 && (awaiting === 0 ? <circle cx="100" cy="100" r="88" fill="#08283F" tabIndex={0} aria-label={`Submitted on-chain: ${ready}`} onMouseEnter={() => setActiveSlice("ready")} onFocus={() => setActiveSlice("ready")} /> : <path d={`M100,100 L100,12 A88,88 0 ${percent > 50 ? 1 : 0},1 ${point} Z`} fill="#08283F" tabIndex={0} aria-label={`Submitted on-chain: ${ready}`} onMouseEnter={() => setActiveSlice("ready")} onFocus={() => setActiveSlice("ready")} onClick={() => setActiveSlice("ready")} />)}
          </>}
        </svg>
      </DashboardTooltip>
      <div className={styles.legend}>{[{ label: "Submitted on-chain", count: ready, color: "#08283F", detail: "Pending credentials with a submission transaction. Review the documents before signing." }, { label: "Submission needed", count: awaiting, color: "#D8D5CA", detail: "Pending credentials without a submission transaction. Ask the Registrar to submit them before approval." }].map(item => <DashboardTooltip key={item.label} title={item.label} detail={item.detail}><button type="button"><i style={{ background: item.color }} />{item.label}<strong>{item.count}</strong></button></DashboardTooltip>)}{!pending.length && <p>No pending credentials created in the selected period.</p>}</div></div>
    </article>;
}

export default function SignerCharts({ pending, approvals, loading, activityCard }) {
  return <section className={styles.grid} aria-label="Signing analytics"><OfficerMonthlyBar approvals={approvals} loading={loading} />{activityCard || <SignatureQueueCard pending={pending} />}</section>;
}
