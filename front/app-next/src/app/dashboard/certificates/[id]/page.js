"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Wallet, FileText, ExternalLink, ShieldCheck, Send, RefreshCw, UserPlus, Sparkles, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth, ROLES, isInstitutionHead } from "@/lib/useAuth";
import StatusBadge from "@/components/dashboard/StatusBadge";
import CertificatePreview from "@/components/dashboard/CertificatePreview";
import {
  finalizeUploadedCredentialOnChain,
  finalizeWithSealedDocumentOnChain,
  submitForApprovalOnChain,
  submitForSealedReviewOnChain,
  submitUploadedCredentialForApprovalOnChain,
} from "@/lib/walletActions";
import { notifyCertificateIssued, notifyCertificateApproval } from "@/lib/notifications";
import CertificateQrCard from "@/components/CertificateQrCard";
import CertLoaderOverlay from "@/components/dashboard/CertLoaderOverlay";

const UPLOAD_FLOW_TYPES = new Set(["external_upload", "full_upload", "transcript_then_cert"]);

function flowTypeLabel(flowType) {
  switch (flowType) {
    case "full_upload": return "Full upload";
    case "transcript_then_cert": return "Transcript first";
    case "external_upload": return "External upload";
    default: return "System designed";
  }
}

/** Renders the certificate visual — uploaded PDF or system-designed preview */
function CertificateVisual({ cert }) {
  const isUpload = UPLOAD_FLOW_TYPES.has(cert.flow_type);

  // Upload flow: show the actual uploaded PDF via IPFS
  if (isUpload) {
    const pdfUrl = cert.ipfs_url_pdf;
    const transcriptUrl = cert.ipfs_url_transcript;

    if (!pdfUrl) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 bg-[#F8F7F2] border border-[#E4E1D6] rounded-xl py-14 text-center">
          <FileText size={32} className="text-[#B9C6D2]" />
          <p className="text-[#4A5A68] text-sm">PDF not yet pinned to IPFS.</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-4">
        {/* Certificate PDF */}
        <div className="border border-[#E4E1D6] rounded-xl overflow-hidden">
          {/* Header bar */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#F8F7F2] border-b border-[#E4E1D6]">
            <div className="flex items-center gap-2">
              <FileText size={15} className="text-[#B98A28]" />
              <span className="text-[#08283F] text-sm font-semibold">Uploaded Certificate PDF</span>
            </div>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[#B98A28] text-xs font-semibold hover:underline"
            >
              <ExternalLink size={13} /> Open on IPFS
            </a>
          </div>
          {/* Inline PDF viewer */}
          <iframe
            src={pdfUrl}
            title="Certificate PDF"
            className="w-full"
            style={{ height: "600px" }}
          />
        </div>

        {/* Transcript PDF - if present */}
        {transcriptUrl && (
          <div className="border border-[#E4E1D6] rounded-xl overflow-hidden">
            {/* Header bar */}
            <div className="flex items-center justify-between px-4 py-3 bg-[#F8F7F2] border-b border-[#E4E1D6]">
              <div className="flex items-center gap-2">
                <FileText size={15} className="text-[#2F6F4E]" />
                <span className="text-[#08283F] text-sm font-semibold">Uploaded Transcript PDF</span>
              </div>
              <a
                href={transcriptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[#2F6F4E] text-xs font-semibold hover:underline"
              >
                <ExternalLink size={13} /> Open on IPFS
              </a>
            </div>
            {/* Inline PDF viewer */}
            <iframe
              src={transcriptUrl}
              title="Transcript PDF"
              className="w-full"
              style={{ height: "600px" }}
            />
          </div>
        )}
      </div>
    );
  }

  // System-designed flow: show the live preview component
  return (
    <CertificatePreview
      certificate={cert}
      presetId={cert.branding_preset}
      logoUrl={cert.logo_url || ""}
      institutionName={cert.institution_name}
    />
  );
}

export default function CertificateDetailPage() {
  const { id } = useParams();
  const router  = useRouter();
  const { role, loading: authLoading } = useAuth();
  const [cert,     setCert]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [busy,     setBusy]     = useState(false);
  const [finalizing, setFinalizing] = useState(false); // finalize overlay
  const [success,  setSuccess]  = useState("");
  const [resending, setResending] = useState(false);
  const [linkEmail, setLinkEmail] = useState("");
  const [linking,   setLinking]   = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailEditing, setEmailEditing] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailNotice, setEmailNotice] = useState("");
  const [anchorConfirmationOpen, setAnchorConfirmationOpen] = useState(false);

  const [transcriptFile, setTranscriptFile] = useState(null);
  const [transcriptUploading, setTranscriptUploading] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await api.get(`/certificates/${id}/`);
      setCert(data);
      setEmailDraft(data.student_email || "");
      // Pre-fill the student link form with the email on record
      if (!data.student && data.student_email) {
        setLinkEmail(data.student_email);
      }
    } catch (e) {
      setError(e?.detail || "Failed to load certificate.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  // Correcting the address is registrar/super-admin work, and only while the
  // credential is still un-hashed (the API enforces both and returns 409/403).
  const canEditStudentEmail =
    isInstitutionHead(role) && !cert?.cert_hash;

  // System-designed flow finalize (seals the issued document then MetaMask).
  // The document officers approved is the review copy rendered at prepare; this
  // anchors the issued rendering, which adds the signature block.
  async function handleFinalize() {
    setBusy(true); setFinalizing(true); setError(""); setSuccess("");
    try {
      const prepared = await api.post(`/certificates/${id}/finalize/`, {});
      const { hash, blockNumber } = await finalizeWithSealedDocumentOnChain(prepared);
      await api.post(`/certificates/${id}/confirm-finalize/`, {
        tx_hash: hash,
        block_number: blockNumber,
      });
      setSuccess(`Issued on-chain. Tx: ${hash}`);
      
      // Send notification
      notifyCertificateIssued(
        cert.student_name || prepared.student_name || 'Unknown Student',
        cert.certificate_id || prepared.certificate_id
      );
      
      await load();
    } catch (e) {
      setError(e?.reason || e?.shortMessage || e?.detail || e?.message || JSON.stringify(e));
    } finally {
      setBusy(false); setFinalizing(false);
    }
  }

  // Uploaded documents are already hashed and pinned, and those hashes are
  // already on-chain from the submit transaction. This runs the registrar's
  // final anchor; it cannot introduce a document hash that was not reviewed.
  async function handleAnchorApprovedUpload() {
    setBusy(true); setFinalizing(true); setError(""); setSuccess("");
    try {
      const { hash, blockNumber } = await finalizeUploadedCredentialOnChain(cert);
      await api.post(`/certificates/${id}/confirm-finalize/`, {
        tx_hash: hash,
        block_number: blockNumber,
      });
      setSuccess(`Credential anchored on-chain. Tx: ${hash}`);
      await load();
    } catch (e) {
      setError(e?.reason || e?.shortMessage || e?.detail || e?.message || JSON.stringify(e));
    } finally {
      setBusy(false); setFinalizing(false);
    }
  }

  async function handleTranscriptUpload() {
    if (!transcriptFile) return;
    setTranscriptUploading(true); setError(""); setSuccess("");
    try {
      const form = new FormData();
      form.append("transcript_file", transcriptFile);
      const token = localStorage.getItem("access_token");
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000/api"}/certificates/${id}/upload-transcript/`,
        { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Transcript upload failed.");
      setCert(data);
      setTranscriptFile(null);
      setSuccess("Transcript uploaded and pinned to IPFS. It is now available for review.");
    } catch (e) {
      setError(e?.message || "Transcript upload failed.");
    } finally {
      setTranscriptUploading(false);
    }
  }

  async function handleResendInvite() {
    if (!cert || cert.status !== "issued") return;
    setResending(true); setError(""); setSuccess("");
    try {
      const data = await api.post(`/certificates/${id}/resend-invite/`, {});
      // Always open the wa.me link so the registrar can share manually —
      // same pattern as the officer invite share button.
      if (data.wa_url) {
        window.open(data.wa_url, "_blank", "noopener,noreferrer");
      }
      if (data.twilio_sent) {
        setSuccess("WhatsApp sent directly to the student via Twilio.");
      } else if (data.wa_url) {
        setSuccess("WhatsApp opened — send the pre-filled message to the student.");
      } else {
        setSuccess("Invite token created. Share the claim link with the student manually.");
      }
      if (data.claim_url) {
        // Also show the raw link in case they prefer to copy it
        setSuccess(prev =>
          `${prev}\nClaim link: ${data.claim_url}`
        );
      }
    } catch (e) {
      setError(e?.detail || JSON.stringify(e));
    } finally {
      setResending(false);
    }
  }

  /**
   * Submit a certificate that reached review/finalization before its chain
   * submission was recorded. Both officers must then approve it on-chain.
   *
   * Uses the cert_hash already stored in Django — no need to re-run prepare.
   */
  async function handleResubmit() {
    if (!cert || !cert.cert_hash) {
      setError("No cert_hash stored — run prepare from the Issue Certificate flow first.");
      return;
    }
    if (!confirm(
      `Submit ${cert.certificate_id} to the blockchain via MetaMask?\n\n` +
      `This certificate has no recorded submit transaction. It will return to VC review, ` +
      `and both officers must approve it on-chain before finalization.`
    )) return;

    setBusy(true); setError(""); setSuccess("");
    try {
      // Every path must put its document hashes on-chain with the submission.
      // Submitting the data hash alone would leave the officers approving a
      // record that references no document, and the hash would only reach the
      // chain at finalize — after both signatures.
      const { hash, blockNumber } = isUploadFlow
        ? await submitUploadedCredentialForApprovalOnChain(cert)
        : cert.doc_hash
          ? await submitForSealedReviewOnChain({
              certificate_id: cert.certificate_id,
              cert_hash:      cert.cert_hash,
              doc_hash:       cert.doc_hash,
            })
          : await submitForApprovalOnChain({
              certificate_id: cert.certificate_id,
              cert_hash:      cert.cert_hash,
            });
      // Record the tx so Django is in sync
      await api.post(`/certificates/${id}/confirm-chain/`, {
        tx_hash:      hash,
        block_number: blockNumber,
      });
      setSuccess(
        `Submitted on-chain. Tx: ${hash}\n` +
        `The certificate returned to VC review. VC and Dean must approve it on-chain before finalization.`
      );
      await load();
    } catch (e) {
      const msg = e?.data?.message || e?.reason || e?.shortMessage || e?.message || "";
      const match = msg.match(/execution reverted[:\s]*(.*)/i);
      // "certificate already submitted" is fine — it means a previous attempt did land
      const display = match?.[1]?.trim() || msg;
      if (display.toLowerCase().includes("already submitted")) {
        setSuccess(
          `Certificate already exists on-chain — no re-submit needed. ` +
          `If the error persists, ` +
          `check that the VC MetaMask account is authorized.`
        );
      } else {
        setError(display || JSON.stringify(e));
      }
    } finally {
      setBusy(false);
    }
  }

  /**
   * Link an existing student account to this certificate by email.
   * Used for certs issued before the auto-link was in place.
   * Calls POST /api/certify/certificates/<id>/link-student/
   */
  async function handleLinkStudent(e) {
    e.preventDefault();
    const email = linkEmail.trim().toLowerCase();
    if (!email) return;
    setLinking(true); setError(""); setSuccess("");
    try {
      const data = await api.post(`/certificates/${id}/link-student/`, { student_email: email });
      const created = data.student_created;
      setSuccess(
        created
          ? `Student account created for ${email} and linked. They can now log in via Google or claim their WhatsApp invite.`
          : `Student account linked (${email}). The certificate now appears in their portal.`
      );
      setLinkEmail("");
      await load();
    } catch (err) {
      setError(err?.detail || "Failed to link student. Please try again.");
    } finally {
      setLinking(false);
    }
  }

  /**
   * Correct a mistyped student address on the certificate.
   *
   * Only available while the credential is still un-hashed: `student_email`
   * feeds `build_certificate_json()` → `cert_hash` → the on-chain dataHash, and
   * there is no re-hash or re-pin path. The API enforces this and returns 409,
   * so the UI disables the control once `cert_hash` exists.
   *
   * Calls POST /api/certify/certificates/<id>/update-student-email/
   */
  async function handleSaveEmail(e) {
    e.preventDefault();
    const email = emailDraft.trim().toLowerCase();
    setEmailSaving(true); setError(""); setSuccess(""); setEmailNotice("");
    try {
      const data = await api.post(`/certificates/${id}/update-student-email/`, {
        student_email: email,
      });
      setEmailEditing(false);
      setEmailDraft(email);
      if (data.student_account_in_sync === false) {
        setEmailNotice(
          `Updated to ${email}. The linked student account is still ${data.student_account_email}, so WhatsApp invites and portal access still go there. Use "Link student account" to move it.`
        );
      } else {
        setSuccess(`Student email updated to ${email}.`);
      }
      await load();
    } catch (err) {
      // DRF field errors arrive as { student_email: ["…"] }
      const fieldError = err?.student_email?.[0];
      setError(fieldError || err?.detail || "Failed to update the student email.");
    } finally {
      setEmailSaving(false);
    }
  }

  if (authLoading || loading) {
    return <div className="flex justify-center py-16"><Loader2 size={26} className="text-[#08283F] animate-spin" /></div>;
  }

  const backHref = (role === ROLES.VC || role === ROLES.CHANCELLOR)
    ? "/dashboard/approvals"
    : "/dashboard/certificates";

  const isUploadFlow = UPLOAD_FLOW_TYPES.has(cert?.flow_type);

  return (
    <div className="flex flex-col gap-5 w-full">
      {anchorConfirmationOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#081c2d]/55 p-4" role="dialog" aria-modal="true" aria-labelledby="anchor-confirmation-title">
          <div className="w-full max-w-lg rounded-2xl border border-[#D9E0E7] bg-white p-6 shadow-2xl">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EAF2FB] text-[#08283F]"><ShieldCheck size={22} /></div>
            <h3 id="anchor-confirmation-title" className="mt-4 text-lg font-bold text-[#08283F]">Confirm blockchain anchor</h3>
            <p className="mt-2 text-sm leading-6 text-[#4A5A68]">
              You are about to anchor {cert.certificate_id} and its uploaded transcript on-chain. This opens MetaMask and requires a registrar wallet signature and gas. The credential cannot be edited after the transaction is confirmed.
            </p>
            <p className="mt-3 rounded-lg bg-[#F8F7F2] px-3 py-2 text-xs text-[#4A5A68]">
              VC and Dean approvals have already been recorded. Continue only after confirming the documents are correct.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setAnchorConfirmationOpen(false)} className="cd-btn-secondary">Cancel</button>
              <button onClick={() => { setAnchorConfirmationOpen(false); handleAnchorApprovedUpload(); }} className="cd-btn-primary"><Wallet size={15} /> Continue to MetaMask</button>
            </div>
          </div>
        </div>
      )}
      <Link href={backHref} className="inline-flex items-center gap-2 text-[#4A5A68] text-sm hover:text-[#08283F] w-fit transition-colors">
        <ArrowLeft size={15} /> Back
      </Link>

      {error   && <div className="bg-[#F5E5E3] text-[#A23B34] text-sm px-4 py-3 rounded-lg break-all">{error}</div>}
      {success && <div className="bg-[#E7F1EB] text-[#2F6F4E] text-sm px-4 py-3 rounded-lg break-all">{success}</div>}

      {!cert ? (
        <p className="text-sm text-[#4A5A68]">Certificate not found.</p>
      ) : (
        <div className="flex flex-col gap-5 w-full">

          {/* ── Header ── */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="font-mono text-[#08283F] text-sm font-semibold">{cert.certificate_id}</p>
              <h2 className="text-[#08283F] font-bold text-2xl mt-1">{cert.student_name}</h2>
              <p className="text-[#4A5A68] text-sm mt-0.5">{cert.degree_title}</p>
            </div>
            <div className="flex items-center gap-2">
              {isUploadFlow && (
                <span className="flex items-center gap-1.5 bg-[#B98A28]/10 text-[#B98A28] text-xs font-semibold px-2.5 py-1 rounded-full">
                  <FileText size={11} /> External Upload
                </span>
              )}
              <StatusBadge status={cert.status} />
            </div>
          </div>

          {/* ── Certificate visual — uploaded PDF or designed preview ── */}
          <CertificateVisual cert={cert} />

          {isInstitutionHead(role) && !cert.ipfs_url_transcript && !cert.tx_hash && !["issued", "revoked"].includes(cert.status) && (
            <div className="rounded-xl border border-[#D8BF84] bg-[#FFF8E7] p-4">
              <p className="text-sm font-semibold text-[#795A18]">Transcript missing</p>
              <p className="mt-1 text-xs text-[#4A5A68]">
                Attach the student transcript before submitting this certificate on-chain, so the
                VC and Dean review the complete credential and its hash is anchored with the rest.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <input type="file" accept="application/pdf,.pdf" onChange={e => setTranscriptFile(e.target.files?.[0] || null)} className="text-xs text-[#4A5A68]" />
                <button onClick={handleTranscriptUpload} disabled={!transcriptFile || transcriptUploading} className="cd-btn-primary disabled:opacity-50">
                  {transcriptUploading ? <><Loader2 size={15} className="animate-spin" /> Uploading…</> : <><FileText size={15} /> Upload transcript</>}
                </button>
              </div>
            </div>
          )}

          {/* ── Metadata table ── */}
          <div className="bg-white rounded-xl border border-[#E4E1D6] divide-y divide-[#E4E1D6]">
            {[
              ["Flow type",           flowTypeLabel(cert.flow_type), false],
              ["Data hash",           cert.cert_hash || "—",                   true],
              ["Document hash",       cert.doc_hash  || "—",                   true],
              ...(cert.transcript_hash ? [["Transcript hash", cert.transcript_hash, true]] : []),
              ["Submit tx",           cert.tx_hash   || "—",                   true],
            ].map(([label, value, mono]) => (
              <div key={label} className="flex items-start gap-4 px-5 py-3">
                <p className="text-[#8A929C] text-sm w-36 shrink-0 pt-0.5">{label}</p>
                <p className={`text-[#08283F] text-sm break-all ${mono ? "font-mono text-xs" : "font-medium"}`}>{value}</p>
              </div>
            ))}

            {/* Student email — editable while the credential is still un-hashed */}
            <div className="px-5 py-3">
              <div className="flex items-start gap-4">
                <p className="text-[#8A929C] text-sm w-36 shrink-0 pt-1.5">Student email</p>
                <div className="min-w-0 flex-1">
                  {emailEditing ? (
                    <form onSubmit={handleSaveEmail} className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <input
                          type="email"
                          required
                          autoFocus
                          value={emailDraft}
                          onChange={e => setEmailDraft(e.target.value)}
                          placeholder="student@cusl.edu.sl"
                          className="flex-1 text-sm border border-[#DDE3EA] rounded-lg px-3 py-1.5 text-[#08283F] placeholder-[#8A929C] outline-none focus:border-[#08283F] bg-white"
                        />
                        <button
                          type="submit"
                          disabled={emailSaving || !emailDraft.trim()}
                          className="inline-flex items-center gap-1.5 bg-[#08283F] text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
                        >
                          {emailSaving
                            ? <><Loader2 size={12} className="animate-spin" /> Saving…</>
                            : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEmailEditing(false); setEmailDraft(cert.student_email || ""); }}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#4A5A68] hover:bg-[#F5E5E3] whitespace-nowrap"
                        >
                          Cancel
                        </button>
                      </div>
                      <p className="text-[11px] text-[#8A929C]">
                        This address is hashed into the certificate&apos;s on-chain data hash, so it
                        can only be corrected before the credential is anchored.
                      </p>
                    </form>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[#08283F] text-sm font-medium break-all">
                        {cert.student_email || "—"}
                      </span>
                      {canEditStudentEmail && (
                        <button
                          onClick={() => setEmailEditing(true)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#B98A28] hover:underline"
                        >
                          <Pencil size={11} /> Edit
                        </button>
                      )}
                      {!cert.cert_hash && !canEditStudentEmail && (
                        <span className="text-[11px] text-[#8A929C]">read-only for your role</span>
                      )}
                    </div>
                  )}
                  {cert.cert_hash && !emailEditing && (
                    <p className="text-[11px] text-[#8A929C] mt-1">
                      Locked — this certificate has been hashed and anchored on-chain.
                    </p>
                  )}
                  {emailNotice && (
                    <p className="text-[11px] text-[#A9721F] mt-1">{emailNotice}</p>
                  )}
                </div>
              </div>
            </div>

            {/* IPFS links */}
            {cert.ipfs_url_pdf && (
              <div className="flex items-center gap-4 px-5 py-3">
                <p className="text-[#8A929C] text-sm w-36 shrink-0">PDF on IPFS</p>
                <a href={cert.ipfs_url_pdf} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 text-[#B98A28] text-sm font-semibold hover:underline">
                  <ExternalLink size={13} /> Open PDF
                </a>
              </div>
            )}
            {cert.ipfs_url_transcript && (
              <div className="flex items-center gap-4 px-5 py-3">
                <p className="text-[#8A929C] text-sm w-36 shrink-0">Transcript on IPFS</p>
                <a href={cert.ipfs_url_transcript} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 text-[#2F6F4E] text-sm font-semibold hover:underline">
                  <ExternalLink size={13} /> Open Transcript
                </a>
              </div>
            )}
            {cert.ipfs_url_json && (
              <div className="flex items-center gap-4 px-5 py-3">
                <p className="text-[#8A929C] text-sm w-36 shrink-0">Metadata on IPFS</p>
                <a href={cert.ipfs_url_json} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 text-[#4A5A68] text-sm hover:underline">
                  <ExternalLink size={13} /> Open JSON
                </a>
              </div>
            )}

            {/* Approval info — system flow only */}
            {!isUploadFlow && (
              <>
                {(cert.vc_approver_name || cert.vc_approval_tx_hash) && (
                  <div className="flex items-start gap-4 px-5 py-3">
                    <p className="text-[#8A929C] text-sm w-36 shrink-0 pt-0.5">VC approval</p>
                    <div>
                      <p className="text-[#08283F] text-sm font-medium">{cert.vc_approver_name || "—"}</p>
                      {cert.vc_approval_tx_hash && (
                        <p className="font-mono text-[#4A5A68] text-xs break-all mt-0.5">{cert.vc_approval_tx_hash}</p>
                      )}
                    </div>
                  </div>
                )}
                {(cert.chancellor_approver_name || cert.chancellor_approval_tx_hash) && (
                  <div className="flex items-start gap-4 px-5 py-3">
                    <p className="text-[#8A929C] text-sm w-36 shrink-0 pt-0.5">Dean</p>
                    <div>
                      <p className="text-[#08283F] text-sm font-medium">{cert.chancellor_approver_name || "—"}</p>
                      {cert.chancellor_approval_tx_hash && (
                        <p className="font-mono text-[#4A5A68] text-xs break-all mt-0.5">{cert.chancellor_approval_tx_hash}</p>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Registrar */}
            <div className="flex items-start gap-4 px-5 py-3">
              <p className="text-[#8A929C] text-sm w-36 shrink-0 pt-0.5">Registrar</p>
              <div>
                <p className="text-[#08283F] text-sm font-medium">
                  {cert.registrar_signer_name || cert.issued_by_name || "—"}
                </p>
                {cert.registrar_signed_at && (
                  <p className="text-[#4A5A68] text-xs mt-0.5">
                    {new Date(cert.registrar_signed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── Actions ── */}

          {/* VC/Chancellor: go approve */}
          {isInstitutionHead(role) && cert.status === "draft" && cert.flow_type === "system_designed" && (
            <div className="flex flex-col gap-2 border border-[#CFE1F2] rounded-xl px-4 py-4 bg-[#EAF2FB]">
              <div>
                <p className="text-[#08283F] text-sm font-semibold">Ready to continue?</p>
                <p className="text-[#4A5A68] text-xs mt-0.5">
                  Review this certificate design, then submit it for approval when ready.
                </p>
              </div>
              <Link
                href={`/dashboard/certificates/new?flow=system_designed&draft=${encodeURIComponent(cert.id)}`}
                className="cd-btn-primary self-start"
              >
                <Sparkles size={15} /> Continue designing
              </Link>
            </div>
          )}

          {(role === ROLES.VC || role === ROLES.CHANCELLOR) &&
            (cert.status === "pending_vc" || cert.status === "pending_chancellor") && (
            <Link href="/dashboard/approvals"
              className="cd-btn-primary self-start"
              style={{ background: "#B98A28" }}>
              Go to Approvals to sign on-chain
            </Link>
          )}

          {/* System-designed finalize */}
          {isInstitutionHead(role) && cert.status === "pending_finalize" && !isUploadFlow && (
            <div className="flex flex-col gap-2">
              <p className="text-[#4A5A68] text-sm">
                Both officers have signed. Generate the final PDF, pin to IPFS, then finalize on-chain.
              </p>
              <button onClick={handleFinalize} disabled={busy}
                className="cd-btn-primary self-start disabled:opacity-50">
                {busy ? <><Loader2 size={15} className="animate-spin" /> Finalizing…</> : <><Wallet size={15} /> Generate PDF & Finalize (gas)</>}
              </button>
            </div>
          )}

          {isInstitutionHead(role) && cert.status === "pending_finalize" && isUploadFlow && (
            <div className="flex flex-col gap-2">
              <p className="text-[#4A5A68] text-sm">
                Both officers approved this credential. Anchor the certificate and transcript together on-chain.
              </p>
              <button onClick={() => setAnchorConfirmationOpen(true)} disabled={busy}
                className="cd-btn-primary self-start disabled:opacity-50">
                {busy ? <><Loader2 size={15} className="animate-spin" /> Anchoring…</> : <><Wallet size={15} /> Anchor approved credential (gas)</>}
              </button>
            </div>
          )}

          {/* Recover older certificates whose submit transaction is missing */}
          {isInstitutionHead(role) &&
           !cert.tx_hash &&
           ["pending_vc", "pending_chancellor", "pending_finalize"].includes(cert.status) &&
           cert.cert_hash && (
            <div className="flex flex-col gap-2 border border-[#F0D080] rounded-xl px-4 py-4 bg-[#FFF8E7]">
              <p className="text-[#B98A28] text-sm font-semibold flex items-center gap-2">
                <RefreshCw size={14} /> Missing on-chain submission
              </p>
              <p className="text-[#4A5A68] text-xs leading-relaxed">
                The approval queue has no submit transaction for <code className="font-mono">{cert.certificate_id}</code>.
                Submit it now; the certificate will return to VC review and both officers must approve it on-chain before finalization.
              </p>
              <button
                onClick={handleResubmit}
                disabled={busy}
                className="self-start flex items-center gap-2 bg-[#B98A28] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {busy
                  ? <><Loader2 size={14} className="animate-spin" /> Submitting…</>
                  : <><RefreshCw size={14} /> Submit to blockchain</>
                }
              </button>
            </div>
          )}

          {/* Blockchain confirmation badge — only when tx_hash is present */}
          {cert.status === "issued" && cert.tx_hash && (
            <div className="flex items-center gap-3 bg-[#E7F1EB] border border-[#2F6F4E]/20 rounded-xl px-4 py-3 self-start">
              <ShieldCheck size={16} className="text-[#2F6F4E] shrink-0" />
              <div>
                <p className="text-[#2F6F4E] text-sm font-semibold">Anchored on Ethereum</p>
                <p className="font-mono text-[#4A5A68] text-xs mt-0.5">{cert.tx_hash}</p>
              </div>
            </div>
          )}

          {/* QR card + WhatsApp share — all issued certs regardless of tx_hash */}
          {cert.status === "issued" && (
            <>
              <CertificateQrCard certificateId={cert.certificate_id} compact />
              {isInstitutionHead(role) && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-[#4A5A68] text-xs">
                    Share the certificate invite with the student via WhatsApp.
                    Opens WhatsApp with the message pre-filled — just press Send.
                  </p>
                  <button
                    onClick={handleResendInvite}
                    disabled={resending}
                    className="self-start flex items-center gap-2 bg-[#25D366] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {resending
                      ? <><Loader2 size={14} className="animate-spin" /> Opening…</>
                      : <><Send size={14} /> Share invite on WhatsApp</>
                    }
                  </button>
                </div>
              )}
            </>
          )}

          {/* Link student account — shown when no student FK set yet */}
          {isInstitutionHead(role) && !cert.student && (
            <div className="flex flex-col gap-3 border border-[#CFE1F2] rounded-xl px-4 py-4 bg-[#EAF2FB]">
              <div className="flex items-start gap-2.5">
                <UserPlus size={15} className="text-[#08283F] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[#08283F] text-sm font-semibold">Link student account</p>
                  <p className="text-[#4A5A68] text-xs mt-0.5 leading-relaxed">
                    This certificate isn&apos;t linked to a student portal account yet.
                    Enter the student&apos;s email — if they already have a Credence account
                    it will be linked; if not, an account is created automatically so
                    they can log in via Google or claim their WhatsApp invite.
                  </p>
                  <p className="text-[#8A929C] text-xs mt-1">
                    Certificate email on record:{" "}
                    <span className="font-mono text-[#08283F]">{cert.student_email || "—"}</span>
                  </p>
                </div>
              </div>
              <form onSubmit={handleLinkStudent} className="flex gap-2">
                <input
                  type="email"
                  value={linkEmail}
                  onChange={e => setLinkEmail(e.target.value)}
                  placeholder={cert.student_email || "student@cusl.edu.sl"}
                  className="flex-1 text-sm border border-[#DDE3EA] rounded-xl px-3 py-2 text-[#08283F] placeholder-[#8A929C] outline-none focus:border-[#08283F] bg-white"
                  required
                />
                <button
                  type="submit"
                  disabled={linking || !linkEmail.trim()}
                  className="flex items-center gap-1.5 bg-[#08283F] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity whitespace-nowrap"
                >
                  {linking
                    ? <><Loader2 size={13} className="animate-spin" /> Linking…</>
                    : <><UserPlus size={13} /> Link</>
                  }
                </button>
              </form>
            </div>
          )}
        </div>
      )}
      <CertLoaderOverlay variant="finalize" open={finalizing} />
    </div>
  );
}
