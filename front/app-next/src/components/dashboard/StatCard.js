export default function StatCard({ icon: Icon, value, label, accent = false }) {
  return (
    <div className="bg-white rounded-[14px] shadow-card p-5 flex flex-col gap-3 border border-[#c4c6cf]/10">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accent ? "bg-[#7b5900]/10" : "bg-[#022448]/5"}`}>
        <Icon size={20} className={accent ? "text-[#7b5900]" : "text-[#022448]"} strokeWidth={1.8} />
      </div>
      <div>
        <p className="text-[#022448] text-2xl font-bold leading-none mb-1">{value}</p>
        <p className="text-[#43474e] text-xs font-semibold uppercase tracking-wider">{label}</p>
      </div>
    </div>
  );
}
