"use client";
import {useEffect, useState} from "react";
import {api} from "@/lib/api";
import Link from "next/link";
import VerificationAreaChart from "./VerificationAreaChart";
import { Donut } from "./CredentialCharts";
import DashboardTooltip from "./DashboardTooltip";
import styles from "./PlatformCharts.module.css";

export default function PlatformCharts({ stats }) {
  const [credentialMonths, setCredentialMonths] = useState(6);
  const [verificationMonths, setVerificationMonths] = useState(6);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (stats.chart_periods?.credentials === credentialMonths && stats.chart_periods?.verifications === verificationMonths) return;
    let active = true;
    api.get(`/admin/platform-stats/?credential_months=${credentialMonths}&verification_months=${verificationMonths}`).then(data => {if (active) {setResponse(data); setError("");}}).catch(() => {if (active) setError("Could not load this period. Choose another period or refresh to retry.");});
    return () => {active = false;};
  }, [stats, credentialMonths, verificationMonths]);
  const current = response?.chart_periods?.credentials === credentialMonths && response?.chart_periods?.verifications === verificationMonths ? response : stats;
  const ready = current.chart_periods?.credentials === credentialMonths && current.chart_periods?.verifications === verificationMonths;
  const credentials = ready ? current.credential_chart : null;
  const institutions = credentials?.by_institution || [];
  const periodPicker = (value, change, verification = false) => <select data-dropdown="compact" aria-label={verification ? "Verification chart period" : "Credential charts period"} value={value} onChange={event => change(Number(event.target.value))}>{[3, 6, 9, 12, ...(verification ? [] : [24])].map(months => <option key={months} value={months}>{months === 24 ? "2 years" : `${months} months`}</option>)}</select>;
  const largest = Math.max(1, ...institutions.map(item => item.total));
  return <section className={styles.layout} aria-label="Platform charts" aria-busy={!ready}>
    {error && <p role="alert" style={{gridColumn: "1 / -1", color: "#A23B34"}}>{error}</p>}
    <article className={`${styles.card} ${styles.main}`}>
      <div className={styles.header}><div><h3>Credentials by institution</h3><p>Records created in the selected period - top eight institutions</p></div><label className={styles.periodControl}><span>Period</span>{periodPicker(credentialMonths, setCredentialMonths)}</label></div>
      <strong className={styles.portfolioTotal}>{credentials ? credentials.total : "..."} <span>credentials recorded - last {credentialMonths === 24 ? "2 years" : `${credentialMonths} months`}</span></strong>
      <div className={styles.institutionPlot}>
        <div className={styles.institutionBars}>{institutions.map(item => <DashboardTooltip key={item.institution_id} className={styles.institutionTooltipAnchor} title={item.name} detail={`${item.total} credential${item.total === 1 ? "" : "s"} recorded in the last ${credentialMonths === 24 ? "2 years" : `${credentialMonths} months`}.`}>
          <div tabIndex={0} className={styles.institutionColumn} aria-label={`${item.name}: ${item.total} credentials`}>
            <b className={styles.institutionCount}>{item.total}</b>
            <div className={styles.institutionTrack}><div className={styles.institutionFill} style={{height: `${item.total / largest * 100}%`}} /></div>
            <span className={styles.institutionName} title={item.name}>{item.short_name || item.name}</span>
          </div>
        </DashboardTooltip>)}</div>
        {!institutions.length && <p className={styles.institutionEmpty}>{ready ? "No credentials recorded in this period." : "Loading selected period..."}</p>}
      </div>
    </article>
    <article className={styles.card}><div className={styles.header}><div><h3>Credential status</h3><p>Status of records in the selected period</p></div><Link href="/dashboard/certificates">View all ?</Link></div>{credentials ? <Donut statuses={credentials.by_status} total={credentials.total} /> : <p role="status">Loading credential status...</p>}</article>
    <article className={styles.card}><div className={styles.header}><div><h3>Verification activity</h3><p>Monthly verification checks - last {verificationMonths} months</p></div>{periodPicker(verificationMonths, setVerificationMonths, true)}</div>{ready ? <VerificationAreaChart key={verificationMonths} months={current.verifications.trend} /> : <p role="status">Loading verification activity...</p>}</article>
  </section>;
}
