"use client";
import Link from "next/link";
import VerificationAreaChart from "./VerificationAreaChart";
import { Donut } from "./CredentialCharts";
import DashboardTooltip from "./DashboardTooltip";
import styles from "./PlatformCharts.module.css";

export default function PlatformCharts({ stats }) {
  const institutions = stats.by_institution.slice(0, 8);
  const largest = Math.max(4, Math.ceil(Math.max(0, ...institutions.map(item => item.total)) / 4) * 4);
  return <section className={styles.layout} aria-label="Platform charts">
    <article className={`${styles.card} ${styles.main}`}>
      <div className={styles.header}><div><h3>Credentials by institution</h3><p>Platform portfolio ? top eight institutions</p></div><Link href="/dashboard/admin/institutions">View institutions ?</Link></div>
      <strong className={styles.portfolioTotal}>{stats.certificates.total} <span>credentials across the platform</span></strong>
      <div className={styles.barPlot}>
        <div className={styles.guides} aria-hidden="true">{[4, 3, 2, 1, 0].map(step => <div key={step}><span>{largest * step / 4}</span><i /></div>)}</div>
        <div className={styles.bars}>{institutions.map(item => <DashboardTooltip key={item.institution_id} title={item.name} detail={`${item.total} credentials recorded.`}><div tabIndex={0} className={styles.column}><div className={styles.barSpace}><b>{item.total}</b><div className={styles.bar} style={{ height: `${item.total / largest * 100}%` }} /></div><span title={item.name}>{item.short_name || item.name}</span></div></DashboardTooltip>)}</div>
        {!institutions.length && <p className={styles.empty}>No credential records yet.</p>}
      </div>
    </article>
    <article className={styles.card}><div className={styles.header}><div><h3>Credential status</h3><p>Current platform portfolio</p></div><Link href="/dashboard/certificates">View all ?</Link></div><Donut statuses={stats.certificates.by_status} total={stats.certificates.total} /></article>
    <article className={styles.card}><h3>Verification activity</h3><p>Monthly public checks · last six months</p><VerificationAreaChart months={stats.verifications.trend} /></article>
  </section>;
}
