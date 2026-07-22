"use client";
/**
 * Certificate detail — live preview for review.
 * VC/Chancellor approve from /dashboard/approvals.
 * Registrar finalizes PDF + on-chain when status is pending_finalize.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth, ROLES, isInstitutionHead } from "@/lib/useAuth";
import StatusBadge from "@/components/dashboard/StatusBadge";
import CertificatePreview from "@/components/dashboard/CertificatePreview";
import { finalizeCertificateOnChain } from "@/lib/walletActions";

export default function CertificateDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { role, loading: authLoading } = useAuth();
  const [cert, setCert] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await api.get(`/certificates/${id}/`);
      setCert(data);
    } catch (e) {
      setError(e?.detail || "Failed to load certificate.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  async function handleFinalize() {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const prepared = await api.post(`/certificates/${id}/finalize/`, {});
      const { hash, blockNumber } = await finalizeCertificateOnChain(prepared);
      await api.post(`/certificates/${id}/confirm-finalize/`, {
        tx_hash: hash,
        block_number: blockNumber,
      });
      setSuccess(`Issued on-chain. Tx: ${hash}`);
      await load();
    } catch (e) {
      setError(e?.reason || e?.shortMessage || e?.detail || e?.message || JSON.stringify(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteDraft() {
    if (!cert || cert.status !== "draft") return;
    if (!confirm(`Delete draft ${cert.certificate_id}? This cannot be undone.`)) return;
    setDeleting(true);
    setError("");
    try {
      await api.delete(`/certificates/${id}/`);
      router.push("/dashboard/certificates");
    } catch (e) {
      setError(e?.detail || JSON.stringify(e));
      setDeleting(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={28} className="text-[#022448] animate-spin" />
      </div>
    );
  }

  const backHref =
    role === ROLES.VC || role === ROLES.CHANCELLOR
      ? "/dashboard/approvals"
      : "/dashboard/certificates";

  return (
    <div className="flex flex-col gap-6 max-w-[860px]">
      <Link href={backHref} className="inline-flex items-center gap-2 text-[#43474e] text-sm hover:text-[#022448] w-fit">
        <ArrowLeft size={16} /> Back
      </Link>

      {error && (
        <div className="bg-[#ffdad6] text-[#93000a] text-sm px-4 py-3 rounded-lg break-all">{error}</div>
      )}
      {success && (
        <div className="bg-[#E8F5E9] text-[#2E7D32] text-sm px-4 py-3 rounded-lg break-all">{success}</div>
      )}

      {!cert ? (
        <p className="text-sm text-[#43474e]">Certificate not found.</p>
      ) : (
        <div className="bg-white rounded-[14px] border border-[#c4c6cf]/15 p-6 md:p-8 flex flex-col gap-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="font-mono text-[#022448] text-sm font-semibold">{cert.certificate_id}</p>
              <h2 className="text-[#022448] font-bold text-2xl mt-1">{cert.student_name}</h2>
              <p className="text-[#43474e] text-sm mt-0.5">{cert.degree_title}</p>
            </div>
            <StatusBadge status={cert.status} />
          </div>

          <CertificatePreview
            certificate={cert}
            presetId={cert.branding_preset}
            logoUrl={cert.logo_url || ""}
            institutionName={cert.institution_name}
          />

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-[#74777f] text-xs uppercase tracking-wide mb-1">Student email</dt>
              <dd className="text-[#022448]">{cert.student_email || "—"}</dd>
            </div>
            <div>
              <dt className="text-[#74777f] text-xs uppercase tracking-wide mb-1">dataHash</dt>
              <dd className="text-[#022448] font-mono text-xs break-all">{cert.cert_hash || "—"}</dd>
            </div>
            <div>
              <dt className="text-[#74777f] text-xs uppercase tracking-wide mb-1">Submit tx</dt>
              <dd className="text-[#022448] font-mono text-xs break-all">{cert.tx_hash || "—"}</dd>
            </div>
            <div>
              <dt className="text-[#74777f] text-xs uppercase tracking-wide mb-1">Final PDF</dt>
              <dd className="text-[#022448] text-xs break-all">
                {cert.ipfs_url_pdf ? (
                  <a href={cert.ipfs_url_pdf} target="_blank" rel="noreferrer" className="text-[#7b5900] hover:underline">
                    Open on IPFS
                  </a>
                ) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[#74777f] text-xs uppercase tracking-wide mb-1">VC approval</dt>
              <dd className="text-[#022448] text-xs">
                {cert.vc_approver_name || "—"}
                {cert.vc_approval_tx_hash ? (
                  <span className="block font-mono break-all mt-0.5">{cert.vc_approval_tx_hash}</span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-[#74777f] text-xs uppercase tracking-wide mb-1">Chancellor approval</dt>
              <dd className="text-[#022448] text-xs">
                {cert.chancellor_approver_name || "—"}
                {cert.chancellor_approval_tx_hash ? (
                  <span className="block font-mono break-all mt-0.5">{cert.chancellor_approval_tx_hash}</span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-[#74777f] text-xs uppercase tracking-wide mb-1">Registrar</dt>
              <dd className="text-[#022448] text-xs">
                {cert.registrar_signer_name || cert.issued_by_name || "—"}
                {cert.registrar_signed_at ? (
                  <span className="block mt-0.5">{String(cert.registrar_signed_at).slice(0, 10)}</span>
                ) : null}
              </dd>
            </div>
          </dl>

          {(role === ROLES.VC || role === ROLES.CHANCELLOR) &&
            (cert.status === "pending_vc" || cert.status === "pending_chancellor") && (
            <Link
              href="/dashboard/approvals"
              className="self-start bg-[#7b5900] text-white px-5 py-2.5 rounded-[12px] text-sm font-semibold"
            >
              Go to Approvals to sign on-chain
            </Link>
          )}

          {isInstitutionHead(role) && cert.status === "draft" && (
            <button
              onClick={handleDeleteDraft}
              disabled={deleting}
              className="self-start border border-[#C62828] text-[#C62828] px-5 py-2.5 rounded-[12px] text-sm font-semibold hover:bg-[#C62828]/5 disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete draft"}
            </button>
          )}

          {isInstitutionHead(role) && cert.status === "pending_finalize" && (
            <div className="flex flex-col gap-2 self-start">
              <p className="text-[#43474e] text-sm">
                Both officers have signed. Generate the final PDF (with signatures + QR), pin to IPFS, then finalize on-chain.
              </p>
              <button
                onClick={handleFinalize}
                disabled={busy}
                className="flex items-center gap-2 bg-[#022448] text-white px-5 py-2.5 rounded-[12px] text-sm font-semibold disabled:opacity-50"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Wallet size={15} />}
                {busy ? "Finalizing…" : "Generate PDF & Finalize (gas)"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
