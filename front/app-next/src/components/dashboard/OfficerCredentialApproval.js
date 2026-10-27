"use client";
import { useRef, useState } from "react";
import CredentialDocumentPreview from "./CredentialDocumentPreview";
import FeedbackToast from "@/components/FeedbackToast";
import { api } from "@/lib/api";
import { approveCertificateOnChain } from "@/lib/walletActions";
import { notifyApprovalRecorded } from "@/lib/notifications";
import { recordCredentialApproval } from "@/lib/credentialApproval.mjs";
import { nextDocumentReview } from "@/lib/documentReview.mjs";

export default function OfficerCredentialApproval({ cert, role, onApproved, children }) {
  const [viewed, setViewed] = useState({});
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const locked = useRef(false);
  const [transaction, setTransaction] = useState(null);
  const [reviewTarget, setReviewTarget] = useState(null);
  const confirmationBox = useRef(null);
  const expectedStatus = role === "vc" ? "pending_vc" : "pending_chancellor";
  const eligible = cert.status === expectedStatus && Boolean(cert.tx_hash);
  const kinds = cert.ipfs_cid_transcript || cert.transcript_hash || cert.flow_type === "full_upload"
    ? ["certificate", "transcript"] : ["certificate"];
  const nextReview = nextDocumentReview(kinds, viewed);

  function reviewMissingPage() {
    if (!nextReview) return;
    setError("");
    setReviewTarget({ ...nextReview, request: Date.now() });
  }

  function pageViewed(kind, page, total) {
    setViewed(previous => previous[kind]?.total === total && previous[kind].pages.includes(page)
      ? previous : { ...previous, [kind]: { total, pages: [...new Set([...(previous[kind]?.pages || []), page])] } });
  }

  async function approve() {
    if (locked.current || !eligible || !acknowledged) return;
    locked.current = true;
    setBusy(true);
    setError("");
    let approval = transaction;
    try {
      await recordCredentialApproval({ cert, role, transaction, api, approveOnChain: approveCertificateOnChain,
        onTransaction: value => { approval = value; setTransaction(value); } });
      setSuccess("Your approval of the complete credential has been recorded.");
      notifyApprovalRecorded(cert.certificate_id, cert.student_name || "Unknown Student", role);
      await onApproved();
    } catch (failure) {
      setError(approval
        ? "Your on-chain approval succeeded, but saving its confirmation failed. Retry saving the approval; another blockchain transaction will not be sent."
        : failure?.reason || failure?.shortMessage || failure?.detail || failure?.message || "Approval failed. Try again.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return <section className="space-y-5" aria-label="Full credential review and approval">
    <FeedbackToast message={error} title="Approval needs attention" />
    <FeedbackToast message={success} tone="success" />
    <div><h3 className="text-lg font-semibold">Review the complete credential</h3><p className="mt-1 text-sm">Scroll to the bottom of every document page, then review the credential details before accepting. One approval covers the complete credential.</p></div>
    {kinds.map(kind => <CredentialDocumentPreview key={kind} id={cert.id} kind={kind} progress={false} onPageViewed={pageViewed} reviewedPages={viewed[kind]?.pages || []} navigationRequest={reviewTarget?.kind === kind ? reviewTarget : null} />)}
    {children}
    {eligible ? <div className="space-y-3 rounded-xl border border-[var(--cd-line)] p-4">
      <p role="status" className="text-sm">{kinds.map(kind => `${kind === "certificate" ? "Certificate" : "Transcript"}: ${viewed[kind]?.pages.length || 0}/${viewed[kind]?.total || "…"} pages viewed`).join(" · ")}</p>
      <p id="credential-review-guidance" className="text-sm text-[var(--cd-muted)]">{nextReview ? `Page tracking: ${nextReview.kind === "transcript" ? "transcript" : "certificate"} page ${nextReview.page} is not marked reviewed. You can revisit it below. Your acceptance confirms that you have reviewed all submitted documents.` : "All document pages are marked reviewed. Accept the review confirmation, then select Approve."}</p>
      {nextReview && <button type="button" className="cd-btn-secondary" disabled={busy} onClick={reviewMissingPage}>Review remaining page: {nextReview.kind} {nextReview.page}</button>}
      <label className="flex items-start gap-2 text-sm"><input ref={confirmationBox} aria-describedby="credential-review-guidance" type="checkbox" checked={acknowledged} disabled={busy} onChange={event => { setError(""); setAcknowledged(event.target.checked); }} />I accept and confirm that I have reviewed the submitted documents.</label>
      <p className="text-xs text-[var(--cd-muted)]">Approve opens MetaMask to sign and submit the on-chain transaction. Gas may be required.</p>
      <button type="button" disabled={busy || !acknowledged} className="cd-btn-primary disabled:opacity-50 disabled:cursor-not-allowed" onClick={approve}>{busy ? "Recording approval…" : transaction ? "Retry saving approval" : kinds.length === 2 ? "Approve certificate & transcript" : "Approve credential"}</button>
    </div> : <p role="status" className="text-sm">{cert.status === "pending_vc" && role === "chancellor" ? "Vice-Chancellor approval is required first." : "This credential is not awaiting your approval."}</p>}
  </section>;
}
