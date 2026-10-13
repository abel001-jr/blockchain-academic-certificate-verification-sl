"use client";
import DocumentReadingOverview from "@/components/DocumentReadingOverview";
import DashboardTooltip from "@/components/dashboard/DashboardTooltip";
import StudentNameInput from "@/components/StudentNameInput";
import NavigationButton from "@/components/ui/NavigationButton";

import { ActionButton } from "@/components/ui/AnimatedControls";

/**
 * Flow A — System Designed
 * Student details → Preview → Transcript → Hash & Submit → Sign On-Chain → Complete
 *
 * The transcript step exists because this credential is one student record made
 * of two documents, and `prepare/` — the step that hands the record to the VC and
 * Chancellor — refuses to run without one. Flow 1 already attaches and reviews a
 * transcript this way; the same endpoints and the same review panel are reused
 * here, so both flows behave identically once a document is involved.
 *
 * Only the transcript is checked. The certificate is rendered from the intake
 * record typed on step 0, so re-reading it could only ever agree with itself.
 * The transcript is authored by the institution's records office and is not
 * derived from anything typed here, which is what makes comparing it against
 * this credential a real check: a transcript naming a different student, award
 * or year is exactly the mistake worth catching before the officers sign.
 */

import { useState, useEffect, useRef } from "react";
import {
  ArrowLeft, CheckCircle2, Loader2, FileText,
  Wallet, ShieldCheck, Eye, User,
} from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import GraduateEmailInput from "@/components/GraduateEmailInput";
import CredentialSignerIndicator from "@/components/CredentialSignerIndicator";
import { useAuth } from "@/lib/useAuth";
import { submitForSealedReviewOnChain } from "@/lib/walletActions";
import CertificatePreview from "@/components/dashboard/CertificatePreview";
import styles from "./ExternalUploadFlow.module.css";
import { restoreDraftForm } from "@/lib/restoreDraftForm.mjs";
import CertLoaderOverlay from "@/components/dashboard/CertLoaderOverlay";
import DocumentReviewPanel from "@/components/DocumentReviewPanel";
import { authHeaders, DocumentWorkbench, fetchDraftDocument } from "./ExternalUploadFlow";

const STEPS = [
  { label: "Student Details", icon: User },
  { label: "Preview",         icon: Eye },
  { label: "Transcript",      icon: FileText },
  { label: "Hash & Submit",   icon: ShieldCheck },
  { label: "Sign On-Chain",   icon: Wallet },
  { label: "Complete",        icon: CheckCircle2 },
];

// Multipart cannot go through `api`, which always sends JSON.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000/api";

