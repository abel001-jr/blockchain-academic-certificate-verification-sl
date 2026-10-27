"use client";
import { useState } from "react";
import DashboardTooltip from "./DashboardTooltip";
import styles from "./SignerCharts.module.css";
export default function OfficerMonthlyBar({ approvals = [], loading, title = "Approval activity", description = "Recorded approvals for your role", eventLabel = "approvals" }) {
  const [period, setPeriod] = useState(6);
  const now = new Date();
  const months = Array.from({ length: period }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - period + 1 + index, 1);
    return { label: date.toLocaleDateString("en", { month: "short" }), title: date.toLocaleDateString("en", { month: "long", year: "numeric" }), count: approvals.filter(entry => { const event = new Date(entry.timestamp); return event.getFullYear() === date.getFullYear() && event.getMonth() === date.getMonth(); }).length };
  });
  const max = Math.max(1, ...months.map(month => month.count));
  return (<article className={styles.card}><div className={styles.chartHeader}><div className="flex flex-wrap justify-between items-start gap-3"><h3>{title}</h3><label className="text-xs text-[#4A5A68]">Period<select data-dropdown="compact" aria-label={title + " period"} value={period} onChange={e => setPeriod(Number(e.target.value))} className="cd-input mt-1">{[3, 6, 9, 12].map(value => <option key={value} value={value}>{value} months</option>)}</select></label></div><p>{description} &middot; last {period} months</p></div>
      {loading ? <div className={styles.loading} role="status" aria-label="Loading approval chart"><span>Loading approval activity...</span><div className={styles.skeletonBars} aria-hidden="true">{[45,75,55,90,65,80].map((height,index) => <i key={index} style={{ height: `${height}%` }} />)}</div></div> : <div className="overflow-x-auto pb-2"><div className={styles.bars} style={{ gridTemplateColumns: `repeat(${period}, minmax(32px, 1fr))` }}>{months.map((month,index) => <DashboardTooltip key={month.title} title={month.title} detail={`${month.count} ${eventLabel} recorded.`}><button type="button" className={styles.column} style={{ "--bar-delay": `${index * 70}ms` }} aria-label={`${month.title}: ${month.count} ${eventLabel}`}><strong>{month.count}</strong><span className={styles.track}><i style={{ height: `${month.count / max * 100}%` }} /></span><span>{month.label}</span></button></DashboardTooltip>)}</div></div>}
      {!loading && months.every(month => month.count === 0) && <p className={styles.empty}>No {eventLabel} recorded in the last {period} months.</p>}
    </article>);
}
