"use client";
import { useCallback, useEffect, useState } from "react";
import { Loader2, CheckCircle2, ScrollText, ExternalLink, FileText } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth, ROLES } from "@/lib/useAuth";
import StatusBadge from "@/components/dashboard/StatusBadge";
import CertificatePreview from "@/components/dashboard/CertificatePreview";
import { approveCertificateOnChain } from "@/lib/walletActions";
import { notifyCertificateApproval } from "@/lib/notifications";
import Link from "next/link";

export default function ApprovalsPage() {
  const { role, loading: authLoading } = useAuth();
  const [certs, setCerts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmingApproval, setConfirmingApproval] = useState(null);

  const isVc = role === ROLES.VC;
  const isChancellor = role === ROLES.CHANCELLOR;
  const statusFilter = isVc ? "pending_vc" : "pending_chancellor";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get(`/certificates/?status=${statusFilter}`);
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
    if (isVc || isChancellor) load();
    else setLoading(false);
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

  async function handleApprove(cert) {
    if (!cert.tx_hash) {
      setError("This certificate has not been submitted on-chain. Ask the registrar to submit it before officer approval.");
      return;
    }
    setBusy(cert.id);
    setError("");
    setSuccess("");
    try {
      const approval = await approveCertificateOnChain(
        cert.certificate_id,
        isVc ? "vc" : "chancellor",
      );
      const path = isVc
        ? `/certificates/${cert.id}/confirm-vc/`
        : `/certificates/${cert.id}/confirm-chancellor/`;
      await api.post(path, { tx_hash: approval.hash });

      setSuccess(`${cert.certificate_id} approved on-chain. Tx: ${approval.hash}`);
      
      // Send notification
      notifyCertificateApproval(
        cert.student_name || 'Unknown Student',
        cert.certificate_id,
        isVc ? 'VC' : 'Dean'
      );
      
      setSelected(null);
      load();
    } catch (e) {
      // MetaMask wraps revert reasons inside e.data.message for -32603 errors
      const revertMsg =
        e?.data?.message ||
        e?.error?.data?.message ||
        e?.reason ||
        e?.shortMessage ||
        e?.message ||
        "";

      // Extract the Solidity revert string if present (e.g. "execution reverted: CertificateRegistry: not an authorized VC")
      const match = revertMsg.match(/execution reverted[:\s]*(.*)/i);
      const display = match?.[1]?.trim() || revertMsg || JSON.stringify(e);
      setError(display);
    } finally {
      setBusy(null);
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
    return <p className="text-[#C62828] text-sm">VC or Dean access only.</p>;
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      {confirmingApproval && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#081c2d]/55 p-4" role="dialog" aria-modal="true" aria-labelledby="approval-confirmation-title">
          <div className="w-full max-w-lg rounded-2xl border border-[#D9E0E7] bg-white p-6 shadow-2xl">
            <CheckCircle2 size={24} className="text-[#2F6F4E]" />
            <h3 id="approval-confirmation-title" className="mt-3 text-lg font-bold text-[#142B41]">Confirm your approval</h3>
            <p className="mt-2 text-sm leading-6 text-[#4A5A68]">
              You are approving {confirmingApproval.certificate_id} as {isVc ? "VC" : "Dean"}. MetaMask will open to record your approval on-chain and may require gas.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setConfirmingApproval(null)} className="cd-btn-secondary">Cancel</button>
              <button onClick={() => { const cert = confirmingApproval; setConfirmingApproval(null); handleApprove(cert); }} className="cd-btn-primary">Confirm approval</button>
            </div>
          </div>
        </div>
      )}
      <div>
        <h2 className="text-[#022448] font-bold text-2xl">
          {isVc ? "VC Approvals" : "Dean Approvals"}
        </h2>
        <p className="text-[#43474e] text-sm mt-0.5">
          Review the certificate preview (same as issuance), then Approve with MetaMask.
        </p>
      </div>

              {error && <div className="bg-[#ffdad6] text-[#93000a] text-sm px-4 py-3 rounded-lg break-all">{error}</div>}
      {success && <div className="bg-[#E8F5E9] text-[#2E7D32] text-sm px-4 py-3 rounded-lg break-all">{success}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
        <div className="bg-white rounded-[14px] border border-[#c4c6cf]/10 overflow-hidden self-start">
          {certs.length === 0 ? (
            <p className="px-5 py-10 text-center text-[#43474e] text-sm">Nothing waiting for your signature.</p>
          ) : (
            <div className="divide-y divide-[#c4c6cf]/10">
              {certs.map((cert) => (
                <button
                  key={cert.id}
                  type="button"
                  onClick={() => openReview(cert)}
                  className={`w-full text-left px-4 py-3.5 flex items-start gap-3 transition-colors ${
                    selected?.id === cert.id ? "bg-[#eef4ff]" : "hover:bg-[#FAF7F2]"
                  }`}
                >
                  <ScrollText size={16} className="text-[#022448] shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-[#022448] text-sm font-semibold truncate">{cert.certificate_id}</p>
                    <p className="text-[#43474e] text-xs truncate">{cert.student_name}</p>
                    <div className="mt-1.5"><StatusBadge status={cert.status} /></div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-[14px] border border-[#c4c6cf]/10 p-5 md:p-6 min-h-[280px]">
          {!selected ? (
            <p className="text-[#43474e] text-sm py-12 text-center">Select a certificate to review the preview.</p>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-mono text-[#022448] text-sm font-semibold">{selected.certificate_id}</p>
                  <p className="text-[#43474e] text-sm mt-0.5">
                  Review the full credential below, then approve it.
                  </p>
                </div>
                <StatusBadge status={selected.status} />
              </div>

              {["full_upload", "transcript_then_cert"].includes(selected.flow_type) ? (
                <div className="space-y-4">
                  {[["Certificate PDF", selected.ipfs_url_pdf], ["Transcript PDF", selected.ipfs_url_transcript]].filter(([, url]) => url).map(([label, url]) => (
                    <section key={label} className="overflow-hidden rounded-xl border border-[#E4E0D5]">
                      <div className="flex items-center justify-between border-b border-[#E4E0D5] bg-[#FCFBF8] px-4 py-3">
                        <span className="flex items-center gap-2 text-sm font-semibold text-[#142B41]"><FileText size={15} />{label}</span>
                        <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-semibold text-[#2F6F4E] hover:underline"><ExternalLink size={13} />Open</a>
                      </div>
                      <iframe src={url} title={label} className="w-full" style={{ height: "520px" }} />
                    </section>
                  ))}
                </div>
              ) : (
                <CertificatePreview
                  certificate={selected}
                  presetId={selected.branding_preset}
                  logoUrl={selected.logo_url || ""}
                  institutionName={selected.institution_name}
                />
              )}

              {!selected.tx_hash && (
                <div className="rounded-lg border border-[#D8BF84] bg-[#FFF8E7] px-4 py-3 text-sm text-[#795A18]">
                  This certificate has not been submitted on-chain, so it cannot be approved yet. Ask the registrar to open its details and submit it first.
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => setConfirmingApproval(selected)}
                  disabled={!!busy || !selected.tx_hash}
                  className="flex items-center gap-2 bg-[#7b5900] text-white px-5 py-2.5 rounded-[12px] text-sm font-semibold disabled:opacity-50"
                >
                  {busy === selected.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Approve with MetaMask (gas)
                </button>
                <Link
                  href={`/dashboard/certificates/${selected.id}`}
                  className="text-[#022448] text-xs font-semibold hover:underline"
                >
                  Open full detail
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
