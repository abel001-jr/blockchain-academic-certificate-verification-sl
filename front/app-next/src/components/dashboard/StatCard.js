import DashboardTooltip from "./DashboardTooltip";

export default function StatCard({ icon: Icon, value, label, accent = false, detail, compact = false }) {
  const content = (
    <div tabIndex={detail ? 0 : undefined} className={`w-full h-full bg-white rounded-xl shadow-card flex border border-[#E4E1D6]/50 ${compact ? "min-h-[96px] p-4 flex-row items-center gap-3" : "p-6 flex-col gap-4"}`}>
      {/* Icon */}
      <div className={`w-10 h-10 shrink-0 rounded-lg flex items-center justify-center ${
        accent ? "bg-[#B98A28]/10" : "bg-[#08283F]/6"
      }`}>
        <Icon
          size={20}
          strokeWidth={1.8}
          className={accent ? "text-[#B98A28]" : "text-[#08283F]"}
        />
      </div>
      {/* Value + label */}
      <div>
        <p className={`text-3xl font-bold leading-none mb-2 ${
          accent ? "text-[#B98A28]" : "text-[#08283F]"
        }`}>
          {value}
        </p>
        <p className="text-[#4A5A68] text-sm font-medium leading-snug">{label}</p>
      </div>
    </div>
  );
  return detail ? <DashboardTooltip title={`${label}: ${value}`} detail={detail}>{content}</DashboardTooltip> : content;
}
