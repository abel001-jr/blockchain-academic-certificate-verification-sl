const styles = {
  draft:              "bg-[#4A5A68]/10 text-[#1B2734]",
  pending:            "bg-[#F5EBDB] text-[#A9721F]",
  pending_vc:         "bg-[#F5EBDB] text-[#A9721F]",
  pending_chancellor: "bg-[#E9DAB8] text-[#B98A28]",
  pending_finalize:   "bg-[#EAF2FB] text-[#08283F]",
  issued:             "bg-[#08283F]/8 text-[#08283F]",
  verified:           "bg-[#E7F1EB] text-[#2F6F4E]",
  revoked:            "bg-[#F5E5E3] text-[#A23B34]",
};

const labels = {
  pending_vc:         "Pending VC",
  pending_chancellor: "Pending Dean",
  pending_finalize:   "Pending Finalize",
};

export default function StatusBadge({ status }) {
  const key = status?.toLowerCase() ?? "draft";
  const cls = styles[key] ?? styles.draft;
  const text = labels[key] ?? status;
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold capitalize tracking-wide ${cls}`}>
      {text}
    </span>
  );
}
