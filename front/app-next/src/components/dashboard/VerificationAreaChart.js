"use client";

import { useState } from "react";
import styles from "./PlatformCharts.module.css";

export default function VerificationAreaChart({ months }) {
  const [active, setActive] = useState(null);
  const maximum = Math.max(4, ...months.map(month => month.count));
  const points = months.map((month, index) => [40 + index * 500 / Math.max(1, months.length - 1), 170 - month.count / maximum * 140]);
  const curve = points.length ? points.slice(1).reduce((path, [x, y], index) => {
    const [px, py] = points[index];
    const bend = (x - px) * .35;
    return `${path} C${px + bend},${py} ${x - bend},${y} ${x},${y}`;
  }, `M${points[0].join(",")}`) : "";
  const monthName = month => new Date(Date.UTC(month.year, month.month - 1)).toLocaleDateString("en", { month: "short", timeZone: "UTC" });
  const selected = months[active];
  const describe = month => `${monthName(month)} ${month.year}: ${month.count} verification checks`;

  return <>
    <div className={styles.areaWrap} onMouseLeave={() => setActive(null)} onKeyDown={event => { if (event.key === "Escape") setActive(null); }}>
      <svg className={styles.area} viewBox="0 0 580 205" aria-label="Monthly platform verification activity">
        {[0, 1, 2, 3, 4].map(step => <g key={step}><line x1="40" x2="540" y1={170 - step * 35} y2={170 - step * 35} stroke="#E4E8EB" strokeDasharray="4 5" /><text x="30" y={174 - step * 35} textAnchor="end">{Math.round(maximum * step / 4)}</text></g>)}
        {curve && <g key={curve}><path className={styles.areaFill} d={`${curve} L${points.at(-1)[0]},170 L40,170 Z`} fill="#780110" fillOpacity=".09" /><path className={styles.areaLine} pathLength="1" d={curve} fill="none" stroke="#780110" strokeWidth="2.5" /></g>}
        {selected && <line x1={points[active][0]} x2={points[active][0]} y1="25" y2="170" stroke="#780110" strokeDasharray="3 4" pointerEvents="none" />}
        {months.map((month, index) => <g key={`${month.year}-${month.month}`}>
          <circle className={styles.areaPoint} cx={points[index][0]} cy={points[index][1]} r={active === index ? 7 : 5} fill="#780110" stroke="white" strokeWidth="2" />
          <text x={points[index][0]} y="196" textAnchor="middle">{monthName(month)}</text>
          <rect x={points[index][0] - 30} y="20" width="60" height="155" fill="transparent" tabIndex={0} role="button" aria-label={describe(month)} aria-pressed={active === index} onMouseEnter={() => setActive(index)} onFocus={() => setActive(index)} onBlur={() => setActive(null)} onClick={() => setActive(index)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActive(index); } }} />
        </g>)}
      </svg>
      {selected && <div role="tooltip" className={styles.areaTooltip}><strong>{monthName(selected)} {selected.year}</strong><span>{selected.count} verification checks</span></div>}
    </div>
    {!months.length && <p>No verification activity recorded yet.</p>}
    <div className={styles.months}>{months.map((month, index) => <button type="button" key={`${month.year}-${month.month}`} aria-label={describe(month)} aria-pressed={active === index} onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(index)} onBlur={() => setActive(null)} onClick={() => setActive(index)}>{monthName(month)} <b>{month.count}</b></button>)}</div>
  </>;
}
