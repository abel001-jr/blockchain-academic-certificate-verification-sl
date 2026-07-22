const styles = {
  draft:              "bg-[#74777f]/10 text-[#43474e]",
  pending:            "bg-[#ED8A19]/10 text-[#7b4500]",
  pending_vc:         "bg-[#ED8A19]/10 text-[#7b4500]",
  pending_chancellor: "bg-[#7b5900]/10 text-[#7b5900]",
  pending_finalize:   "bg-[#1565C0]/10 text-[#1565C0]",
  issued:             "bg-[#022448]/10 text-[#022448]",
  verified:           "bg-[#2E7D32]/10 text-[#2E7D32]",
  revoked:            "bg-[#C62828]/10 text-[#C62828]",
};

const labels = {
  pending_vc:         "Pending VC",
  pending_chancellor: "Pending Chancellor",
  pending_finalize:   "Pending Finalize",
};

export default function StatusBadge({ status }) {
  const key = status?.toLowerCase() ?? "draft";
  const cls = styles[key] ?? styles.draft;
  const text = labels[key] ?? status;
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded text-[11px] font-semibold uppercase tracking-wide ${cls}`}>
      {text}
    </span>
  );
}
