"use client";
import FeedbackToast from "@/components/FeedbackToast";
import { publishDashboardUpdate } from "@/lib/dashboardRefresh.mjs";
import WalletSigningControls from "@/components/WalletSigningControls";
import CredentialDocumentPreview from "@/components/dashboard/CredentialDocumentPreview";
import { externalUploadResume } from "@/lib/externalUploadResume.mjs";
import { uploadDocument } from "@/lib/api";
import DocumentReadingOverview from "@/components/DocumentReadingOverview";
import DocumentPdfPreview from "@/components/DocumentPdfPreview";
import StudentNameInput from "@/components/StudentNameInput";
import DeleteButton from "@/components/ui/DeleteButton";
import NavigationButton from "@/components/ui/NavigationButton";

import { ActionButton } from "@/components/ui/AnimatedControls";

/**
 * Flow B — External Upload
 *
 * Steps:
 *   0. Student & degree details  →  POST /api/certificates/  (flow_type=full_upload or transcript_then_cert)
 *   1. Upload signed PDF          →  POST /api/certificates/<id>/upload-and-anchor/
 *                                    (backend: hash PDF, pin to IPFS, stays draft)
 *   2. Sign on-chain              →  submitDocumentForApproval(certId, dataHash, docHash)
 *                                    or submitCredentialForApproval(certId, dataHash, docHash, transcriptHash)
 *   3. Confirm                    →  POST /api/certificates/<id>/confirm-chain/ (status → pending_vc)
 *   4. Done → VC and Chancellor can now approve
 *
 * The document hashes go on-chain in step 2, before either officer signs. The
 * upload is already final, so there is nothing to render later; committing the
 * hashes now is what makes the officers' approval an approval of a document
 * rather than of an on-chain record whose docHash is still zero.
 */

import { useState, useEffect, useRef } from "react";
import {
  ArrowLeft, CheckCircle2, Loader2, Upload,
  Wallet, ShieldCheck, User, FileText, RefreshCw, X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import GraduateEmailInput from "@/components/GraduateEmailInput";
import CredentialSignerIndicator from "@/components/CredentialSignerIndicator";
import CertLoaderOverlay from "@/components/dashboard/CertLoaderOverlay";
import DocumentReviewPanel from "@/components/DocumentReviewPanel";
import { useAuth } from "@/lib/useAuth";
import { submitUploadedCredentialForApprovalOnChain } from "@/lib/walletActions";
import CertificateQrCard from "@/components/CertificateQrCard";
import styles from "./ExternalUploadFlow.module.css";
import { restoreDraftForm } from "@/lib/restoreDraftForm.mjs";

const STEPS = [
  { label: "Student Details", icon: User },
  { label: "Upload & Review", icon: Upload },
  { label: "Sign On-Chain",   icon: Wallet },
  { label: "Complete",        icon: CheckCircle2 },
];

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000/api";

// Multipart requests cannot go through the `api` helper, which always sends
// JSON, so the authenticated ones are built here. `DocumentReviewPanel` needs
// the same thing for the analysis upload.
export function authHeaders() {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Reopen a document that was saved to a draft, rebuilding a File from the
// server copy. The File is what the review panel analyses, so a restored
// document behaves exactly like a freshly chosen one. A draft that never had
// one comes back null rather than raising, because "not saved yet" is a normal
// state rather than a failure.
export async function fetchDraftDocument(certificateId, kind) {
  const res = await fetch(
    `${API_BASE}/certificates/${certificateId}/draft-document/?kind=${kind}&transport=json`,
    { headers: authHeaders() },
  );
  if (!res.ok) {
    if (res.status !== 404) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || "A saved document could not be reopened.");
    }
    return null;
  }
  const data = await res.json();
  const bytes = Uint8Array.from(atob(data.content_base64), character => character.charCodeAt(0));
  return new File([bytes], data.filename || `${kind}.pdf`, { type: "application/pdf" });
}

