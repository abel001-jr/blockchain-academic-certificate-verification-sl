"use client";
import { subscribeDashboardRefresh } from "@/lib/dashboardRefresh.mjs";
import RecordPageHero from "@/components/dashboard/RecordPageHero";
import styles from "./ApprovalsPage.module.css";
import { useCallback, useEffect, useState } from "react";
import { Loader2, ScrollText } from "lucide-react";
import { loadDashboardRecords } from "@/lib/dashboardRecords";
import { api } from "@/lib/api";
import { useAuth, ROLES } from "@/lib/useAuth";
import StatusBadge from "@/components/dashboard/StatusBadge";
import CredentialDocumentPreview from "@/components/dashboard/CredentialDocumentPreview";
import Link from "next/link";

export default function ApprovalsPage() {
  const { role, loading: authLoading } = useAuth();
  const [certs, setCerts] = useState([]);
  const [documentTab, setDocumentTab] = useState("certificate");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isVc = role === ROLES.VC;
  const isChancellor = role === ROLES.CHANCELLOR;
  const statusFilter = isVc ? "pending_vc" : "pending_chancellor";

  const load = useCallback(async () => {
    try {
      const data = await loadDashboardRecords(`/certificates/?status=${statusFilter}&signing_ready=true`);
      const list = data.results ?? data;
      setCerts(list);
      setSelected((prev) => {
        if (!prev) return list[0] || null;
        return list.find((c) => c.id === prev.id) || list[0] || null;
      });
    } catch {
      setError("Failed to load approvals.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (authLoading) return;
    if (isVc || isChancellor) return subscribeDashboardRefresh(load, { intervalMs: 0 });
    queueMicrotask(() => setLoading(false));
  }, [authLoading, isVc, isChancellor, load]);

  async function openReview(cert) {
    setError("");
    try {
      const detail = await api.get(`/certificates/${cert.id}/`);
      setSelected(detail);
    } catch {
      setSelected(cert);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={28} className="text-[#022448] animate-spin" />
      </div>
    );
  }

  if (!isVc && !isChancellor) {
    return <p className="text-[#C62828] text-sm">VC or Chancellor access only.</p>;
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      <RecordPageHero eyebrow={isVc ? "Vice-Chancellor signing workspace" : "Chancellor signing workspace"} title="Credential approvals" description="Review the certificate and academic transcript together, then record your approval with MetaMask." count={certs.length} countLabel="awaiting your signature" />

              {error && <div className="bg-[#ffdad6] text-[#93000a] text-sm px-4 py-3 rounded-lg break-all">{error}</div>}

      <div className={styles.layout}>
        <div className={styles.queue}>
          <div className={styles.queueHeader}><h3>Credentials awaiting signature</h3><span>{certs.length} credentials</span></div>
          {certs.length === 0 ? (
            <p className="px-5 py-10 text-center text-[#43474e] text-sm">No submitted credentials are currently ready for your signature.</p>
          ) : (
            <div className={styles.queueBody} role="region" aria-label="Credentials awaiting your review" tabIndex={0}>
              {certs.map((cert) => (
                <button
                  key={cert.id}
                  type="button"
                  onClick={() => openReview(cert)}
                  aria-pressed={selected?.id === cert.id}
                  className={`${styles.row} ${selected?.id === cert.id ? styles.selected : ""}`}
                >
                  <ScrollText size={16} className="text-[#022448] shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-[#022448] text-sm font-semibold truncate">{cert.certificate_id}</p>
                    <p className="text-[#43474e] text-xs truncate">{cert.student_name}</p>
                    <p className="mt-1 text-xs text-[#687B8E] break-words">{cert.degree_title}</p>
                    <div className="mt-2"><StatusBadge status={cert.status} /></div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={styles.preview}>
          {!selected ? (
            <p className="text-[#43474e] text-sm py-12 text-center">Select a credential to review its certificate and transcript.</p>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-mono text-[#022448] text-sm font-semibold">{selected.certificate_id}</p>
                  <p className="text-[#43474e] text-sm mt-0.5">
                  Preview the documents below, then open the full detail to review and approve.
                  </p>
                </div>
                <StatusBadge status={selected.status} />
              </div>

              <section className="space-y-4" aria-label="Complete credential documents">
                <div><h3 className="text-base font-semibold text-[#08283F]">Complete credential: certificate &amp; transcript</h3><p className="mt-1 text-xs text-[#687B8E]">Review both supporting documents before recording your approval.</p></div>
                <div className="flex flex-wrap gap-2" aria-label="Credential document selection">{[["certificate", "Certificate document"], ["transcript", "Academic transcript"]].map(([kind, label]) => <button key={kind} type="button" aria-pressed={documentTab === kind} className={documentTab === kind ? "cd-btn-primary" : "cd-btn-secondary"} onClick={() => setDocumentTab(kind)}>{label}</button>)}</div>
                <p className="rounded-lg bg-[var(--cd-tint)] px-4 py-3 text-xs leading-5 text-[#4A5A68]">Inspect the institution logo and seal in the submitted certificate before signing. For template-based certificates, this is an approval progress preview showing captured officer signatures; the original submitted PDF and its hash remain unchanged.</p>
                {documentTab === "certificate" && <CredentialDocumentPreview key={selected.id + "certificate"} id={selected.id} kind="certificate" />}
                {documentTab === "transcript" && <CredentialDocumentPreview key={selected.id + "transcript"} id={selected.id} kind="transcript" />}
              </section>

              {!selected.tx_hash && (
                <div className="rounded-lg border border-[#D8BF84] bg-[#FFF8E7] px-4 py-3 text-sm text-[#795A18]">
                  This certificate has not been submitted on-chain, so it cannot be approved yet. Ask the registrar to open its details and submit it first.
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href={`/dashboard/certificates/${selected.id}`}
                  className="cd-btn-primary"
                >
                  View in full before approval
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
