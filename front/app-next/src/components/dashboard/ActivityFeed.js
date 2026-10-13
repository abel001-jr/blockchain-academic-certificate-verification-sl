/**
 * ActivityFeed
 * Read-only audit-event list.
 * Renders a timestamped list of audit log entries,
 * colour-coded by action type.
 *
 * Props:
 *   title   – section heading (default "Recent Activity")
 *   entries – array of AuditLog objects from /api/audit-logs/
 *   loading – boolean
 *   empty   – string message when no entries
 */

const ACTION_META = {
  "certificate.issued":       { dot: "bg-[#2F6F4E]",  label: "Issued"           },
  "certificate.created":      { dot: "bg-[#08283F]",  label: "Created"          },
  "certificate.revoked":      { dot: "bg-[#A23B34]",  label: "Revoked"          },
  "certificate.verified":     { dot: "bg-[#B98A28]",  label: "Verified"         },
  "certificate.vc_approved":  { dot: "bg-[#2F6F4E]",  label: "VC Approved"      },
  "certificate.chancellor_approved": { dot: "bg-[#2F6F4E]", label: "Chancellor Approved" },
  "certificate.prepared":     { dot: "bg-[#4A5A68]",  label: "Prepared"         },
  "certificate.submitted_on_chain": { dot: "bg-[#08283F]", label: "Submitted On-Chain" },
};

function dot(action) {
  return ACTION_META[action]?.dot ?? "bg-[#B9C6D2]";
}

function actionLabel(action) {
  return ACTION_META[action]?.label ?? action.replace("certificate.", "").replace(/_/g, " ");
}

function formatTs(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    + " · "
    + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function ActivityFeed({
  title   = "Recent Activity",
  entries = [],
  loading = false,
  empty   = "No activity recorded yet.",
}) {
  return (
    <div className="cd-scroll-card bg-white rounded-xl border border-[#E4E1D6]/50 overflow-hidden shadow-card">
      <div className="px-5 py-4 border-b border-[#E4E1D6]/40">
        <p className="text-[0.8rem] font-semibold text-[#08283F] uppercase tracking-wider">
          {title}
        </p>
      </div>

      <div className="cd-scroll-card-body divide-y divide-[#E4E1D6]/40" tabIndex={0} role="region" aria-label={`${title} entries`}>
        {loading && (
          <div className="px-5 py-8 text-center text-[#4A5A68] text-sm">Loading…</div>
        )}

        {!loading && entries.length === 0 && (
          <div className="px-5 py-8 text-center text-[#4A5A68] text-sm">{empty}</div>
        )}

        {!loading && entries.map((entry) => (
          <div key={entry.id} className="flex items-start gap-3 px-5 py-3.5">
            {/* Status dot */}
            <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${dot(entry.action)}`} />

            <div className="flex-1 min-w-0">
              <p className="text-[0.84rem] text-[#08283F] font-medium leading-snug truncate">
                {actionLabel(entry.action)}
                {entry.detail && (
                  <span className="text-[#4A5A68] font-normal ml-1.5">
                    — {entry.detail.split(".")[0]}
                  </span>
                )}
              </p>
              <p className="text-[0.75rem] text-[#8A929C] mt-0.5">
                {formatTs(entry.timestamp)}
                {entry.actor_email && (
                  <span className="ml-2 text-[#B9C6D2]">· {entry.actor_email}</span>
                )}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
