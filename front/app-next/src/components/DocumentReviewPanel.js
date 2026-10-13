"use client";
/**
 * Registrar document review for one uploaded document.
 *
 * Shows what the extractor read off the PDF next to what the record says, and
 * captures the Registrar's decision. The three outcomes mirror the three the
 * backend accepts:
 *
 *   approve  — every compared field agrees. The backend refuses this while
 *              anything is unresolved, so the button is disabled in that case
 *              rather than offering a request that will be rejected.
 *   override — accept a known difference, with a written reason. This exists
 *              because OCR on a scanned transcript is fallible: insisting on an
 *              exact match would strand correct documents more often than it
 *              would catch wrong ones.
 *   reject   — this is the wrong document; a replacement has to be uploaded.
 *
 * `file` is the still-in-browser File the Registrar picked. Passing it enables
 * the analyse action; omitting it turns the panel into a read-only display of
 * whatever review the certificate already carries, which is how the detail page
 * uses it.
 */

import { Fragment, useEffect, useRef, useState } from "react";
import {
  AlertTriangle, CheckCircle2, FileSearch, Loader2, ShieldAlert, XCircle,
} from "lucide-react";
import { api } from "@/lib/api";

import DocumentReadingOverview from "./DocumentReadingOverview";
import InstitutionIdentityResults from "./InstitutionIdentityResults";
import styles from "./DocumentReviewPanel.module.css";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000/api";

const STATUS_STYLE = {
  match:           { text: "text-[#2F6B4F]", chip: "bg-[#E7F2EC] text-[#2F6B4F]", label: "Agrees" },
  // Its own chip, deliberately not "Agrees". The value is in the document, but
  // it was found by searching the text rather than by reading a labelled field,
  // and a green "Agrees" next to an empty extracted cell reads as though a field
  // had been parsed.
  verbatim_match:  { text: "text-[#A9721F]", chip: "bg-[#FBF2E2] text-[#A9721F]", label: "Found in text" },
  mismatch:        { text: "text-[#A23B34]", chip: "bg-[#FBEAE8] text-[#A23B34]", label: "Differs" },
  not_found:       { text: "text-[#A9721F]", chip: "bg-[#FBF2E2] text-[#A9721F]", label: "Not found" },
  not_compared:    { text: "text-[#4A5A68]", chip: "bg-[#EEF1F4] text-[#4A5A68]", label: "No intake value" },
};

const FIELD_LABELS = {
  student_name:    "Student name",
  degree_title:    "Award / degree",
  institution:     "Institution",
  graduation_year: "Graduation year",
};

const STATE_STYLE = {
  pending:    { chip: "bg-[#FBF2E2] text-[#A9721F]", label: "Awaiting your review" },
  resolved:   { chip: "bg-[#E7F2EC] text-[#2F6B4F]", label: "Checked, all fields agree" },
  overridden: { chip: "bg-[#FBF2E2] text-[#A9721F]", label: "Checked, differences accepted" },
  rejected:   { chip: "bg-[#FBEAE8] text-[#A23B34]", label: "Rejected" },
};