// One document's working area: the page itself on the left, everything read off
// it on the right.
//
// Checking a document against the record is a comparison, so the two halves are
// shown together rather than one after the other. Reading a value in the
// extracted table and then hunting for it in the PDF is the whole job, and
// splitting them across a scrolling column turns every field into a hunt.
//
// Exported because the system-designed flow puts a transcript through exactly
// the same work — choose, preview, analyse, decide — and a second copy of this
// layout would be a second thing to keep in step.
export function DocumentWorkbench({
  label, kind, required = false, tint = "#B98A28",
  inputId, inputRef, onPick, file, preview, onClear, onReplace, saving, saveError, children, scanUpload = false, onRotate,
}) {
  const [rotationPage, setRotationPage] = useState("");
  return (
    <div className={styles.workbench}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-[#F8F7F2] border-b border-[#E4E1D6]">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `${tint}1A` }}
          >
            <FileText size={16} style={{ color: tint }} />
          </div>
          <div className="min-w-0">
            <p className="text-[#08283F] text-sm font-semibold truncate">{label}</p>
            {file ? (
              <p className="text-[#8A929C] text-xs truncate">
                {file.name} · {(file.size / 1024).toFixed(1)} KB
              </p>
            ) : (
              <p className="text-[#8A929C] text-xs">Awaiting document</p>
            )}
          </div>
        </div>
        {file ? (
          <div className="flex items-center gap-1.5 shrink-0">
            {onRotate && <div className="flex items-center gap-1">
              <input type="number" min="1" value={rotationPage} onChange={e => setRotationPage(e.target.value)} placeholder="All" aria-label="Page to rotate; leave empty for all pages" disabled={saving} className="w-14 border rounded px-1 py-1 text-xs" />
              <button type="button" onClick={() => onRotate(rotationPage)} disabled={saving} className="px-2 py-1.5 text-xs font-semibold text-[#08283F] border rounded-lg disabled:opacity-60">Rotate 90 degrees</button>
            </div>}
            {/* Replacing rather than clearing first: the Registrar keeps the
                document in view throughout, and the existing one is overwritten on
                the server by the save, so there is no window where the draft has
                no document at all. */}
            <button
              type="button"
              onClick={onReplace}
              disabled={saving}
              title={`Choose a different ${label.toLowerCase()}`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-[#08283F] bg-white border border-[#D8DDE2] hover:bg-[#EAF2FB] hover:border-[#B98A28] transition-colors disabled:opacity-60"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Replace
            </button>
            <button
              type="button"
              onClick={onClear}
              disabled={saving}
              title={`Remove this ${label.toLowerCase()}`}
              aria-label={`Remove ${label.toLowerCase()}`}
              className="p-1.5 rounded-lg hover:bg-[#F5E5E3] text-[#A23B34] transition-colors"
            >
              <X size={15} />
            </button>
          </div>
        ) : null}
      </div>

      <div className={file ? styles.workbenchColumns : styles.emptyWorkbench}>
        {/* Left — the document */}
        <div className={styles.documentPane}>
          {file ? (
            <DocumentPdfPreview
              src={preview}
              title={`${label} preview`}
              className="w-full rounded-lg border border-[#E4E1D6]"
              style={{ height: "540px" }}
            />
          ) : (
            <label
              htmlFor={inputId}
              className={styles.dropzone}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${tint}1A` }}>
                <Upload size={18} style={{ color: tint }} />
              </div>
              <div>
                <p className="text-[#08283F] font-semibold text-sm">
                  Choose {label.toLowerCase()}
                </p>
                <p className="text-[#8A929C] text-xs mt-1">{scanUpload ? "PDF, JPEG or PNG; select pages in order; combined max 20 MB" : "PDF only; max 20 MB"}</p>
              </div>
            </label>
          )}
          {/* Kept mounted in both states: the Replace button drives this input
              directly, and a change event only fires if the input is in the tree. */}
          <input
            id={inputId}
            ref={inputRef}
            type="file"
            accept={scanUpload ? "application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" : "application/pdf,.pdf"}
            multiple={scanUpload}
            className="sr-only"
            disabled={saving}
            onChange={onPick}
          />
          {saving && (
            <p className="mt-2 text-[11px] text-[#4A5A68] flex items-center gap-1.5">
              <Loader2 size={11} className="animate-spin" /> Saving to this draft…
            </p>
          )}
          <FeedbackToast title={`${label} not saved`} message={!saving && saveError?.kind === kind ? `${saveError.message} The document remains in this browser but will not survive a refresh. Retry saving before leaving.` : ""} />
        </div>

        {/* Right — read it, and what was read out of it */}
        <div className={file ? styles.reviewPane : styles.emptyReview} tabIndex={file ? 0 : undefined} role={file ? "region" : undefined} aria-label={file ? `${label} review results` : undefined}>{children}</div>
      </div>
    </div>
  );
}

export default function ExternalUploadFlow({ onBack, flowType = "full_upload", emailDomain = "", draftId = null }) {
  const { user } = useAuth();
  const router = useRouter();

  const [feedback, setFeedback] = useState("");
  const [step,        setStep]        = useState(0);
  const [preparedResume, setPreparedResume] = useState(false);
  const [preparedReviewAccepted, setPreparedReviewAccepted] = useState(false);
  const [certId,      setCertId]      = useState(null);
  const [cert,        setCert]        = useState(null);
  const [anchorData,  setAnchorData]  = useState(null); // returned by upload-and-anchor
  const [txHash,      setTxHash]      = useState("");
  const [blockNum,    setBlockNum]    = useState(null);
  const [busy,        setBusy]        = useState(false);
  const [finalizing,  setFinalizing]  = useState(false);
  const [resumeLoading, setResumeLoading] = useState(Boolean(draftId));
  const [error,       setError]       = useState("");
  const [uploadError, setUploadError] = useState("");

  // PDF file state - now supporting both certificate and transcript
  const [certPdfFile,       setCertPdfFile]       = useState(null);
  const [certPdfPreview,    setCertPdfPreview]    = useState("");
  const [transcriptPdfFile, setTranscriptPdfFile] = useState(null);
  const [transcriptPdfPreview, setTranscriptPdfPreview] = useState("");

  // Registrar document review state. A review is only good if it is resolved
  // and applies to the file currently selected, which the backend re-checks by
  // hash; the conditions here stop the button being offered prematurely.
  const [certReview,       setCertReview]       = useState(null);
  const [transcriptReview, setTranscriptReview] = useState(null);

  // Resumable-draft state. A draft holds its documents locally from the moment
  // they are picked, so a refresh, a closed tab or a crash costs the Registrar
  // nothing, and reopening a draft brings back the page, the file and the
  // decision they had already made.
  const [savingKind,      setSavingKind]      = useState(null);   // "certificate" | "transcript"
  // Held as {kind, message} rather than a bare string: both documents render the
  // same notice, and a message that named neither would be attached to whichever
  // one the Registrar happened to look at.
  const [saveError,       setSaveError]       = useState(null);
  const [restoredSummary, setRestoredSummary] = useState(null);   // what a resumed draft had
  const [confirmAbandon,  setConfirmAbandon]  = useState(false);

  const documentsSelected = Boolean(
    certPdfFile && (flowType === "full_upload" ? transcriptPdfFile : true),
  );
  const documentsReviewed = Boolean(
    certReview?.is_resolved && !certReview?.is_rejected
    && (flowType !== "full_upload" || (transcriptReview?.is_resolved && !transcriptReview?.is_rejected)),
  );
  const certFileInputRef = useRef(null);
  const transcriptFileInputRef = useRef(null);

  // Catalog
  const [departments,    setDepartments]    = useState([]);
  const [programs,       setPrograms]       = useState([]);
  const [grades,         setGrades]         = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);

  const [form, setForm] = useState({
    student_name:            "",
    student_email:           "",
    department_id:           "",
    program_id:              "",
    grade_classification_id: "",
    graduation_year:         new Date().getFullYear(),
  });

  // The classification is part of what gets hashed into the credential, so a draft must
  // not be created without it. Only enforced when the institution actually has
  // classifications to choose from — an empty catalog would otherwise make the
  // form impossible to submit, which is a worse failure than a missing grade.
  const needsGrade = grades.length > 0 && !form.grade_classification_id;

  // Label of the classification on a reopened draft, pending the catalog to map it to an id.
  const restoredGradeLabel = useRef("");

  // Resolves the stored grade label once the catalog is available. A classification that
  // has since been renamed or deactivated will not match, and the select then shows
  // nothing chosen rather than silently pointing at a different classification.
  useEffect(() => {
    const label = restoredGradeLabel.current;
    if (!label || grades.length === 0) return;
    const match = grades.find(g => g.label === label);
    if (match) setForm(prev => (prev.grade_classification_id ? prev : { ...prev, grade_classification_id: match.id }));
  }, [grades]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCatalogLoading(true);
      try {
        const [d, g] = await Promise.all([
          api.get(`/catalog/departments/${draftId ? "?include_inactive=1" : ""}`),
          api.get(`/catalog/grades/${draftId ? "?include_inactive=1" : ""}`),
        ]);
        if (!cancelled) {
          setDepartments(d.results ?? d);
          setGrades(g.results ?? g);
        }
      } catch {
        if (!cancelled) setError("Failed to load catalog.");
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [draftId]);

  useEffect(() => {
    if (!form.department_id) {
      queueMicrotask(() => setPrograms([]));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const p = await api.get(`/catalog/programs/?department=${form.department_id}${draftId ? "&include_inactive=1" : ""}`);
        if (!cancelled) setPrograms(p.results ?? p);
      } catch {
        if (!cancelled) setPrograms([]);
      }
    })();
    return () => { cancelled = true; };
  }, [form.department_id, draftId]);

  // ── Step 1: document upload ──
  //
  // Documents are saved to the draft the moment they are chosen, not at the end
  // of the flow. Pinata is a metered service and the anchored hash has to mean
  // "this file is on the chain", so a draft keeps its PDFs in the server's own
  // encrypted storage and is pinned exactly once, by `upload-and-anchor/`.
  async function persistDraftDocument(kind, file) {
    if (!certId) return;
    setSavingKind(kind);
    try {
      const fd = new FormData();
      fd.append("kind", kind);
      fd.append("document_file", file);
      const res = await fetch(`${API_BASE}/certificates/${certId}/save-draft-document/`, {
        method: "POST",
        headers: authHeaders(),
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // DRF reports serializer failures per field, and a 500 returns HTML, so
        // neither has a `detail`. Both used to collapse into one generic sentence
        // that named the wrong problem — the request had never reached the view
        // in the common case, so blaming the draft was actively misleading.
        const fieldError = Object.entries(data || {})
          .filter(([key]) => key !== "detail")
          .map(([, value]) => (Array.isArray(value) ? value.join(" ") : String(value)))
          .join(" ");
        throw new Error(
          data?.detail
            || fieldError
            || (res.status >= 500
              ? `The server could not store the document (HTTP ${res.status}).`
              : `The document was refused (HTTP ${res.status}).`),
        );
      }
      publishDashboardUpdate(`/certificates/${certId}/save-draft-document/`);
      setSaveError(null);
    } catch (e) {
      // Autosave failing must not lose the in-memory file, so the error is
      // reported and the flow carries on; the anchor step is where a missing
      // document becomes unmissable. A rejected `fetch` never reached Django at
      // all, which is a different problem with a different fix, so it is named.
      const message = e?.name === "TypeError"
        ? "The upload never reached the server. Check the backend is running and that this site's origin is allowed by the API's CORS settings."
        : e?.message || "The document could not be saved to this draft.";
      setSaveError({ kind, message });
    } finally {
      setSavingKind(null);
    }
  }

  // A draft already has its student and programme data, and — since documents
  // are saved on selection — possibly its documents and the review decisions
  // already made about them. Resume restores all of it so leaving the workflow
  // never creates a second certificate and never repeats work.
  useEffect(() => {
    if (!draftId) return;
    let cancelled = false;

    (async () => {
      try {
        const data = await api.get(`/certificates/${draftId}/`);
        if (cancelled) return;
        const resume = externalUploadResume(data, flowType);
        if (resume.kind === "prepared_review") {
          setCertId(data.id); setCert(data); setAnchorData(data);
          setPreparedResume(true); setPreparedReviewAccepted(false); setStep(resume.step);
          setFeedback("An existing prepared credential matches these details. Review its saved documents before continuing to signing; no duplicate draft was created.");
          return;
        }
        if (resume.kind === "detail") {
          router.replace(`/dashboard/certificates/${data.id}`);
          return;
        }
        setPreparedResume(false); setPreparedReviewAccepted(false); setAnchorData(null);
        if (data.status !== "draft" || data.flow_type !== flowType) {
          throw new Error("This certificate is not an editable draft for this upload workflow.");
        }
        if (cancelled) return;

        setCertId(data.id);
        setCert(data);
        const [departmentData, programData, gradeData] = await Promise.all([
          api.get("/catalog/departments/?include_inactive=1"),
          api.get("/catalog/programs/?include_inactive=1"),
          api.get("/catalog/grades/?include_inactive=1"),
        ]);
        if (cancelled) return;
        setForm(restoreDraftForm(data, departmentData.results ?? departmentData, programData.results ?? programData, gradeData.results ?? gradeData));
        restoredGradeLabel.current = data.grade || "";

        const reviews = data.document_reviews?.reviews || [];
        const certReviewSaved = reviews.find(r => r.document_kind === "certificate") || null;
        const transcriptReviewSaved = reviews.find(r => r.document_kind === "transcript") || null;

        const [certFile, transcriptFile] = await Promise.all([
          data.has_draft_certificate ? fetchDraftDocument(data.id, "certificate") : null,
          (data.has_draft_transcript && flowType === "full_upload")
            ? fetchDraftDocument(data.id, "transcript")
            : null,
        ]);
        if (cancelled) return;

        if (certFile) {
          setCertPdfFile(certFile);
          setCertPdfPreview(URL.createObjectURL(certFile));
          setCertReview(certReviewSaved);
        }
        if (transcriptFile) {
          setTranscriptPdfFile(transcriptFile);
          setTranscriptPdfPreview(URL.createObjectURL(transcriptFile));
          setTranscriptReview(transcriptReviewSaved);
        }

        // "Where the user left off", stated plainly: the record exists, so the
        // details were entered, and any document that came back is one they had
        // already chosen.
        const decided = [...(certReviewSaved ? [certReviewSaved] : []),
                        ...(transcriptReviewSaved ? [transcriptReviewSaved] : [])]
          .filter(r => r.state !== "pending").length;
        setRestoredSummary({
          certificate_id: data.certificate_id,
          student_name:   data.student_name,
          hasCertificate: Boolean(certFile),
          hasTranscript:  Boolean(transcriptFile),
          decided,
        });

        setStep(1);
      } catch (e) {
        if (!cancelled) setError(e?.detail || e?.message || "Unable to open this certificate draft.");
      } finally {
        if (!cancelled) setResumeLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [draftId, flowType, router]);

  // Throwing a draft away is irreversible, so it takes an explicit second
  // click. The record and every document saved against it are removed; the
  // audit entry outlives both.
  async function handleAbandon() {
    setFeedback(""); setBusy(true); setError("");
    try {
      const res = await fetch(`${API_BASE}/certificates/${certId}/abandon/`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "This draft could not be discarded.");
      }
      resetAll();
      publishDashboardUpdate(`/certificates/${certId}/abandon/`);
      onBack();
    } catch (e) {
      setError(e?.message || "This draft could not be discarded.");
      setConfirmAbandon(false);
    } finally { setBusy(false); }
  }

  function upd(field, val) {
    setForm(prev => {
      const next = { ...prev, [field]: val };
      if (field === "department_id") next.program_id = "";
      return next;
    });
  }

  async function prepareSelection(files, kind, rotation = 0, rotationPage = "") {
    if (!files.length) return;
    setError("");
    setSaveError(null);
    setSavingKind(kind);
    try {
      let file = files[0];
      if (files.length !== 1 || !file.name.toLowerCase().endsWith(".pdf") || rotation) {
        const fd = new FormData();
        files.forEach(page => fd.append("pages", page));
        fd.append("rotation", String(rotation));
        if (rotationPage) fd.append("rotation_page", rotationPage);
        const res = await fetch(`${API_BASE}/certificates/${certId}/prepare-document/`, {
          method: "POST", headers: authHeaders(), body: fd,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || "The scan pages could not be prepared.");
        }
        file = new File([await res.blob()], `${kind}.pdf`, { type: "application/pdf" });
      }
      if (file.size > 20 * 1024 * 1024) throw new Error("The combined document must be under 20 MB.");
      if (kind === "certificate") {
        if (certPdfPreview) URL.revokeObjectURL(certPdfPreview);
        setCertPdfFile(file);
        setCertPdfPreview(URL.createObjectURL(file));
        setCertReview(null);
      } else {
        if (transcriptPdfPreview) URL.revokeObjectURL(transcriptPdfPreview);
        setTranscriptPdfFile(file);
        setTranscriptPdfPreview(URL.createObjectURL(file));
        setTranscriptReview(null);
      }
      await persistDraftDocument(kind, file);
    } catch (err) {
      setError(err.message || "Could not prepare the selected documents.");
    } finally {
      setSavingKind(null);
    }
  }

  function handleCertFileChange(e) {
    prepareSelection(Array.from(e.target.files || []), "certificate");
  }

  function handleTranscriptFileChange(e) {
    prepareSelection(Array.from(e.target.files || []), "transcript");
  }

  // Clearing a file has to clear it on the server too, or the next time this
  // draft is opened the document is back — along with any decision recorded
  // against it, which the backend drops along with the file.
  async function discardDraftDocument(kind) {
    if (!certId) return;
    try {
      const res = await fetch(
        `${API_BASE}/certificates/${certId}/draft-document/?kind=${kind}`,
        { method: "DELETE", headers: authHeaders() },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "The document could not be removed from this draft.");
      }
    } catch (e) {
      setError(e?.message || "The document could not be removed from this draft.");
    }
  }

  function clearCertFile() {
    setCertPdfFile(null);
    setCertPdfPreview("");
    setCertReview(null);
    if (certFileInputRef.current) certFileInputRef.current.value = "";
    discardDraftDocument("certificate");
  }

  function clearTranscriptFile() {
    setTranscriptPdfFile(null);
    setTranscriptPdfPreview("");
    setTranscriptReview(null);
    if (transcriptFileInputRef.current) transcriptFileInputRef.current.value = "";
    discardDraftDocument("transcript");
  }

  // Opens the chooser over the document already in place. The input is reset
  // first so re-picking the same file still raises a change event — otherwise
  // choosing the identical PDF a second time silently does nothing, which is the
  // case a Registrar hits when they pick the wrong file and immediately want it
  // back. `handleCertFileChange` then overwrites the saved copy; the old document
  // is never sent anywhere first.
  function replaceCertFile() {
    if (certFileInputRef.current) {
      certFileInputRef.current.value = "";
      certFileInputRef.current.click();
    }
  }

  function replaceTranscriptFile() {
    if (transcriptFileInputRef.current) {
      transcriptFileInputRef.current.value = "";
      transcriptFileInputRef.current.click();
    }
  }

  // ── Step 0: Create draft with flow_type from prop ──
  async function handleCreate(e) {
    e.preventDefault();
    if (busy || resumeLoading) return;
    setFeedback(""); setBusy(true); setError("");
    try {
      const payload = {
        ...(certId || draftId ? { draft_id: certId || draftId } : {}),
        student_name:   form.student_name.trim(),
        student_email:  form.student_email.trim(),
        department_id:  form.department_id,
        program_id:     form.program_id,
        graduation_year: form.graduation_year,
        flow_type:      flowType, // Use the flowType passed from parent
      };
      if (form.grade_classification_id) payload.grade_classification_id = form.grade_classification_id;
      const data = await api.post("/certificates/", payload);
      if (data.status !== "draft" && data.tx_hash) {
        router.replace(`/dashboard/certificates/${data.id}`);
        return;
      }
      setCertId(data.id); setCert(data); setStep(1);
      if (data.draft_details_changed) { setCertReview(null); setTranscriptReview(null); }
      setFeedback(data.draft_reused ? "Continuing the existing credential draft. Saved documents have been kept." : "Student details saved to the draft.");
      router.replace(`/dashboard/certificates/new?flow=${data.flow_type}&draft=${data.id}`, { scroll: false });
    } catch (e) {
      setError(e?.grade_classification_id?.[0] || e?.student_name?.[0] || e?.graduation_year?.[0] || e?.program_id?.[0] || e?.department_id?.[0] || e?.detail || JSON.stringify(e));
    } finally { setBusy(false); }
  }

  // ── Step 1: Upload PDF(s) → hash + pin → pending_finalize ──
  async function handleUpload() {
    setUploadError("");
    setError("");
    // For full_upload flow, require both files
    if (flowType === "full_upload") {
      if (!certPdfFile || !transcriptPdfFile) {
        setUploadError("Please select both certificate and transcript PDFs to upload.");
        return;
      }
    } else {
      if (!certPdfFile) {
        setUploadError("Please select a PDF to upload.");
        return;
      }
    }
    
    setFeedback(""); setBusy(true); setError("");
    try {
      const fd = new FormData();
      fd.append("document_file", certPdfFile);
      if (flowType === "full_upload" && transcriptPdfFile) {
        fd.append("transcript_file", transcriptPdfFile);
      }

      const data = await uploadDocument(`/certificates/${certId}/upload-and-anchor/`, fd);
      setAnchorData(data);
      setFeedback("Documents uploaded successfully. Continue with the Registrar wallet to submit for approval.");
      // The hashes are fixed now, so they can go on-chain before officers review.
      setStep(2);
    } catch (e) {
      setUploadError(e?.message || "The documents could not be uploaded. Please try again.");
    } finally { setBusy(false); }
  }

  // ── Step 2: MetaMask — commit the document hashes for review ──
  async function handleSign() {
    if (!anchorData) return;
    if (preparedResume && !preparedReviewAccepted) {
      setError("Review the prepared documents and accept the review confirmation before signing.");
      setStep(1);
      return;
    }
    setFeedback(""); setBusy(true); setFinalizing(true); setError("");
    try {
      const { hash, blockNumber } =
        await submitUploadedCredentialForApprovalOnChain(anchorData);
      setFeedback("Blockchain transaction confirmed. Confirm the submission to update the credential record.");
      setTxHash(hash); setBlockNum(blockNumber); setStep(3);
    } catch (e) {
      const msg = e?.data?.message || e?.reason || e?.shortMessage || e?.message || "";
      const match = msg.match(/execution reverted[:\s]*(.*)/i);
      setError(match?.[1]?.trim() || msg || "MetaMask transaction failed.");
    } finally {
      setBusy(false); setFinalizing(false);
    }
  }

  // ── Step 3: Confirm blockchain submission in Django ──
  async function handleConfirm() {
    setFeedback(""); setBusy(true); setError("");
    try {
      await api.post(`/certificates/${certId}/confirm-chain/`, {
        tx_hash: txHash,
        block_number: blockNum,
      });
      setStep(4);
      setFeedback("Credential submitted for institutional approval.");
    } catch (e) {
      setError(e?.detail || JSON.stringify(e));
    } finally { setBusy(false); }
  }

  function resetAll() {
    setPreparedResume(false); setPreparedReviewAccepted(false);
    router.replace(`/dashboard/certificates/new?flow=${flowType}`, { scroll: false });
    setStep(0); setCertId(null); setCert(null); setAnchorData(null);
    setTxHash(""); setBlockNum(null); setError(""); setFeedback("");
    setCertPdfFile(null); setCertPdfPreview("");
    setTranscriptPdfFile(null); setTranscriptPdfPreview("");
    setCertReview(null); setTranscriptReview(null);
    setRestoredSummary(null); setConfirmAbandon(false); setSavingKind(null);
    restoredGradeLabel.current = "";
    setForm({ student_name: "", student_email: "", department_id: "", program_id: "", grade_classification_id: "", graduation_year: new Date().getFullYear() });
  }

  const catalogReady = departments.length > 0;

  // The award, department and classification are resolved server-side onto the
  // certificate as snapshots when the draft is created, so they are read from the
  // record rather than from the ids still held in the form. Falls back to the
  // catalog labels for the fields that are only known by id.
  const recordAward = cert?.degree_title
    || programs.find(p => p.id === form.program_id)?.title
    || "";
  const recordDepartment = cert?.department
    || departments.find(d => d.id === form.department_id)?.name
    || "";
  const recordGrade = cert?.grade
    || grades.find(g => g.id === form.grade_classification_id)?.label
    || "";

  // Get flow-specific header text
  const getFlowTitle = () => {
    switch(flowType) {
      case "full_upload": return "Upload Both Certificate & Transcript";
      case "transcript_then_cert": return "Upload Certificate Only";
      default: return "Upload Existing Certificate";
    }
  };

  const getFlowSubtitle = () => {
    switch(flowType) {
      case "full_upload":
        return "Upload both documents together → anchor hash on-chain";
      case "transcript_then_cert":
        // This flow never asks for a transcript. One has to be attached from the
        // certificate's own page, before submission, so saying "transcript first"
        // here described a step that does not exist on this screen.
        return "Signed certificate only — attach a transcript later from the certificate page";
      default: return "Upload signed PDF → anchor hash on-chain";
    }
  };

  return (
    <div className={`${styles.flow} flex flex-col gap-3 w-full`}>
      <FeedbackToast message={uploadError} title="Upload failed" />
      <div className={styles.topline}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <NavigationButton direction="back" onClick={onBack} aria-label="Back to issuance workflows" className="p-2 rounded-lg hover:bg-[#EAF2FB] transition-colors text-[#4A5A68]">Back
          <ArrowLeft size={18} />
        </NavigationButton>
        <div>
          <h2 className="text-[#08283F] font-bold text-2xl">{getFlowTitle()}</h2>
          <p className="text-[#4A5A68] text-sm mt-0.5">{getFlowSubtitle()}</p>
        </div>
      </div>
      <CredentialSignerIndicator />
      </div>

      {/* Step indicator */}
      <div className={styles.steps} aria-label="Issuance progress">
        {STEPS.map(({ label, icon: Icon }, i) => {
          const done   = step > i;
          const active = step === i;
          return (
            <div key={i} className={styles.step} aria-current={active ? "step" : undefined}>
              <div className={`flex w-full items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                done   ? "bg-[#E9DAB8] text-[#B98A28]"
                : active ? "bg-[#B98A28] text-white"
                : "bg-[#EAF2FB] text-[#4A5A68]"
              }`}>
                <Icon size={13} />
                <span className="hidden sm:block">{i + 1}. {label}</span>
                <span className="sm:hidden">{i + 1}</span>
              </div>
            </div>
          );
        })}
      </div>

      <FeedbackToast message={error} tone={/cancelled|canceled|rejected the request/i.test(error) ? "info" : "error"} title={/cancelled|canceled|rejected the request/i.test(error) ? "Wallet request cancelled" : step === 0 ? "Student details need attention" : "Credential issuance failed"} />
      <FeedbackToast tone="success" message={!error && !uploadError ? feedback : ""} title="Issuance progress saved" />

      <div className="bg-white rounded-xl border border-[#E4E1D6] p-4">
        {resumeLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-[#4A5A68] text-sm">
            <Loader2 className="animate-spin" size={20} /> Opening certificate draft…
          </div>
        ) : <>

        {/* ── Step 0: Student details ── */}
        {step === 0 && (
          <form onSubmit={handleCreate} className="flex flex-col gap-5">
            <div>
              <h3 className="text-[#08283F] font-semibold text-base">Student & Degree Details</h3>
              <p className="text-[#4A5A68] text-sm mt-0.5">
                These details are stored in the metadata anchored on-chain and used for verification.
              </p>
            </div>
            {catalogLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin text-[#08283F]" size={22} /></div>
            ) : !catalogReady ? (
              <div className="bg-[#EAF2FB] rounded-xl px-4 py-4 text-sm text-[#4A5A68]">
                No departments yet. Add one in{" "}
                <Link href="/dashboard/settings" className="text-[#B98A28] font-semibold hover:underline">Settings → Academic Structure</Link>.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <StudentNameInput value={form.student_name} onChange={(value, parts) => setForm(previous => ({ ...previous, student_name: value, student_name_parts: parts }))} />
                </div>
                <div>
                  <label className="cd-label">Student email *</label>
                  <GraduateEmailInput value={form.student_email} onChange={value => upd("student_email", value)} domain={emailDomain} studentName={form.student_name} nameParts={form.student_name_parts} />
                </div>
                <div>
                  <label className="cd-label">Department *</label>
                  <select className="cd-input" required value={form.department_id}
                    onChange={e => upd("department_id", e.target.value)}>
                    <option value="">Select department…</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="cd-label">Degree title *</label>
                  <select className="cd-input" required value={form.program_id}
                    disabled={!form.department_id} onChange={e => upd("program_id", e.target.value)}>
                    <option value="">{!form.department_id ? "Select a department first…" : "Select program…"}</option>
                    {programs.map(p => <option key={p.id} value={p.id}>{p.full_title || p.title}</option>)}
                  </select>
                </div>
                <div>
                  <label className="cd-label">Graduation year *</label>
                  <input type="number" min={1900} max={new Date().getFullYear()} step={1} className="cd-input" required
                    value={form.graduation_year}
                    onChange={e => upd("graduation_year", e.target.value === "" ? "" : Number(e.target.value))}
                    />
                </div>
                <div>
                  <label className="cd-label">
                    Grade / Classification{grades.length > 0 ? " *" : ""}
                  </label>
                  <select className="cd-input" required={grades.length > 0}
                    value={form.grade_classification_id}
                    onChange={e => upd("grade_classification_id", e.target.value)}>
                    <option value="">
                      {grades.length > 0 ? "Select a classification…" : "No classifications configured"}
                    </option>
                    {grades.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
                  </select>
                  {grades.length === 0 ? (
                    <p className="text-[11px] text-[#4A5A68] mt-1">
                      This institution has no classifications configured, so the credential
                      will be issued without one. Add them in{" "}
                      <Link href="/dashboard/settings" className="text-[#B98A28] font-semibold hover:underline">
                        Settings → Academic Structure
                      </Link>.
                    </p>
                  ) : (
                    <p className="text-[11px] text-[#4A5A68] mt-1">
                      Recorded on the credential and used for verification.
                    </p>
                  )}
                </div>
              </div>
            )}
            <NavigationButton type="submit" disabled={busy || catalogLoading || !catalogReady || !form.program_id || needsGrade}
              className="cd-btn-primary self-start mt-1 disabled:opacity-60"
              title={needsGrade ? "Select a grade or classification before continuing." : undefined}
              style={{ background: "#B98A28" }}>
              {busy && <Loader2 size={15} className="animate-spin" />}
              {busy ? "Creating…" : "Continue to upload →"}
            </NavigationButton>
          </form>
        )}

        {/* ── Step 1: Upload PDF(s) ── */}
        {step === 1 && preparedResume && anchorData && (
          <section className="flex flex-col gap-5" aria-label="Review prepared upload">
            <div><h3 className="text-base font-semibold text-[#08283F]">Upload &amp; Review</h3><p className="mt-2 text-sm text-[#4A5A68]">This student and award already have a prepared credential. The saved documents are shown below so you can review them before signing. Prepared document hashes are fixed; continuing reuses this record.</p></div>
            <CredentialDocumentPreview id={certId} kind="certificate" progress={false} />
            {(anchorData.transcript_hash || anchorData.ipfs_cid_transcript) && <CredentialDocumentPreview id={certId} kind="transcript" progress={false} />}
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={preparedReviewAccepted} onChange={event => setPreparedReviewAccepted(event.target.checked)} />I have reviewed the saved documents and want to continue with this credential.</label>
            <button type="button" className="cd-btn-primary self-start disabled:opacity-50" disabled={!preparedReviewAccepted || busy} onClick={() => { setError(""); setStep(2); }}>Continue to Sign On-Chain</button>
          </section>
        )}
        {step === 1 && !preparedResume && (
          <div className={`${styles.uploadStep} flex flex-col`}>
            <div className={styles.heading}>
              <span className={styles.eyebrow}>DOCUMENT REVIEW · STEP 2 OF 4</span>
              <h3 className="text-[#08283F] font-semibold text-base">
                {flowType === "full_upload" ? "Prepare the credential documents" : "Prepare the signed certificate"}
              </h3>
              <p className="text-[#4A5A68] text-sm mt-0.5">
                {flowType === "full_upload"
                  ? "Add the certificate and transcript, compare them with the student record, then confirm each review. Your draft is saved as you work."
                  : "Add the signed certificate, compare it with the student record, then confirm your review. Your draft is saved as you work."
                }
              </p>
            </div>

            {/* Certificate ID display */}
            <div className={styles.reference}>
              <FileText size={16} className="text-[#08283F] shrink-0" />
              <div className="min-w-0">
                <p className="text-[#8A929C] text-xs">Certificate ID</p>
                <p className="text-[#08283F] font-mono text-sm font-semibold">{cert?.certificate_id}</p>
              </div>
            </div>

            {/* What the documents are being checked against. Without this the
                Registrar is looking at a PDF and a set of extracted values with no
                visible record to compare them to, and the comparison table only
                appears after the analysis has already been run — by which point the
                decision is being made rather than informed. Read from the saved
                record, not from the form, so it is what the backend will compare
                against. */}
            <div className={styles.studentRecord}>
              <div className="flex items-start gap-2 mb-2.5">
                <User size={15} className="text-[#4A5A68] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[#08283F] text-sm font-semibold">
                    Student record
                  </p>
                  <p className="text-[12px] text-[#4A5A68] leading-relaxed">
                    Compare both documents against these saved details.
                  </p>
                </div>
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-2 text-[13px]">
                {[
                  ["Student name",    form.student_name],
                  ["Student email",   form.student_email],
                  ["Award / degree",  recordAward],
                  ["Department",      recordDepartment],
                  ["Classification",  recordGrade || "None recorded"],
                  ["Graduation year", form.graduation_year],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-[11px] uppercase tracking-wide text-[#8A929C]">{label}</dt>
                    <dd className="text-[#08283F] font-medium break-words">
                      {value || <span className="text-[#8A929C] font-normal">—</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* A reopened draft: say where the Registrar got to, so the restored
                files and decisions below are not a surprise. */}
            <FeedbackToast tone="info" title="Draft reopened" message={restoredSummary ? [
              `Student details for ${restoredSummary.student_name} restored.`,
              restoredSummary.hasCertificate ? "Certificate PDF restored." : "",
              restoredSummary.hasTranscript ? "Transcript PDF restored." : "",
              restoredSummary.decided ? `${restoredSummary.decided} document review decisions restored.` : "",
            ].filter(Boolean).join("\n") : ""} />

            <details className={styles.guidance}>
              <summary>Document requirements & scan guidance <span>PDF, JPEG or PNG · up to 20 MB per document</span></summary>
              <div>
              Upload a PDF or choose JPEG/PNG scan pages in reading order. Pages are combined into one PDF per document; review the page order and rotate sideways scans before analysis. Enter a page number to rotate just that page, or leave it blank to rotate all pages. Include every transcript page and the grading key when applicable. Replacing or rotating a document clears its previous review.
              <p className="mt-2">Use clear, upright scans with the complete page visible. Covered names, glare, faint text, or missing identity details require a replacement or a documented Registrar decision. Course years and signature dates are not automatically graduation years. Check visible seals and signatures yourself.</p>
              <p className="mt-2">Confirm your review before anchoring. Anchored documents cannot be replaced.</p>
              </div>
            </details>

            <div className="grid gap-4">
              <DocumentReadingOverview label="Certificate" review={certReview} />
              {flowType === "full_upload" && <DocumentReadingOverview label="Transcript" review={transcriptReview} />}
            </div>
            <div className={!certPdfFile && !transcriptPdfFile && flowType === "full_upload" ? styles.documentGrid : styles.documentStack}>
            <DocumentWorkbench
              label="Certificate document"
              scanUpload
              onRotate={page => prepareSelection([certPdfFile], "certificate", 90, page)}
              required
              tint="#B98A28"
              inputId="cert-pdf-upload"
              inputRef={certFileInputRef}
              onPick={handleCertFileChange}
              file={certPdfFile}
              preview={certPdfPreview}
                onClear={clearCertFile}
                onReplace={replaceCertFile}
                saving={busy || Boolean(savingKind)}
                saveError={saveError}
                kind="certificate"
              >
              {certPdfFile ? (
                <DocumentReviewPanel
                  disabled={Boolean(savingKind)}
                  showOverview={false}
                  key={`certificate-${certPdfFile.name}-${certPdfFile.size}-${certPdfFile.lastModified}`}
                  certId={certId}
                  kind="certificate"
                  file={certPdfFile}
                  review={certReview}
                  expectations={{
                    // Only the two values the Registrar actually typed. The award
                    // comes from the selected programme and the institution from
                    // their own account; both are already on the created record, so
                    // sending empty overrides would only discard the real values.
                    student_name:    form.student_name,
                    graduation_year: form.graduation_year,
                  }}
                  onChange={setCertReview}
                />
              ) : (
                <p className="text-[13px] leading-relaxed text-[#4A5A68]">
                  Check the student name, award, graduation year and all required signatures before confirming the certificate.
                </p>
              )}
            </DocumentWorkbench>

            {flowType === "full_upload" && (
              <DocumentWorkbench
                label="Transcript document"
                scanUpload
                onRotate={page => prepareSelection([transcriptPdfFile], "transcript", 90, page)}
                required
                tint="#2F6F4E"
                inputId="transcript-pdf-upload"
                inputRef={transcriptFileInputRef}
                onPick={handleTranscriptFileChange}
                file={transcriptPdfFile}
                preview={transcriptPdfPreview}
                onClear={clearTranscriptFile}
                onReplace={replaceTranscriptFile}
                saving={busy || Boolean(savingKind)}
                saveError={saveError}
                kind="transcript"
              >
                {transcriptPdfFile ? (
                  <DocumentReviewPanel
                    disabled={Boolean(savingKind)}
                  showOverview={false}
                    key={`transcript-${transcriptPdfFile.name}-${transcriptPdfFile.size}-${transcriptPdfFile.lastModified}`}
                    certId={certId}
                    kind="transcript"
                    file={transcriptPdfFile}
                    review={transcriptReview}
                    expectations={{
                      student_name:    form.student_name,
                      graduation_year: form.graduation_year,
                    }}
                    onChange={setTranscriptReview}
                  />
                ) : (
                  <p className="text-[13px] leading-relaxed text-[#4A5A68]">
                    Include every transcript page and the grading key. Check the student details and classification against the saved record.
                  </p>
                )}
              </DocumentWorkbench>
            )}

            </div>
            <div className={`${styles.actions} flex flex-wrap gap-3`}>
              <button
                onClick={handleUpload}
                disabled={busy || Boolean(savingKind) || !documentsReviewed}
                title={documentsReviewed ? undefined : "Check each document against the record and clear the result first"}
                className="cd-btn-primary disabled:opacity-60"
                style={{ background: "#B98A28" }}>
                {busy
                  ? <><Loader2 size={15} className="animate-spin" /> Uploading & hashing…</>
                  : <><Upload size={15} /> Upload & Anchor</>}
              </button>
              {/* Back keeps the documents. They are saved to the draft, and
                  clearing them here would throw away work the Registrar only
                  meant to look up a detail for. */}
              <NavigationButton direction="back"
                onClick={() => { setStep(0); setError(""); }}
                className="cd-btn-secondary"
              >← Back to details</NavigationButton>

              <div className="ml-auto">
                {confirmAbandon ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12px] font-semibold text-[#A23B34]">
                      Delete this draft and its documents?
                    </span>
                    <DeleteButton
                      type="button"
                      onClick={handleAbandon}
                      disabled={busy}
                      
                    >
                      {busy ? "Discarding..." : "Yes, discard it"}
                    </DeleteButton>
                    <button
                      type="button"
                      onClick={() => setConfirmAbandon(false)}
                      className="cd-btn-secondary"
                    >Keep it</button>
                  </div>
                ) : (
                  <DeleteButton
                    type="button"
                    onClick={() => setConfirmAbandon(true)}
                    
                  >
                     Discard draft
                  </DeleteButton>
                )}
              </div>
            </div>

            {confirmAbandon && (
              <p className="text-[#8A929C] text-xs">
                This cannot be undone. Nothing was submitted on-chain, so no officer
                has seen this certificate, but the draft and any documents saved to
                it will be removed.
              </p>
            )}

            {documentsSelected && !documentsReviewed && (
              <p className="text-[#A9721F] text-xs font-semibold">
                Read each document above and record your decision before uploading.
                A credential cannot be submitted on-chain until its documents have
                been checked against this record.
              </p>
            )}

            <p className="text-[#8A929C] text-xs">
              {flowType === "full_upload"
                ? "Both PDFs are hashed (SHA-256) and pinned to IPFS via Pinata when you anchor. The hashes are then anchored on the Ethereum blockchain."
                : "The PDF is hashed (SHA-256) and pinned to IPFS via Pinata when you anchor. The hash is then anchored on the Ethereum blockchain."
              }
            </p>
          </div>
        )}

        {/* ── Step 2: Sign on-chain ── */}
        {step === 2 && anchorData && (
          <div className="flex flex-col gap-5">
            <div>
              <h3 className="text-[#08283F] font-semibold text-base">Submit for Approval</h3>
              <p className="text-[#4A5A68] text-sm mt-0.5">
                Documents pinned. Sign{" "}
                <code className="font-mono text-xs bg-[#EAF2FB] px-1 rounded">
                  {anchorData.transcript_hash ? "submitCredentialForApproval" : "submitDocumentForApproval"}
                </code>{" "}
                with MetaMask to put these hashes on-chain for VC and Chancellor approval. They will review exactly these documents.
              </p>
            </div>

            <WalletSigningControls signing={busy} onSign={handleSign} />

            {/* Summary */}
            <div className="bg-white rounded-xl border border-[#E4E1D6] divide-y divide-[#E4E1D6]">
              {[
                ["Certificate ID", anchorData.certificate_id],
                ["Data hash",      anchorData.cert_hash],
                ["Document hash",  anchorData.doc_hash],
                ...(anchorData.transcript_hash
                  ? [["Transcript hash", anchorData.transcript_hash]]
                  : []),
                ["IPFS (PDF)",     anchorData.ipfs_cid_pdf],
                ["IPFS (JSON)",    anchorData.ipfs_cid_json],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start gap-4 px-4 py-3">
                  <span className="text-[#8A929C] text-xs w-32 shrink-0 pt-0.5">{label}</span>
                  <span className="font-mono text-[#08283F] text-xs break-all">{value}</span>
                </div>
              ))}
            </div>


          </div>
        )}

        {/* ── Step 3: Confirm ── */}
        {step === 3 && (
          <div className="flex flex-col gap-5">
            <div>
              <h3 className="text-[#08283F] font-semibold text-base">Confirm Submission</h3>
              <p className="text-[#4A5A68] text-sm mt-0.5">Transaction signed. Recording the submission in Intelligent Academic Credentialing. The certificate will now be pending VC approval.</p>
            </div>
            <div className="bg-white rounded-xl border border-[#E4E1D6] divide-y divide-[#E4E1D6]">
              {[["Tx hash", txHash], ["Block", blockNum ? `#${blockNum}` : "—"]].map(([label, value]) => (
                <div key={label} className="flex items-center gap-4 px-4 py-3">
                  <span className="text-[#8A929C] text-xs w-20 shrink-0">{label}</span>
                  <span className="font-mono text-[#08283F] text-xs break-all">{value}</span>
                </div>
              ))}
            </div>
            <button onClick={handleConfirm} disabled={busy} className="cd-btn-primary self-start disabled:opacity-60"
              style={{ background: "#2F6F4E" }}>
              {busy && <Loader2 size={15} className="animate-spin" />}
              {busy ? "Saving…" : "Confirm & Send to VC →"}
            </button>
          </div>
        )}

        {/* ── Step 4: Done ── */}
        {step === 4 && (
          <div className="flex flex-col items-center gap-5 py-4 text-center">
            <div className="w-14 h-14 rounded-full bg-[#E9DAB8] flex items-center justify-center">
              <CheckCircle2 size={32} className="text-[#B98A28]" />
            </div>
            <div>
              <h3 className="text-[#08283F] font-bold text-xl mb-2">Submitted for Approval</h3>
              <p className="text-[#4A5A68] text-sm leading-relaxed max-w-md">
                The certificate has been submitted on-chain. The VC and Chancellor can review the documents and record their approvals through MetaMask. The registrar will finalize the document hashes on-chain after both approvals.
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-sm">
              {txHash && <div className="flex items-center gap-2 bg-[#F8F7F2] border border-[#E4E1D6] px-4 py-3 rounded-xl">
                <ShieldCheck size={14} className="text-[#B98A28] shrink-0" />
                <span className="font-mono text-[#08283F] text-xs break-all">{txHash}</span>
              </div>}
            </div>
            <div className="flex gap-3 mt-2">
              <Link href="/dashboard/certificates" className="cd-btn-primary">View All Certificates</Link>
              <ActionButton onClick={resetAll} className="cd-btn-secondary">Issue Another</ActionButton>
            </div>
          </div>
        )}
        </>}
      </div>
      <CertLoaderOverlay variant="finalize" open={finalizing} />
    </div>
  );
}
