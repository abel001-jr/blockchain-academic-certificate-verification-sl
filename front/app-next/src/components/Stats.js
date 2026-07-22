const stats = [
  { value: "5", label: "System Roles" },
  { value: "100%", label: "Blockchain Verified" },
  { value: "<2s", label: "Avg. Verification Time" },
  { value: "0", label: "Accounts to Verify" },
];

export default function Stats() {
  return (
    <section className="py-16 px-4 md:px-10">
      <div className="max-w-[1280px] mx-auto">
        <div className="bg-[#022448] rounded-[14px] py-14 px-6 grid grid-cols-2 lg:grid-cols-4 gap-10 text-center shadow-modal">
          {stats.map((stat, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <p className="text-[#ffdea4] font-bold text-4xl md:text-5xl tracking-tight">
                {stat.value}
              </p>
              <p className="text-white/70 text-xs font-semibold uppercase tracking-widest">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