export default function DocumentReviewPanel({
  certId, kind, file, review: initialReview = null, expectations, onChange, showOverview = true,
}) {
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const [imageError, setImageError] = useState("");
  const [lastReadFile, setLastReadFile] = useState(null);
  const needsReading = Boolean(file && file !== lastReadFile);
  const [review, setReview]     = useState(initialReview);
  const [busy, setBusy]         = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [error, setError]       = useState("");
  const [note, setNote]         = useState("");
  const [expanded, setExpanded] = useState(false);

  const inspectedId = review?.id;
  const hasDocumentImages = review?.summary?.institution_identity?.items?.some(item => item.document_image);
  useEffect(() => {
    if (!inspectedId || hasDocumentImages) return;
    const controller = new AbortController();
    const body = new FormData();
    if (file) body.append("document_file", file);
    fetch(API_BASE + "/certificates/" + certId + "/document-reviews/" + kind + "/images/", {
      method: "POST", body, signal: controller.signal,
      headers: { Authorization: "Bearer " + localStorage.getItem("access_token") },
    }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not retrieve inspected document images.");
      if (!controller.signal.aborted) { setImageError(""); setReview(data.review); onChangeRef.current?.(data.review); }
    }).catch(error => { if (!controller.signal.aborted) setImageError(error.message); });
    return () => controller.abort();
  }, [inspectedId, hasDocumentImages, certId, kind, file]);

  const publish = (next) => {
    setReview(next);
    onChange?.(next);
  };

  async function runAnalysis() {
    if (!file) return;
    setAnalysing(true); setError("");
    try {
      const fd = new FormData();
      fd.append("document_file", file);
      fd.append("document_kind", kind);
      // Sending the values the Registrar actually typed lets the check run
      // against what is on screen rather than a stale stored record.
      Object.entries(expectations || {}).forEach(([key, value]) => {
        if (value) fd.append(`expected_${key}`, String(value));
      });

      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      const res = await fetch(`${API_BASE}/certificates/${certId}/analyze-document/`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not read that document.");
      publish(data.review);
      setLastReadFile(file);
      setNote("");
      setExpanded(true);
    } catch (e) {
      setError(e?.message || "Document analysis failed.");
    } finally {
      setAnalysing(false);
    }
  }

  async function resolve(action) {
    setBusy(true); setError("");
    try {
      const fields = (review?.comparisons || [])
        .filter((c) => c.status === "mismatch" || c.status === "not_found")
        .map((c) => c.field);

      const res = await api.post(`/certificates/${certId}/document-reviews/${kind}/resolve/`, {
        action,
        resolution_note: note,
        ...(action === "override" ? { fields } : {}),
      });
      publish(res.review);
      setNote("");
    } catch (e) {
      const detail = e?.response?.data?.detail || e?.message || "Could not record that decision.";
      setError(detail);
    } finally {
      setBusy(false);
    }
  }

  // ── Nothing analysed yet ────────────────────────────────────────────────
  if (!review) {
    return (
      <div className="rounded-lg border border-[#E3E7EB] bg-white p-5">
        <div className="flex items-start gap-3">
          <FileSearch size={18} className="mt-0.5 shrink-0 text-[#4A5A68]" />
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-[#08283F]">
              Check this document against the record
            </h4>
            <p className="mt-1 text-[13px] leading-relaxed text-[#4A5A68]">
              The student name, award, institution and year are read from the PDF
              and compared with the details on this certificate. Anything
              that does not agree has to be dealt with before the credential can be
              submitted on-chain.
            </p>
            {Object.values(expectations || {}).filter(Boolean).length > 0 && (
              <p className="mt-2 text-[13px] leading-relaxed text-[#4A5A68]">
                Comparing against{" "}
                <span className="font-semibold text-[#08283F]">
                  {[
                    expectations.student_name && `"${expectations.student_name}"`,
                    expectations.graduation_year,
                  ].filter(Boolean).join(", ")}
                </span>{" "}
                on this record, plus the award and institution chosen on the previous
                screen.
              </p>
            )}
            {file ? (
              <button
                type="button"
                onClick={runAnalysis}
                disabled={analysing}
                className={`${styles.readButton} ${needsReading && !analysing ? styles.ready : ""} mt-3`}
              >
                {analysing ? <Loader2 size={14} className="animate-spin" /> : <FileSearch size={14} />}
                {analysing ? "Reading document…" : "Read and compare document"}
              </button>
            ) : (
              <p className="mt-2 text-[13px] text-[#4A5A68]">
                Not analysed yet.
              </p>
            )}
          </div>
        </div>
        {error && <p className="mt-3 text-[13px] font-semibold text-[#A23B34]">{error}</p>}
      </div>
    );
  }

  const state    = STATE_STYLE[review.state] || STATE_STYLE.pending;
  const counts   = review.summary?.counts || {};
  const problems = (review.comparisons || []).filter(
    (c) => c.status === "mismatch" || c.status === "not_found",
  );
  // Fields the extractor could not read from a label, but whose value was found
  // somewhere in the document text. These do not block, so the only thing
  // standing between the Registrar and a misreading is that this is visible
  // here. A certificate laid out as centred display text has no labels at all, so
  // this is the common case for one, not an edge case.
  const verbatim = (review.comparisons || []).filter(
    (c) => c.status === "verbatim_match" || c.evidence === "verbatim_text",
  );
  const canApprove = problems.length === 0;
  const decided    = review.state !== "pending";
  // A resolved review is only "all fields agree" if some field was actually read.
  // On a label-less certificate every value came from a text search, so the
  // label has to say that instead.
  const stateLabel = review.state === "resolved" && verbatim.length > 0
    ? "Checked, values found in text"
    : (STATE_STYLE[review.state] || STATE_STYLE.pending).label;
  // Accepting a document where nothing was read is a claim about positions, not
  // about parsed fields, so it is labelled as one and the reason is required.
  const allWeak = canApprove && !decided
    && verbatim.length > 0
    && (review.comparisons || []).every((c) => c.status !== "match");

  return (
    <div className="space-y-4 min-w-0">
      {showOverview && <DocumentReadingOverview review={review} />}
      <div className="rounded-lg border border-[#E3E7EB] bg-white">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E3E7EB] px-5 py-3">
        <div className="flex items-center gap-2">
          {review.is_rejected
            ? <XCircle size={16} className="text-[#A23B34]" />
            : review.is_resolved
              ? <CheckCircle2 size={16} className="text-[#2F6B4F]" />
              : <AlertTriangle size={16} className="text-[#A9721F]" />}
          <h4 className="text-sm font-semibold text-[#08283F]">
            {review.document_label} checked against the record
          </h4>
        </div>
              {file && (
                <button
                  type="button"
                  onClick={runAnalysis}
                  disabled={analysing || busy}
                  className={`${styles.readButton} ${needsReading && !analysing && !busy ? styles.ready : ""}`}
                >
                  {analysing ? <Loader2 size={14} className="animate-spin" /> : <FileSearch size={14} />}
                  {analysing ? "Reading document..." : "Re-read the file"}
                </button>
              )}
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${state.chip}`}>
          {stateLabel}
        </span>
      </div>

      <div className="px-5 py-4">
        <p className="text-[12px] text-[#4A5A68]">
          Read from {review.page_count} page{review.page_count === 1 ? "" : "s"}
          {review.ocr_used ? " with OCR assistance" : ""}
          {" · "}
          {counts.match || 0} agree
          {counts.verbatim_match
            ? `, ${counts.verbatim_match} found in text rather than a labelled field`
            : ""}
          {counts.mismatch ? `, ${counts.mismatch} differ` : ""}
          {counts.not_found ? `, ${counts.not_found} not found` : ""}
        </p>

        {/* Comparison table */}
        <h5 className="mt-4 text-sm font-semibold text-[#08283F]">Student &amp; academic record comparison</h5>
        <div className="overflow-x-auto"><table className="mt-3 w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-[#E3E7EB] text-[11px] uppercase tracking-wide text-[#4A5A68]">
              <th className="py-1.5 pr-2 font-semibold">Field</th>
              <th className="py-1.5 pr-2 font-semibold">Record says</th>
              <th className="py-1.5 pr-2 font-semibold">Document says</th>
              <th className="py-1.5 font-semibold">Result</th>
            </tr>
          </thead>
          <tbody>
            {[... (review.comparisons || [])].sort((a, b) => (a.field === "institution") - (b.field === "institution")).map((item, index, items) => {
              const style = STATUS_STYLE[item.status] || STATUS_STYLE.not_compared;
              return (
                <Fragment key={item.field}>
                {(index === 0 || item.field === "institution" && items[index - 1]?.field !== "institution") && <tr><th colSpan={4} className="pt-4 pb-2 text-xs font-semibold uppercase tracking-wide text-[#08283F]">{item.field === "institution" ? "Institution name" : "Student & award details"}</th></tr>}
                <tr className="border-b border-[#F1F3F5] align-top text-[13px]">
                  <td className="py-2 pr-2 font-medium text-[#08283F]">
                    {FIELD_LABELS[item.field] || item.field}
                  </td>
                  <td className="py-2 pr-2 text-[#4A5A68]">
                    {item.expected || <span className="text-[#8A929C]">— no value on record</span>}
                  </td>
                  <td className={`py-2 pr-2 ${item.extracted ? "text-[#08283F]" : "text-[#8A97A3]"}`}>
                    {item.extracted
                      || (item.status === "verbatim_match"
                        ? "no labelled field — the value is in the text"
                        : "not labelled on the document")}
                    {item.evidence === "verbatim_text" && (
                      <span className="ml-1 text-[11px] text-[#8A5A10]">
                        (not read from a field)
                      </span>
                    )}
                  </td>
                  <td className="py-2">
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${style.chip}`}>
                      {style.label}
                    </span>
                    {item.similarity != null && !canApprove && item.status === "mismatch" && (
                      <span className="ml-1.5 text-[11px] text-[#8A97A3]">
                        {Math.round(item.similarity * 100)}%
                      </span>
                    )}
                  </td>
                </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table></div>

        <InstitutionIdentityResults identity={review.summary?.institution_identity} error={imageError} apiBase={API_BASE} />
        {/* Fields verified by text search rather than by reading a labelled value */}
        {verbatim.length > 0 && (
          <div className="mt-3 rounded-md border border-[#E4E0D2] bg-[#FBF9F2] p-3">
            <p className="text-[12px] font-semibold text-[#6B5424]">
              {verbatim.length === 1
                ? "One field was found in the text, not in a labelled field"
                : `${verbatim.length} fields were found in the text, not in labelled fields`}
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-[#6B5424]">
              This document does not label these values, so they were confirmed by
              searching its text. Check they appear where a{" "}
              {verbatim.length === 1 ? "field" : "credential"} would put
              {verbatim.length === 1 ? " it" : " them"} — the name being present
              somewhere is not the same as the name being the recipient.
            </p>
            <ul className="mt-1.5 space-y-1">
              {verbatim.map((item) => (
                <li key={item.field} className="text-[12px] leading-relaxed text-[#6B5424]">
                  <span className="font-semibold">
                    {FIELD_LABELS[item.field] || item.field}:
                  </span>{" "}
                  {item.expected}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Explanations for anything not agreeing */}
        {problems.length > 0 && (
          <div className="mt-3 rounded-md border border-[#F0E2C8] bg-[#FDF8F0] p-3">
            <p className="text-[12px] font-semibold text-[#8A5A10]">
              {problems.length === 1 ? "One field needs" : `${problems.length} fields need`} your decision
            </p>
            <ul className="mt-1.5 space-y-1">
              {problems.map((item) => (
                <li key={item.field} className="text-[12px] leading-relaxed text-[#6B5424]">
                  <span className="font-semibold">
                    {FIELD_LABELS[item.field] || item.field}:
                  </span>{" "}
                  {item.detail}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Prior decision */}
        {decided && review.resolution_note && (
          <div className="mt-3 rounded-md border border-[#E3E7EB] bg-[#F8F7F2] p-3">
            <p className="text-[12px] font-semibold text-[#08283F]">
              Recorded by {review.reviewed_by || "a registrar"}
              {review.overridden_fields?.length
                ? ` — accepted differences in ${review.overridden_fields
                    .map((f) => FIELD_LABELS[f] || f).join(", ")}`
                : ""}
            </p>
            <p className="mt-1 text-[12px] italic leading-relaxed text-[#4A5A68]">
              “{review.resolution_note}”
            </p>
          </div>
        )}

        {decided && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-3 text-[12px] font-semibold text-[#1F5C8B] underline"
          >
            {expanded ? "Hide decision options" : "Change this decision"}
          </button>
        )}

        {/* Decision controls */}
        {(!decided || expanded) && (
          <div className="mt-4 border-t border-[#E3E7EB] pt-4">
            {(canApprove || decided) && !canApprove && (
              <p className="mb-2 text-[12px] text-[#4A5A68]">
                You can change this decision, but the document will be re-checked
                against the record you see above.
              </p>
            )}

            <label className="block text-[12px] font-semibold text-[#08283F]">
              Reason{allWeak
                ? " (required: no value was read from a labelled field)"
                : canApprove
                  ? " (optional)"
                  : " (required to accept a difference or reject)"}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="e.g. Confirmed with the dean that the certificate is Ada Lovelace's; the surname is misspelled on the original."
              className="mt-1 w-full rounded-md border border-[#D5DBE1] px-3 py-2 text-[13px] text-[#08283F] outline-none focus:border-[#1F5C8B]"
            />

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => resolve("approve")}
                disabled={!canApprove || busy || (allWeak && !note.trim())}
                title={
                  !canApprove
                    ? "Resolve the flagged fields first"
                    : allWeak && !note.trim()
                      ? "Say where you confirmed each value before accepting"
                      : undefined
                }
                className="inline-flex items-center gap-1.5 rounded-md bg-[#2F6B4F] px-3.5 py-2 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                {allWeak
                  ? "Accept — values confirmed in the text"
                  : "Accept — everything agrees"}
              </button>

              <button
                type="button"
                onClick={() => resolve("override")}
                disabled={!note.trim() || busy || review.is_rejected}
                title={!note.trim() ? "A reason is required to accept a difference" : undefined}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#A9721F] px-3.5 py-2 text-[13px] font-semibold text-[#A9721F] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ShieldAlert size={14} />
                Accept the differences
              </button>

              <button
                type="button"
                onClick={() => resolve("reject")}
                disabled={!note.trim() || busy}
                title={!note.trim() ? "A reason is required to reject a document" : undefined}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#A23B34] px-3.5 py-2 text-[13px] font-semibold text-[#A23B34] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <XCircle size={14} />
                Reject this document
              </button>


            </div>
          </div>
        )}

        {error && <p className="mt-3 text-[13px] font-semibold text-[#A23B34]">{error}</p>}
      </div>
      </div>
    </div>
  );
}
