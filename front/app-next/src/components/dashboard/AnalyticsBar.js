/**
 * AnalyticsBar
 * Read-only horizontal stacked-bar breakdown.
 * Each segment is coloured by its semantic status.
 * Shows segment labels + counts below the bar.
 *
 * Props:
 *   title   – section heading string
 *   segments – [{ label, count, color }]
 *              color: one of "navy" | "gold" | "green" | "red" | "muted"
 */

const COLORS = {
  navy:  { bar: "bg-[#08283F]",   dot: "bg-[#08283F]",   text: "text-[#08283F]"   },
  gold:  { bar: "bg-[#B98A28]",   dot: "bg-[#B98A28]",   text: "text-[#B98A28]"   },
  green: { bar: "bg-[#2F6F4E]",   dot: "bg-[#2F6F4E]",   text: "text-[#2F6F4E]"   },
  red:   { bar: "bg-[#A23B34]",   dot: "bg-[#A23B34]",   text: "text-[#A23B34]"   },
  muted: { bar: "bg-[#B9C6D2]",   dot: "bg-[#B9C6D2]",   text: "text-[#4A5A68]"   },
};

export default function AnalyticsBar({ title, segments = [] }) {
  const total = segments.reduce((s, seg) => s + (seg.count ?? 0), 0);

  return (
    <div className="bg-white rounded-xl border border-[#E4E1D6]/50 p-5 shadow-card">
      {title && (
        <p className="text-[0.8rem] font-semibold text-[#08283F] uppercase tracking-wider mb-4">
          {title}
        </p>
      )}

      {/* Stacked bar */}
      <div className="flex h-3 rounded-full overflow-hidden gap-px mb-4" role="img" aria-label={title}>
        {total === 0 ? (
          <div className="flex-1 bg-[#E4E1D6] rounded-full" />
        ) : (
          segments.map((seg) => {
            const pct = total ? ((seg.count ?? 0) / total) * 100 : 0;
            if (pct === 0) return null;
            const c = COLORS[seg.color] ?? COLORS.muted;
            return (
              <div
                key={seg.label}
                className={`${c.bar} transition-all duration-500`}
                style={{ width: `${pct}%` }}
                title={`${seg.label}: ${seg.count}`}
              />
            );
          })
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {segments.map((seg) => {
          const c = COLORS[seg.color] ?? COLORS.muted;
          return (
            <div key={seg.label} className="flex items-center gap-1.5 min-w-0">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.dot}`} />
              <span className="text-[0.78rem] text-[#4A5A68] truncate">{seg.label}</span>
              <span className={`text-[0.8rem] font-bold ml-0.5 ${c.text}`}>
                {seg.count ?? "—"}
              </span>
            </div>
          );
        })}
        {total > 0 && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[0.78rem] text-[#4A5A68]">Total</span>
            <span className="text-[0.8rem] font-bold text-[#08283F]">{total}</span>
          </div>
        )}
      </div>
    </div>
  );
}
