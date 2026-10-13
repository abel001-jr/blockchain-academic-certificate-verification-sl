"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import DashboardTooltip from "./DashboardTooltip";
import styles from "./CredentialCharts.module.css";

const colors = { issued: "#08283F", pending: "#780110", draft: "#9AA8B4", revoked: "#B64A60", claims: "#780110", verifications: "#527B91" };
const label = value => value.replaceAll("_", " ").replace(/^./, character => character.toUpperCase());
const monthLabel = item => new Date(Date.UTC(item.year, item.month - 1)).toLocaleDateString("en", { month: "short", year: "numeric", timeZone: "UTC" });

export function Donut({ statuses, total }) {
  const [active, setActive] = useState(null);
  let offset = 0;
  return <><div className={styles.donut}><svg viewBox="0 0 220 220" aria-label="Credential status distribution">
    <circle cx="110" cy="110" r="82" fill="none" stroke="#EDF0F2" strokeWidth="24" />
    {Object.entries(statuses).map(([key, count]) => {
      const start = offset; const share = total ? count / total : 0; offset += share;
      return count > 0 && <circle key={key} onMouseEnter={() => setActive({ key, count, share })} onMouseLeave={() => setActive(null)} onFocus={() => setActive({ key, count, share })} onBlur={() => setActive(null)} tabIndex={0} aria-label={`${label(key)}: ${count}`} cx="110" cy="110" r="82" pathLength="100" fill="none" stroke={colors[key] || colors.pending} strokeWidth="24" strokeDasharray={`${share * 100} ${100 - share * 100}`} strokeDashoffset={-start * 100} transform="rotate(-90 110 110)" />;
    })}
    <text x="110" y="110" textAnchor="middle" className={styles.total}>{total}</text><text x="110" y="133" textAnchor="middle" className={styles.caption}>Total credentials</text>
  </svg>{active && <div role="tooltip" className={styles.tooltip}><b>{label(active.key)}: {active.count}</b><span>{(active.share * 100).toFixed(1)}% of credentials</span></div>}</div><div className={styles.legend}>{Object.entries(statuses).map(([key, count]) => <DashboardTooltip key={key} title={`${label(key)}: ${count}`} detail={`${total ? (count / total * 100).toFixed(1) : 0}% of credentials.`}><span tabIndex={0}><i style={{ background: colors[key] || colors.pending }} />{label(key)} <b>{count}</b></span></DashboardTooltip>)}</div></>;
}

function Activity({ items }) {
  const [active, setActive] = useState(null);
  const keys = ["issued", "claims", "verifications"];
  const ceiling = Math.max(4, Math.ceil(Math.max(0, ...items.flatMap(item => keys.map(key => item[key]))) / 4) * 4);
  const x = index => 48 + index * 704 / Math.max(1, items.length - 1);
  const y = value => 236 - value / ceiling * 204;
  const selected = active === null ? null : items[active];
  return <><div className={styles.area}>
    <svg viewBox="0 0 800 280" role="img" aria-label="Monthly issuance, claims and verification activity">
      {[0, 1, 2, 3, 4].map(step => <g key={step}><line x1="48" x2="752" y1={y(ceiling * step / 4)} y2={y(ceiling * step / 4)} stroke="#E4E8EB" strokeDasharray="4 5" /><text x="36" y={y(ceiling * step / 4) + 4} textAnchor="end" className={styles.caption}>{ceiling * step / 4}</text></g>)}
      {keys.map(key => {
        const points = items.map((item, index) => [x(index), y(item[key])]);
        if (!points.length) return null;
        const curve = points.slice(1).reduce((path, [px, py], index) => {
          const [previousX, previousY] = points[index];
          const bend = (px - previousX) * .35;
          return `${path} C${previousX + bend},${previousY} ${px - bend},${py} ${px},${py}`;
        }, `M${points[0][0]},${points[0][1]}`);
        const area = `${curve} L${points.at(-1)[0]},236 L${points[0][0]},236 Z`;
        return <g key={key}><path d={area} fill={colors[key]} fillOpacity=".12" /><path d={curve} fill="none" stroke={colors[key]} strokeWidth="3" strokeLinecap="round" /></g>;
      })}
      {items.map((item, index) => <g key={monthLabel(item)}><text x={x(index)} y="263" textAnchor="middle" className={styles.caption}>{monthLabel(item).split(" ")[0]}</text><rect x={x(index) - 27} y="24" width="54" height="215" fill="transparent" tabIndex={0} aria-label={`${monthLabel(item)}: ${item.issued} issued, ${item.claims} claims, ${item.verifications} verifications`} onClick={() => setActive(index)} onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(index)} onBlur={() => setActive(null)} />{active === index && <line x1={x(index)} x2={x(index)} y1="24" y2="236" stroke="#780110" strokeDasharray="3 4" pointerEvents="none" />}</g>)}
    </svg>
    {selected && <div role="tooltip" className={styles.tooltip}><b>{monthLabel(selected)}</b>{keys.map(key => <span key={key}>{label(key)} <strong>{selected[key]}</strong></span>)}</div>}
  </div><div className={styles.legend}>{keys.map(key => <span key={key}><i style={{ background: colors[key] }} />{key === "issued" ? "Issuance" : label(key)}</span>)}</div></>;
}

export default function CredentialCharts({ children, initialData = null }) {
  const [data, setData] = useState(initialData);
  const [error, setError] = useState("");
  const [group, setGroup] = useState("programmes");
  useEffect(() => { if (initialData) return; let alive = true; api.get("/institution-analytics/").then(result => { if (alive) setData(result); }).catch(() => { if (alive) setError("Unable to load credential charts."); }); return () => { alive = false; }; }, [initialData]);
  if (!data) return <p role={error ? "alert" : "status"}>{error || "Loading credential charts…"}</p>;
  const field = { programmes: "degree_title", departments: "department", stages: "status" }[group];
  const rows = data[group] || [];
  const maximum = Math.max(1, ...rows.map(row => row.count));
  return <section className={styles.layout} aria-label="Credential charts">
    <article className={styles.card}><div className={styles.header}><div><h3>Credential comparison</h3><p>Compare the current credential portfolio</p></div><select data-dropdown="compact" aria-label="Compare credentials by" value={group} onChange={event => setGroup(event.target.value)}><option value="programmes">Programmes</option><option value="departments">Departments</option><option value="stages">Approval stages</option></select></div>
      <div className={styles.bars}>{rows.map(row => <DashboardTooltip key={row[field]} title={label(row[field] || "Unspecified")} detail={`${row.count} credentials · ${data.total ? (row.count / data.total * 100).toFixed(1) : 0}% of the portfolio.`}><div tabIndex={0} className={styles.barRow}><div><span>{label(row[field] || "Unspecified")}</span><b>{row.count}</b></div><div className={styles.track}><div style={{ width: `${row.count / maximum * 100}%` }} /></div></div></DashboardTooltip>)}{!rows.length && <p>No credentials recorded yet.</p>}</div>
    </article>
    <article className={styles.card}><div className={styles.header}><div><h3>Credential status</h3><p>Current share of the portfolio</p></div></div><Donut statuses={data.statuses} total={data.total} /></article>
    {children && <div className={styles.wide}>{children}</div>}
    {data.activity && <article className={`${styles.card} ${styles.wide}`}><div className={styles.header}><div><h3>Credential activity over time</h3><p>Monthly issuance, student claims and verification checks · last 12 months</p></div></div><Activity items={data.activity} /></article>}
  </section>;
}
