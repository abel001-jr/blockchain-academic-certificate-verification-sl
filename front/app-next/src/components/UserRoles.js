"use client";

import { useEffect, useState } from "react";
import StakeholderCarousel from "@/components/StakeholderCarousel";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000/api";

/**
 * Static fallbacks shown while the fetch is in-flight or if it fails.
 * The fixed values (roles, lifecycle stages, verification methods) never
 * change — only the live counts (certificates issued, verifications) animate in.
 */
const STATIC_STATS = [
  { key: "certificates_issued",  label: "Certificates issued",         fallback: "—"  },
  { key: "verifications_total",  label: "Public verifications",        fallback: "—"  },
  { key: "institutions_active",  label: "Institutions onboarded",      fallback: "—"  },
  { key: null,                   label: "Verification methods",        fallback: "2"  },
];

function StatBlock({ value, label }) {
  return (
    <div className="min-w-[140px]">
      <div className="font-serif text-[2.2rem] text-[#08283F] font-medium leading-none">
        {value}
      </div>
      <div className="text-[0.85rem] text-[#4A5A68] mt-1">{label}</div>
    </div>
  );
}

export default function UserRoles() {
  const [liveStats, setLiveStats] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/public/stats/`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setLiveStats(data); })
      .catch(() => {/* silent — fallbacks stay visible */});
  }, []);

  const stats = STATIC_STATS.map((s) => ({
    label:    s.label,
    value:    s.key && liveStats ? (liveStats[s.key] ?? s.fallback) : s.fallback,
    loading:  s.key !== null && liveStats === null,
  }));

  return (
    <section className="scroll-anchor py-24" id="stakeholders">
      <div className="landing-wrap">
        <div className="max-w-[560px] mb-14">
          <h2 className="font-serif text-[2.1rem] font-medium text-[#08283F] leading-[1.22]">
            Five roles, one shared credential
          </h2>
          <p className="mt-3.5 text-[#4A5A68] text-[1.02rem] max-w-[52ch]">
            Each stakeholder sees only what their role needs — connected by the same underlying record.
          </p>
        </div>

        <StakeholderCarousel />

        <div className="flex justify-between flex-wrap gap-8 py-10 mt-6 border-t border-b border-[#E4E1D6]">
          {stats.map(({ value, label, loading }) => (
            <StatBlock
              key={label}
              label={label}
              value={loading ? <span className="text-[#B9C6D2]">…</span> : value}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
