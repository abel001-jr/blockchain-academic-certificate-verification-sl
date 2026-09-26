"use client";

import { useState } from "react";

export default function DashboardTooltip({ title, detail, children }) {
  const [visible, setVisible] = useState(false);

  return (
    <div
      className="relative flex w-full"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-56 -translate-x-1/2 rounded-lg border border-white/10 bg-[#142B41]/[.97] px-3 py-2 text-left text-[11px] leading-relaxed text-[#D8E0E7] shadow-xl">
          <strong className="block text-xs text-white">{title}</strong>
          {detail}
        </span>
      )}
    </div>
  );
}