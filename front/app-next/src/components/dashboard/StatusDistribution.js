"use client";
import DashboardTooltip from "./DashboardTooltip";
import styles from "./StatusDistribution.module.css";

export default function StatusDistribution({ items, description }) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const details = item => `${item.count} ? ${total ? (item.count / total * 100).toFixed(1) : 0}% of this bar. ${item.detail}`;
  return <div>
    <div className={styles.bar} aria-label={description}>
      {items.filter(item => item.count > 0).map(item => <DashboardTooltip key={item.label} title={item.label} detail={details(item)} style={{ width: `${item.count / total * 100}%`, flex: "0 0 auto" }}><button type="button" className={styles.segment} style={{ background: item.color }} aria-label={`${item.label}: ${item.count}`} /></DashboardTooltip>)}
    </div>
    <div className={styles.legend}>{items.map(item => <DashboardTooltip key={item.label} title={item.label} detail={details(item)} className={styles.legendItem}><button type="button" className={styles.label}><i style={{ background: item.color }} aria-hidden="true" />{item.label}<strong>{item.count}</strong></button></DashboardTooltip>)}</div>
    {total === 0 && <p className={styles.empty}>No records in this breakdown yet.</p>}
  </div>;
}
