"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import DashboardTooltip from "./DashboardTooltip";
import { useDashboardTheme } from "./DashboardThemeProvider";
import styles from "./InstitutionAnalyticsPanel.module.css";

function PieChart({ statuses }) {
  const { theme } = useDashboardTheme();
  const palette = [theme.primary, theme.accent, theme.line, "#A6423A"];
  const [active, setActive] = useState(null);
  const total = Object.values(statuses).reduce((sum, count) => sum + count, 0);
  let angle = -Math.PI / 2;
  const slices = Object.entries(statuses).map(([key, count], index) => {
    const start = angle;
    angle += total ? count / total * Math.PI * 2 : 0;
    return {label: key[0].toUpperCase() + key.slice(1), count, color: palette[index % palette.length], start, end: angle};
  });
  const info = active || {label: "Credential portfolio", count: total};
  return <div className={styles.donut}>
    <DashboardTooltip title={`${info.label}: ${info.count}`} detail={active ? `${total ? (info.count / total * 100).toFixed(1) : 0}% of ${total} institution credentials.` : "Point to a slice to see its count and share of the institution's credentials."}>
      <svg viewBox="0 0 240 240" className="mx-auto h-56 w-56 overflow-visible" role="group" aria-label="Credential status pie chart" onMouseLeave={() => setActive(null)}>
        {!total && <circle cx="120" cy="120" r="95" fill="#EDF0F2" />}
        {slices.filter(slice => slice.count > 0).map(slice => {
          const full = slice.count === total;
          const path = `M120 120 L${120 + 95 * Math.cos(slice.start)} ${120 + 95 * Math.sin(slice.start)} A95 95 0 ${slice.end - slice.start > Math.PI ? 1 : 0} 1 ${120 + 95 * Math.cos(slice.end)} ${120 + 95 * Math.sin(slice.end)} Z`;
          const props = {tabIndex: 0, role: "img", "aria-label": `${slice.label}: ${slice.count} (${(slice.count / total * 100).toFixed(1)}%)`, onMouseEnter: () => setActive(slice), onFocus: () => setActive(slice), onBlur: () => setActive(null), fill: slice.color, stroke: "white", strokeWidth: 2, className: "cursor-help transition-opacity hover:opacity-80 focus:opacity-80"};
          return full ? <circle key={slice.label} cx="120" cy="120" r="95" {...props} /> : <path key={slice.label} d={path} {...props} />;
        })}
        <circle cx="120" cy="120" r="67" fill="white" pointerEvents="none" />
        <text x="120" y="119" textAnchor="middle" style={{fill: theme.primary, fontSize: 34, fontWeight: 700}} pointerEvents="none">{active ? active.count : total}</text>
        <text x="120" y="142" textAnchor="middle" fill="#687B8E" fontSize="11" pointerEvents="none">{active ? active.label : "TOTAL CREDENTIALS"}</text>
      </svg>
    </DashboardTooltip>
    <div className="mt-3 grid grid-cols-2 gap-2">{slices.map(slice => <DashboardTooltip key={slice.label} title={`${slice.label}: ${slice.count}`} detail={`${total ? (slice.count / total * 100).toFixed(1) : 0}% of all credentials.`}><span tabIndex={0} className="flex items-center gap-2 text-sm"><span className="h-3 w-3 rounded-full" style={{background: slice.color}} />{slice.label} <b>{slice.count}</b></span></DashboardTooltip>)}</div>
  </div>;
}

