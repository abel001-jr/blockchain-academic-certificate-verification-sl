export default function StatCard({ icon: Icon, value, label, accent = false }) {
  return (
    <div className="bg-white rounded-xl shadow-card p-6 flex flex-col gap-4 border border-[#E4E1D6]/50">
      {/* Icon */}
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
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
        <p className="text-[#4A5A68] text-base font-medium">{label}</p>
      </div>
    </div>
  );
}