export default function SystemDesignedFlow({ onBack, draftId = null }) {
  const { user } = useAuth();

  const [step,     setStep]     = useState(0);
  const [certId,   setCertId]   = useState(null);
  const [cert,     setCert]     = useState(null);
  const [certData, setCertData] = useState(null);
  const [branding, setBranding] = useState(null);
  const [txHash,   setTxHash]   = useState("");
  const [blockNum, setBlockNum] = useState(null);
  const [previewStatus, setPreviewStatus] = useState("loading");
  const [busy,       setBusy]       = useState(false);
  const [finalizing, setFinalizing] = useState(false);
const [resumeLoading, setResumeLoading] = useState(Boolean(draftId));
  const [error,    setError]    = useState("");

  // The transcript half of the pair. Held here from the moment it is picked so
  // the review panel has bytes to analyse, and re-read from the draft on resume
  // so returning to a draft does not make the Registrar choose it again.
  const [transcriptFile,    setTranscriptFile]    = useState(null);
  const [transcriptPreview, setTranscriptPreview] = useState("");
  const [transcriptReview,  setTranscriptReview]  = useState(null);
  const transcriptInputRef  = useRef(null);

  // A review only counts once it is resolved, not rejected, and applies to the
  // file currently on screen. The backend re-checks the last part by hash, so
  // this is only here to avoid offering a button the server will refuse.
  const transcriptCleared = Boolean(
    transcriptReview?.is_resolved && !transcriptReview?.is_rejected,
  );

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCatalogLoading(true);
      try {
        const [d, g, b] = await Promise.all([
          api.get(`/catalog/departments/${draftId ? "?include_inactive=1" : ""}`),
          api.get(`/catalog/grades/${draftId ? "?include_inactive=1" : ""}`),
          api.get("/certificate-branding/"),
        ]);
        if (!cancelled) {
          setDepartments(d.results ?? d);
          setGrades(g.results ?? g);
          setBranding(b);
        }
      } catch {
        if (!cancelled) setError("Failed to load catalog or branding.");
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [draftId]);

  useEffect(() => {
    if (!form.department_id) {
      // Deferred rather than set inline: clearing a select synchronously inside
      // the effect cascades a render before the effect finishes. ExternalUploadFlow
      // resolves this the same way.
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

  // Continue an existing draft from its preview instead of creating a second
  // certificate when the registrar returns from the certificate details page.
  useEffect(() => {
    if (!draftId) return;
    let cancelled = false;

    (async () => {
      try {
        const data = await api.get(`/certificates/${draftId}/`);
        if (data.flow_type !== "system_designed" || data.status !== "draft") {
          throw new Error("This certificate is not an editable Intelligent Academic Credentialing design draft.");
        }
        const [departmentData, programData, gradeData] = await Promise.all([
          api.get("/catalog/departments/?include_inactive=1"),
          api.get("/catalog/programs/?include_inactive=1"),
          api.get("/catalog/grades/?include_inactive=1"),
        ]);
        if (!cancelled) {
          setCertId(data.id);
          setCert(data);
          setForm(restoreDraftForm(data, departmentData.results ?? departmentData, programData.results ?? programData, gradeData.results ?? gradeData));
          // A transcript already saved against this draft comes back with it, so
          // reopening a draft does not discard the choice or force a re-upload.
          // It may have been saved without ever being analysed, in which case the
          // file returns and the review stays absent — the gate below is what
          // decides whether the draft is ready, not this restore.
          try {
            const savedTranscript = await fetchDraftDocument(data.id, "transcript");
            if (!cancelled && savedTranscript) {
              setTranscriptFile(savedTranscript);
              setTranscriptPreview(URL.createObjectURL(savedTranscript));
              setTranscriptReview((data.document_reviews?.reviews || (Array.isArray(data.document_reviews) ? data.document_reviews : [])).find(
                r => r.document_kind === "transcript",
              ) || null);
              setStep(1);
            } else if (!cancelled) {
              setStep(1);
            }
          } catch {
            if (!cancelled) setStep(1);
          }
        }
      } catch (e) {
        if (!cancelled) setError(e?.detail || e?.message || "Unable to open this certificate draft.");
      } finally {
        if (!cancelled) setResumeLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [draftId]);

  function upd(field, val) {
    setForm(prev => {
      const next = { ...prev, [field]: val };
      if (field === "department_id") next.program_id = "";
      return next;
    });
  }

  function handleTranscriptChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are accepted.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("File must be under 20 MB.");
      return;
    }
    setError("");
    setTranscriptFile(file);
    setTranscriptPreview(URL.createObjectURL(file));
    // A new file invalidates the previous decision. The backend would catch this
    // by hash, but leaving a cleared review beside an unread file is exactly the
    // misleading state the gate exists to prevent.
    setTranscriptReview(null);
  }

  function clearTranscript() {
    setTranscriptFile(null);
    setTranscriptPreview("");
    setTranscriptReview(null);
    if (transcriptInputRef.current) transcriptInputRef.current.value = "";
  }

  // Re-picking the same file has to raise a change event, so the input is reset
  // first — otherwise a Registrar who picks the wrong PDF and immediately wants
  // it back gets silence.
  function replaceTranscript() {
    if (transcriptInputRef.current) {
      transcriptInputRef.current.value = "";
      transcriptInputRef.current.click();
    }
  }

  // Attach the transcript, then prepare the record. Order matters: `prepare/`
  // rejects a record with no transcript, and it is the step that moves the
  // certificate out of DRAFT. Doing the attachment inside the same handler means
  // the reviewer never sees a half-committed state, and the certificate PDF is
  // only rendered once both halves are actually in place.
  async function handleAttachAndPrepare() {
    if (!transcriptFile) return;
    setBusy(true); setError("");
    try {
      const fd = new FormData();
      fd.append("transcript_file", transcriptFile);
      const res = await fetch(`${API_BASE}/certificates/${certId}/upload-transcript/`, {
        method: "POST",
        headers: authHeaders(),
        body: fd,
      });
      const attached = await res.json();
      if (!res.ok) {
        throw new Error(attached.detail || "The transcript could not be attached.");
      }
      setCert(attached);

      // `prepare/` re-checks the review against the transcript hash it just
      // stored, so a transcript that changed between review and upload is
      // refused here rather than anchored.
      const prepared = await api.post(`/certificates/${certId}/prepare/`, {});
      setCertData(prepared);
      setTranscriptFile(null);
      setTranscriptReview(null);
      setStep(3);
    } catch (e) {
      setError(e?.detail || e?.message || JSON.stringify(e));
    } finally { setBusy(false); }
  }

  const catalogReady    = departments.length > 0;
  const selectedDept    = departments.find(d => d.id === form.department_id);
  const selectedProg    = programs.find(p => p.id === form.program_id);
  const selectedGrade   = grades.find(g => g.id === form.grade_classification_id);

  const previewCert = cert || {
    student_name:       form.student_name || "—",
    degree_title:       selectedProg?.full_title || selectedProg?.title || "—",
    qualification_type: selectedProg?.qualification_type || "bachelors",
    department:         selectedDept?.name || "",
    grade:              selectedGrade?.label || "",
    graduation_year:    form.graduation_year,
    certificate_id:     "—",
    institution_name:   branding?.institution_name || user?.institution_name || "Institution",
    branding_preset:    branding?.preset || "classic_navy",
    registrar_signer_name: user?.full_name || [user?.first_name, user?.last_name].filter(Boolean).join(" ") || "Registrar",
    registrar_signed_at:   null,
    vc_approver_name:      "",
    chancellor_approver_name: "",
  };

  async function handleCreate(e) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const payload = {
        student_name:   form.student_name.trim(),
        student_email:  form.student_email.trim(),
        department_id:  form.department_id,
        program_id:     form.program_id,
        graduation_year: form.graduation_year,
        flow_type:      "system_designed",
      };
      if (form.grade_classification_id) payload.grade_classification_id = form.grade_classification_id;
      const data = await api.post("/certificates/", payload);
      setCertId(data.id); setCert(data); setStep(1);
    } catch (e) {
      setError(e?.student_name?.[0] || e?.graduation_year?.[0] || e?.program_id?.[0] || e?.department_id?.[0] || e?.detail || JSON.stringify(e));
    } finally { setBusy(false); }
  }

  async function handleSign() {
    setBusy(true); setFinalizing(true); setError("");
    try {
      const { hash, blockNumber } = await submitForSealedReviewOnChain(certData);
      setTxHash(hash); setBlockNum(blockNumber); setStep(4);
    } catch (e) {
      const msg = e?.data?.message || e?.reason || e?.shortMessage || e?.message || "";
      const match = msg.match(/execution reverted[:\s]*(.*)/i);
      setError(match?.[1]?.trim() || msg || "MetaMask transaction failed.");
    } finally {
      setBusy(false); setFinalizing(false);
    }
  }

  async function handleConfirm() {
    setBusy(true); setError("");
    try {
      await api.post(`/certificates/${certId}/confirm-chain/`, { tx_hash: txHash, block_number: blockNum });
      setStep(5);
    } catch (e) { setError(JSON.stringify(e)); }
    finally { setBusy(false); }
  }

  function resetAll() {
    setStep(0); setCertId(null); setCert(null); setCertData(null);
    setTxHash(""); setBlockNum(null); setError("");
    setTranscriptFile(null); setTranscriptPreview(""); setTranscriptReview(null);
    setForm({ student_name: "", student_email: "", department_id: "", program_id: "", grade_classification_id: "", graduation_year: new Date().getFullYear() });
  }

  return (
    <div className={`${styles.flow} flex flex-col gap-3 w-full`}>
      <div className={styles.topline}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <NavigationButton direction="back" onClick={onBack} className="p-2 rounded-lg hover:bg-[#EAF2FB] transition-colors text-[#4A5A68]">Back
          <ArrowLeft size={18} />
        </NavigationButton>
        <div>
          <h2 className="text-[#08283F] font-bold text-2xl">Design within Intelligent Academic Credentialing</h2>
          <p className="text-[#4A5A68] text-sm mt-0.5">Full dual-approval flow · system-generated PDF</p>
        </div>
      </div>
      <CredentialSignerIndicator />
      </div>

      {/* Step indicator */}
      <div className={styles.steps} style={{gridTemplateColumns: `repeat(${STEPS.length}, minmax(0, 1fr))`}} aria-label="Issuance progress">
        {STEPS.map(({ label, icon: Icon }, i) => {
          const done   = step > i;
          const active = step === i;
          return (
            <div key={i} className={styles.step} aria-current={active ? "step" : undefined}>
              <div className={`flex w-full items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                done   ? "bg-[#E7F1EB] text-[#2F6F4E]"
                : active ? "bg-[#08283F] text-white"
                : "bg-[#EAF2FB] text-[#4A5A68]"
              }`}>
                <Icon size={13} />
                <span className="hidden sm:block">{label}</span>
                <span className="sm:hidden">{i + 1}</span>
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="bg-[#F5E5E3] text-[#A23B34] text-sm px-4 py-3 rounded-lg flex items-start gap-2">
          <span className="shrink-0 mt-0.5">⚠</span>
          <span className="break-all">{error}</span>
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#E4E1D6] p-4">
        {resumeLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-[#4A5A68] text-sm">
            <Loader2 className="animate-spin" size={20} /> Opening certificate draft…
          </div>
        ) : <>

        {/* ── Step 0: Student details ── */}
        {step === 0 && (
          <form onSubmit={handleCreate} className="flex flex-col gap-5">
            <h3 className="text-[#08283F] font-semibold text-base">Student & Degree Details</h3>
            {catalogLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="animate-spin text-[#08283F]" size={22} />
              </div>
            ) : !catalogReady ? (
              <div className="bg-[#EAF2FB] rounded-xl px-4 py-4 text-sm text-[#4A5A68]">
                No departments yet. Add one in{" "}
                <Link href="/dashboard/settings" className="text-[#B98A28] font-semibold hover:underline">Settings → Academic Structure</Link>{" "}
                before issuing.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <StudentNameInput value={form.student_name} onChange={(value, parts) => setForm(previous => ({ ...previous, student_name: value, student_name_parts: parts }))} />
                </div>
                <div>
                  <label className="cd-label">Student email *</label>
                  <GraduateEmailInput value={form.student_email} onChange={value => upd("student_email", value)} domain={branding?.email_domain} studentName={form.student_name} nameParts={form.student_name_parts} />
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
                    disabled={!form.department_id}
                    onChange={e => upd("program_id", e.target.value)}>
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
                  <label className="cd-label">Grade / Classification</label>
                  <select className="cd-input" value={form.grade_classification_id}
                    onChange={e => upd("grade_classification_id", e.target.value)}>
                    <option value="">Optional…</option>
                    {grades.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
                  </select>
                </div>
              </div>
            )}
            <NavigationButton type="submit" disabled={busy || catalogLoading || !catalogReady || !form.program_id}
              className="cd-btn-primary self-start mt-1 disabled:opacity-60">
              {busy && <Loader2 size={15} className="animate-spin" />}
              {busy ? "Creating…" : "Continue to preview →"}
            </NavigationButton>
          </form>
        )}

        {/* ── Step 1: Preview ── */}
        {step === 1 && (
          <div className="flex flex-col gap-5">
            <div>
              <h3 className="text-[#08283F] font-semibold text-base">Certificate Preview</h3>
              <p className="text-[#4A5A68] text-sm mt-0.5">
                Generated from your catalog and{" "}
                <Link href="/dashboard/settings" className="text-[#B98A28] font-semibold hover:underline">branding settings</Link>.
                The final PDF is created after both approvals.
              </p>
            </div>
            <CertificatePreview
              onStatusChange={setPreviewStatus}
              certificate={previewCert}
              presetId={cert?.branding_preset || branding?.preset}
              logoUrl={cert?.logo_url || branding?.logo_url || ""}
              institutionName={cert?.institution_name || branding?.institution_name}
            />
            <div className="flex gap-3">
              <DashboardTooltip style={{ width: "auto" }} title={previewStatus === "ready" ? "Certificate ready" : previewStatus === "error" ? "Certificate generation failed" : "Certificate generation in progress"} detail={previewStatus === "ready" ? "Continue to upload and review the transcript." : previewStatus === "error" ? "Resolve the preview error before continuing." : "Please wait for certificate generation to complete before continuing."}><span tabIndex={previewStatus !== "ready" ? 0 : undefined}><NavigationButton disabled={previewStatus !== "ready"} onClick={() => { if (previewStatus !== "ready") return; setStep(2); setError(""); }} className="cd-btn-primary">
                Continue to transcript →
              </NavigationButton></span></DashboardTooltip>
              <NavigationButton direction="back" onClick={() => { setStep(0); setError(""); }} className="cd-btn-secondary">← Back</NavigationButton>
            </div>
          </div>
        )}

        {/* ── Step 2: Transcript ── */}
        {step === 2 && (
          <div className="flex flex-col gap-5">
            <div>
              <h3 className="text-[#08283F] font-semibold text-base">Student Transcript</h3>
              <p className="text-[#4A5A68] text-sm mt-0.5">
                This credential is one student record made of two documents, so the
                transcript is required before it can be submitted. It is checked
                against the certificate shown on the previous step — the two must
                describe the same student, award and year — and both are anchored
                together in one transaction.
              </p>
            </div>

            <DocumentReadingOverview label="Transcript" review={transcriptReview} />
            <DocumentWorkbench
              label="Transcript PDF"
              kind="transcript"
              required
              tint="#2F6F4E"
              inputId="sd-transcript-upload"
              inputRef={transcriptInputRef}
              onPick={handleTranscriptChange}
              file={transcriptFile}
              preview={transcriptPreview}
              onClear={clearTranscript}
              onReplace={replaceTranscript}
              saving={false}
              saveError={null}
            >
              {transcriptFile ? (
                <DocumentReviewPanel
                  showOverview={false}
                  certId={certId}
                  kind="transcript"
                  file={transcriptFile}
                  review={transcriptReview}
                  expectations={{
                    // The award and institution are not typed here — they come from
                    // the selected programme and the account — so only the two
                    // values the Registrar entered are sent as overrides.
                    student_name:    form.student_name,
                    graduation_year: form.graduation_year,
                  }}
                  onChange={setTranscriptReview}
                />
              ) : (
                <p className="text-[13px] leading-relaxed text-[#4A5A68]">
                  Choose the student&apos;s transcript and it will appear here, read
                  alongside its extracted fields so you can compare them against the
                  certificate before recording a decision.
                </p>
              )}
            </DocumentWorkbench>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleAttachAndPrepare}
                disabled={busy || !transcriptFile || !transcriptCleared}
                title={transcriptCleared ? undefined : "Check the transcript against the certificate and clear the result first"}
                className="cd-btn-primary disabled:opacity-60"
                style={{ background: "#2F6F4E" }}>
                {busy
                  ? <><Loader2 size={15} className="animate-spin" /> Anchoring…</>
                  : <><ShieldCheck size={15} /> Attach & Submit for Approval</>}
              </button>
              {/* Back keeps the transcript. Clearing it here would discard a
                  reviewed document the Registrar only stepped away from. */}
              <NavigationButton direction="back" onClick={() => { setStep(1); setError(""); }} className="cd-btn-secondary">
                ← Back to preview
              </NavigationButton>
            </div>
          </div>
        )}

        {/* ── Step 3: Hash & Sign ── */}
        {step === 3 && certData && (
          <div className="flex flex-col gap-5">
            <div>
              <h3 className="text-[#08283F] font-semibold text-base">Sign On-Chain Submission</h3>
              <p className="text-[#4A5A68] text-sm mt-0.5">
                Review copy rendered alongside the reviewed transcript. Sign{" "}
                <code className="font-mono text-xs bg-[#EAF2FB] px-1 rounded">submitForSealedReview</code>{" "}
                with MetaMask to put the review document&apos;s hash on-chain. The VC and Chancellor approve this exact copy; the
                issued copy, which adds the signature block, is sealed afterwards.
              </p>
            </div>
            <CertificatePreview
              certificate={previewCert}
              presetId={certData.branding_preset || branding?.preset}
              logoUrl={cert?.logo_url || branding?.logo_url || ""}
              institutionName={cert?.institution_name || branding?.institution_name}
            />
            <div className="bg-white rounded-xl border border-[#E4E1D6] divide-y divide-[#E4E1D6]">
              {[
                ["Certificate ID", certData.certificate_id],
                ["Data hash",      certData.cert_hash],
                ["Review copy hash", certData.doc_hash],
                // Shown so the Registrar can confirm both halves of the pair are
                // present before signing, rather than discovering it afterwards.
                ["Transcript hash", certData.transcript_hash || "—"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start gap-4 px-4 py-3">
                  <span className="text-[#8A929C] text-xs w-28 shrink-0 pt-0.5">{label}</span>
                  <span className="font-mono text-[#08283F] text-xs break-all">{value}</span>
                </div>
              ))}
            </div>
            <button onClick={handleSign} disabled={busy} className="cd-btn-primary self-start disabled:opacity-60">
              {busy ? <><Loader2 size={15} className="animate-spin" /> Waiting for MetaMask…</> : <><Wallet size={15} /> Sign submitForSealedReview</>}
            </button>
          </div>
        )}

        {/* ── Step 4: Confirm tx ── */}
        {step === 4 && (
          <div className="flex flex-col gap-5">
            <div>
              <h3 className="text-[#08283F] font-semibold text-base">Confirm On-Chain</h3>
              <p className="text-[#4A5A68] text-sm mt-0.5">Transaction signed. Recording in Intelligent Academic Credentialing.</p>
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
              {busy ? "Saving…" : "Confirm & Complete →"}
            </button>
          </div>
        )}

        {/* ── Step 5: Done ── */}
        {step === 5 && (
          <div className="flex flex-col items-center gap-5 py-4 text-center">
            <CheckCircle2 size={52} className="text-[#2F6F4E]" />
            <div>
              <h3 className="text-[#08283F] font-bold text-xl mb-2">Submitted for Dual Approval</h3>
              <p className="text-[#4A5A68] text-sm leading-relaxed max-w-md">
                VC and Chancellor will review the preview then approve with MetaMask.
                After both signatures, you finalize the PDF and issue on-chain.
              </p>
            </div>
            <div className="flex items-center gap-2 bg-[#F8F7F2] border border-[#E4E1D6] px-5 py-3 rounded-xl">
              <ShieldCheck size={14} className="text-[#2F6F4E]" />
              <span className="font-mono text-[#08283F] text-xs">{txHash}</span>
            </div>
            <div className="flex gap-3">
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
