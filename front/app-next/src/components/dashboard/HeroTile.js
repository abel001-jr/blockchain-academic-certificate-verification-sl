import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import styles from "./HeroTile.module.css";

export default function HeroTile({ href, label, value, detail, index = 0, points, chartLabel, line = false, icon: Icon, actionLabel }) {
  const maximum = Math.max(1, ...(points || []));
  const coordinates = (points || []).map((count, i) => [12 + i * 256 / Math.max(1, points.length - 1), 62 - count / maximum * 44]);
  const curve = coordinates.length ? coordinates.slice(1).reduce((path, [x, y], i) => { const [px, py] = coordinates[i]; const bend = (x - px) * .35; return `${path} C${px + bend},${py} ${x - bend},${y} ${x},${y}`; }, `M${coordinates[0].join(",")}`) : "";
  return <Link href={href} className={`${styles.tile} ${styles[`tone${index % 4}`]}`}>
    <ArrowUpRight className={styles.arrow} size={19} aria-hidden="true" />
    {value !== undefined && <strong className={styles.value}>{value}</strong>}
    <h3>{label}</h3><p>{detail}</p>
    {points?.length > 0 ? <div className={styles.chart}><svg viewBox="0 0 280 76" role="img" aria-label={chartLabel}>
      {line ? <><path d={curve} fill="none" stroke="currentColor" strokeWidth="2" />{coordinates.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />)}</> : points.map((count, i) => <rect key={i} x={8 + i * 264 / points.length} y={68 - count / maximum * 50} width={Math.min(26, 200 / points.length)} height={count / maximum * 50} rx="2" fill="currentColor" />)}
    </svg><span>{chartLabel}</span></div> : Icon && <Icon className={styles.taskIcon} size={36} strokeWidth={1.25} aria-hidden="true" />}
    <span className={`${styles.actionLabel} cred-btn cred-btn-secondary ${index % 2 === 0 ? "cred-btn-inverse" : ""}`}>{actionLabel || `View ${label.toLowerCase()}`}<ArrowUpRight size={14} aria-hidden="true" /></span>
  </Link>;
}
