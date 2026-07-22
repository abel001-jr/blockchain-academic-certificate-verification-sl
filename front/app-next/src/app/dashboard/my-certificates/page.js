"use client";
import { useEffect, useState } from "react";
import { Loader2, ScrollText } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth, ROLES } from "@/lib/useAuth";
import StatusBadge from "@/components/dashboard/StatusBadge";

export default function MyCertificatesPage() {
  const { role, loading: authLoading } = useAuth();
  const [certs, setCerts] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (role && role !== ROLES.STUDENT && role !== ROLES.SUPER_ADMIN) {
      setBusy(false);
      return;
    }
    api.get("/my-certificates/")
      .then(data => setCerts(data.results ?? data))
      .catch(() => setError("Could not load your certificates."))
      .finally(() => setBusy(false));
  }, [role, authLoading]);

  if (authLoading || busy) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={28} className="text-[#022448] animate-spin" />
      </div>
    );
  }

  if (role && role !== ROLES.STUDENT && role !== ROLES.SUPER_ADMIN) {
    return <p className="text-[#C62828] text-sm">Student access only.</p>;
  }

  return (
    <div className="max-w-[960px] flex flex-col gap-6">
      <div>
        <h2 className="text-[#022448] font-bold text-xl">My Certificates</h2>
        <p className="text-[#43474e] text-sm mt-1">Credentials issued to your student account.</p>
      </div>

      {error && (
        <div className="bg-[#ffdad6] text-[#93000a] text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      {certs.length === 0 ? (
        <div className="bg-white rounded-[14px] border border-[#c4c6cf]/15 py-16 flex flex-col items-center gap-2">
          <ScrollText size={28} className="text-[#c4c6cf]" />
          <p className="text-[#43474e] text-sm">No certificates yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-[14px] border border-[#c4c6cf]/15 divide-y divide-[#c4c6cf]/10 overflow-hidden">
          {certs.map(cert => (
            <div key={cert.id} className="flex items-center justify-between px-6 py-4">
              <div className="min-w-0">
                <p className="text-[#022448] text-sm font-semibold truncate">{cert.degree_title}</p>
                <p className="text-[#43474e] text-xs truncate">{cert.student_name}</p>
              </div>
              <StatusBadge status={cert.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
