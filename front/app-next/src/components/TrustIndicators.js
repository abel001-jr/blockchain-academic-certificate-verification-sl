function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-[15px] h-[15px] text-[#08283F]">
      <path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-[15px] h-[15px] text-[#08283F]">
      <rect x="4" y="10" width="16" height="10" rx="1.5" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-[15px] h-[15px] text-[#08283F]">
      <path d="M4 12a8 8 0 1 1 3 6.2" />
      <path d="M4 18v-4h4" />
    </svg>
  );
}

const items = [
  { icon: ShieldIcon, label: "Institutionally issued" },
  { icon: LockIcon, label: "Tamper evident" },
  { icon: RefreshIcon, label: "Independently verifiable" },
];

export default function TrustIndicators() {
  return (
    <div className="border-t border-b border-[#E4E1D6] py-5">
      <div className="landing-wrap flex justify-center gap-12 flex-wrap">
        {items.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-2.5 text-[0.88rem] text-[#4A5A68] font-medium">
            <span className="trust-icon-well">
              <Icon />
            </span>
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