function MonthlyBars({ items }) {
  const largest = Math.max(1, ...items.map(item => item.count));
  const ceiling = Math.max(4, Math.ceil(largest / 4) * 4);
  return <div className={styles.monthly}>
    <div aria-hidden="true" className={styles.guides}>{[4, 3, 2, 1, 0].map(step => <div key={step}><span>{ceiling * step / 4}</span><i /></div>)}</div>
    <div className={styles.columns}>{items.map(item => <DashboardTooltip key={item.label} title={item.label} detail={`${item.count} credentials created this month.`}><div tabIndex={0} className={styles.column}><div className={styles.barSpace}><span className={styles.barValue}>{item.count}</span><div className={styles.bar} style={{height: `${item.count / ceiling * 180}px`, minHeight: item.count ? 4 : 0}} /></div><span className={styles.monthLabel}>{item.label}</span></div></DashboardTooltip>)}</div>
  </div>;
}

function Bars({ items }) {
  const largest = Math.max(1, ...items.map(item => item.count));
  return <div className="space-y-4">{items.map(item => <DashboardTooltip key={item.label} title={item.label} detail={`${item.count} credentials in this programme.`}><div tabIndex={0} className="w-full"><div className="mb-1 flex justify-between gap-3 text-sm"><span>{item.label}</span><b>{item.count}</b></div><div className="h-3 rounded bg-[#EDF0F2]" aria-hidden="true"><div className="h-full rounded bg-[var(--cd-primary)]" style={{width: `${item.count / largest * 100}%`}} /></div></div></DashboardTooltip>)}</div>;
}

export default function InstitutionAnalyticsPanel({ onLoaded }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let alive = true;
    api.get("/institution-analytics/").then(result => { if (alive) { setData(result); setError(""); onLoaded(result); } }).catch(() => { if (alive) setError("Could not load institution analytics."); });
    return () => { alive = false; };
  }, [refresh, onLoaded]);
  return <section className={`${styles.panel} space-y-5`} aria-label="Institution analytics">
    <div className="flex items-center justify-between gap-3"><div><h3 className="text-xl font-semibold text-[#08283F]">Institution analytics</h3><p className="mt-1 text-sm text-[#4A5A68]">All institution records, including those beyond the first page.</p></div><button type="button" className="cd-btn-secondary" onClick={() => setRefresh(value => value + 1)}>Refresh analytics</button></div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {!data && !error && <p role="status">Loading analytics...</p>}
    {data && <>
      <div className="grid gap-4 md:grid-cols-3">{[
        ["Issued credentials", data.statuses.issued, `${data.total ? Math.round(data.statuses.issued / data.total * 100) : 0}% of all credentials`],
        ["Awaiting completion", data.statuses.pending, "Pending approvals or finalization"],
        ["Signers ready", `${data.officers.ready} / ${data.officers.total}`, "Active, authorized, wallet verified and setup complete"],
      ].map(([label, value, note]) => <DashboardTooltip key={label} title={`${label}: ${value}`} detail={note}><article tabIndex={0} className="w-full rounded-xl border bg-white p-5"><h4 className="text-sm text-[#4A5A68]">{label}</h4><p className="mt-2 text-3xl font-bold text-[#08283F]">{value}</p><p className="mt-2 text-xs text-[#4A5A68]">{note}</p></article></DashboardTooltip>)}</div>
      <div className="grid gap-5 lg:grid-cols-3">
        <article className="rounded-xl border bg-white p-5"><h4 className="mb-4 font-semibold">Credential status</h4><PieChart statuses={data.statuses} /></article>
        <article className="rounded-xl border bg-white p-5"><h4 className="mb-4 font-semibold">Credentials created · last 6 months</h4><MonthlyBars items={data.monthly.map(item => ({label: new Date(Date.UTC(item.year, item.month - 1)).toLocaleDateString("en-GB", {month: "short", year: "numeric", timeZone: "UTC"}), count: item.count}))} /></article>
        <article className="rounded-xl border bg-white p-5"><h4 className="mb-4 font-semibold">Top programmes</h4>{data.programmes.length ? <Bars items={data.programmes.map(item => ({label: item.degree_title || "Unspecified", count: item.count}))} /> : <p className="text-sm">No credential data yet.</p>}</article>
      </div>
    </>}
  </section>;
}
