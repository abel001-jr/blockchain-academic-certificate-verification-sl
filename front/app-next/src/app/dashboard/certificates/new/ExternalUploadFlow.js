"use client";
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
 *   4. Done → VC and Dean can now approve
 *
 * The document hashes go on-chain in step 2, before either officer signs. The
 * upload is already final, so there is nothing to render later; committing the
 * hashes now is what makes the officers' approval an approval of a document
 * rather than of an on-chain record whose docHash is still zero.
 */

import { useState, useEffect, useRef } from "react";
import {
  ArrowLeft, CheckCircle2, Loader2, Upload,
  Wallet, ShieldCheck, User, FileText, X,
} from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { capitalizeName } from "@/lib/formatName";
import CertLoaderOverlay from "@/components/dashboard/CertLoaderOverlay";
import { useAuth } from "@/lib/useAuth";
import { submitUploadedCredentialForApprovalOnChain } from "@/lib/walletActions";
import CertificateQrCard from "@/components/CertificateQrCard";

const STEPS = [
  { label: "Student Details", icon: User },
  { label: "Upload PDF",      icon: Upload },
  { label: "Sign On-Chain",   icon: Wallet },
  { label: "Complete",        icon: CheckCircle2 },
];

export default function ExternalUploadFlow({ onBack, flowType = "full_upload", draftId = null }) {
  const { user } = useAuth();

  const [step,        setStep]        = useState(0);
  const [certId,      setCertId]      = useState(null);
  const [cert,        setCert]        = useState(null);
  const [anchorData,  setAnchorData]  = useState(null); // returned by upload-and-anchor
  const [txHash,      setTxHash]      = useState("");
  const [blockNum,    setBlockNum]    = useState(null);
  const [busy,        setBusy]        = useState(false);
  const [finalizing,  setFinalizing]  = useState(false);
  const [resumeLoading, setResumeLoading] = useState(Boolean(draftId));
  const [error,       setError]       = useState("");

  // PDF file state - now supporting both certificate and transcript
  const [certPdfFile,       setCertPdfFile]       = useState(null);
  const [certPdfPreview,    setCertPdfPreview]    = useState("");
  const [transcriptPdfFile, setTranscriptPdfFile] = useState(null);
  const [transcriptPdfPreview, setTranscriptPdfPreview] = useState("");
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCatalogLoading(true);
      try {
        const [d, g] = await Promise.all([
          api.get("/catalog/departments/"),
          api.get("/catalog/grades/"),
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
  }, []);

  useEffect(() => {
    if (!form.department_id) { setPrograms([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const p = await api.get(`/catalog/programs/?department=${form.department_id}`);
        if (!cancelled) setPrograms(p.results ?? p);
      } catch {
        if (!cancelled) setPrograms([]);
      }
    })();
    return () => { cancelled = true; };
  }, [form.department_id]);

  // A draft already has its student and programme data. Resume at document
  // upload so leaving the workflow never creates a second certificate record.
  useEffect(() => {
    if (!draftId) return;
    let cancelled = false;

    (async () => {
      try {
        const data = await api.get(`/certificates/${draftId}/`);
        if (data.status !== "draft" || data.flow_type !== flowType) {
          throw new Error("This certificate is not an editable draft for this upload workflow.");
        }
        if (!cancelled) {
          setCertId(data.id);
          setCert(data);
          setStep(1);
        }
      } catch (e) {
        if (!cancelled) setError(e?.detail || e?.message || "Unable to open this certificate draft.");
      } finally {
        if (!cancelled) setResumeLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [draftId, flowType]);

  function upd(field, val) {
    setForm(prev => {
      const next = { ...prev, [field]: val };
      if (field === "department_id") next.program_id = "";
      return next;
    });
  }

  function handleCertFileChange(e) {
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
    setCertPdfFile(file);
    setCertPdfPreview(URL.createObjectURL(file));
  }

  function handleTranscriptFileChange(e) {
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
    setTranscriptPdfFile(file);
    setTranscriptPdfPreview(URL.createObjectURL(file));
  }

  function clearCertFile() {
    setCertPdfFile(null);
    setCertPdfPreview("");
    if (certFileInputRef.current) certFileInputRef.current.value = "";
  }

  function clearTranscriptFile() {
    setTranscriptPdfFile(null);
    setTranscriptPdfPreview("");
    if (transcriptFileInputRef.current) transcriptFileInputRef.current.value = "";
  }

  // ── Step 0: Create draft with flow_type from prop ──
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
        flow_type:      flowType, // Use the flowType passed from parent
      };
      if (form.grade_classification_id) payload.grade_classification_id = form.grade_classification_id;
      const data = await api.post("/certificates/", payload);
      setCertId(data.id); setCert(data); setStep(1);
    } catch (e) {
      setError(e?.program_id?.[0] || e?.department_id?.[0] || e?.detail || JSON.stringify(e));
    } finally { setBusy(false); }
  }

  // ── Step 1: Upload PDF(s) → hash + pin → pending_finalize ──
  async function handleUpload() {
    // For full_upload flow, require both files
    if (flowType === "full_upload") {
      if (!certPdfFile || !transcriptPdfFile) {
        setError("Please select both certificate and transcript PDFs to upload.");
        return;
      }
    } else {
      if (!certPdfFile) {
        setError("Please select a PDF to upload.");
        return;
      }
    }
    
    setBusy(true); setError("");
    try {
      const fd = new FormData();
      fd.append("document_file", certPdfFile);
      if (flowType === "full_upload" && transcriptPdfFile) {
        fd.append("transcript_file", transcriptPdfFile);
      }

      // Use raw fetch with Authorization header (api helper doesn't support FormData cleanly)
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000/api"}/certificates/${certId}/upload-and-anchor/`,
        {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || JSON.stringify(data));
      setAnchorData(data);
      // The hashes are fixed now, so they can go on-chain before officers review.
      setStep(2);
    } catch (e) {
      setError(e?.message || "Upload failed.");
    } finally { setBusy(false); }
  }

  // ── Step 2: MetaMask — commit the document hashes for review ──
  async function handleSign() {
    if (!anchorData) return;
    setBusy(true); setFinalizing(true); setError("");
    try {
      const { hash, blockNumber } =
        await submitUploadedCredentialForApprovalOnChain(anchorData);
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
    setBusy(true); setError("");
    try {
      await api.post(`/certificates/${certId}/confirm-chain/`, {
        tx_hash: txHash,
        block_number: blockNum,
      });
      setStep(4);
    } catch (e) {
      setError(e?.detail || JSON.stringify(e));
    } finally { setBusy(false); }
  }

  function resetAll() {
    setStep(0); setCertId(null); setCert(null); setAnchorData(null);
    setTxHash(""); setBlockNum(null); setError("");
    setCertPdfFile(null); setCertPdfPreview("");
    setTranscriptPdfFile(null); setTranscriptPdfPreview("");
    setForm({ student_name: "", student_email: "", department_id: "", program_id: "", grade_classification_id: "", graduation_year: new Date().getFullYear() });
  }

  const catalogReady = departments.length > 0;

  // Get flow-specific header text
  const getFlowTitle = () => {
    switch(flowType) {
      case "full_upload": return "Upload Both Certificate & Transcript";
      case "transcript_then_cert": return "Upload Certificate to Transcript";
      default: return "Upload Existing Certificate";
    }
  };

  const getFlowSubtitle = () => {
    switch(flowType) {
      case "full_upload": return "Upload both documents together → anchor hash on-chain";
      case "transcript_then_cert": return "Upload transcript first, certificate later → linked as one record";
      default: return "Upload signed PDF → anchor hash on-chain";
    }
  };

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-[#EAF2FB] transition-colors text-[#4A5A68]">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h2 className="text-[#08283F] font-bold text-2xl">{getFlowTitle()}</h2>
          <p className="text-[#4A5A68] text-sm mt-0.5">{getFlowSubtitle()}</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STEPS.map(({ label, icon: Icon }, i) => {
          const done   = step > i;
          const active = step === i;
          return (
            <div key={i} className="flex items-center gap-1 shrink-0">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                done   ? "bg-[#E9DAB8] text-[#B98A28]"
                : active ? "bg-[#B98A28] text-white"
                : "bg-[#EAF2FB] text-[#4A5A68]"
              }`}>
                <Icon size={13} />
                <span className="hidden sm:block">{label}</span>
                <span className="sm:hidden">{i + 1}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-4 h-px ${done ? "bg-[#B98A28]" : "bg-[#E4E1D6]"}`} />
              )}
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

      <div className="bg-white rounded-xl border border-[#E4E1D6] p-6">
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
                <div>
                  <label className="cd-label">Student full name *</label>
                  <input className="cd-input" required value={form.student_name}
                    onChange={e => upd("student_name", capitalizeName(e.target.value))} placeholder="e.g. Abel Morie Sam" />
                </div>
                <div>
                  <label className="cd-label">Student email *</label>
                  <input type="email" className="cd-input" required value={form.student_email}
                    onChange={e => upd("student_email", e.target.value)} placeholder="student@cusl.edu.sl" />
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
                    {programs.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                </div>
                <div>
                  <label className="cd-label">Graduation year *</label>
                  <input type="number" className="cd-input" required
                    value={form.graduation_year}
                    onChange={e => upd("graduation_year", parseInt(e.target.value))}
                    min={2000} max={2100} />
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
            <button type="submit" disabled={busy || catalogLoading || !catalogReady || !form.program_id}
              className="cd-btn-primary self-start mt-1 disabled:opacity-60"
              style={{ background: "#B98A28" }}>
              {busy && <Loader2 size={15} className="animate-spin" />}
              {busy ? "Creating…" : "Continue to upload →"}
            </button>
          </form>
        )}

        {/* ── Step 1: Upload PDF(s) ── */}
        {step === 1 && (
          <div className="flex flex-col gap-5">
            <div>
              <h3 className="text-[#08283F] font-semibold text-base">
                {flowType === "full_upload" ? "Upload Certificate & Transcript PDFs" : "Upload Signed Certificate PDF"}
              </h3>
              <p className="text-[#4A5A68] text-sm mt-0.5">
                {flowType === "full_upload" 
                  ? "Upload both the signed certificate and transcript. Credence will compute SHA-256 hashes and pin them to IPFS — no changes can be made after this step."
                  : "Upload the final, signed certificate. Credence will compute its SHA-256 hash and pin it to IPFS — no changes can be made after this step."
                }
              </p>
            </div>

            {/* Certificate ID display */}
            <div className="flex items-center gap-3 bg-[#F8F7F2] border border-[#E4E1D6] rounded-xl px-4 py-3">
              <FileText size={16} className="text-[#08283F] shrink-0" />
              <div>
                <p className="text-[#8A929C] text-xs">Certificate ID</p>
                <p className="text-[#08283F] font-mono text-sm font-semibold">{cert?.certificate_id}</p>
              </div>
            </div>

            {/* Certificate Upload */}
            <div className="flex flex-col gap-2">
              <label className="text-[#08283F] text-sm font-semibold">Certificate PDF *</label>
              {!certPdfFile ? (
                <label
                  htmlFor="cert-pdf-upload"
                  className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-[#E4E1D6] rounded-xl p-8 cursor-pointer hover:border-[#B98A28] hover:bg-[#F5EBDB]/20 transition-all text-center"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#B98A28]/10 flex items-center justify-center">
                    <Upload size={18} className="text-[#B98A28]" />
                  </div>
                  <div>
                    <p className="text-[#08283F] font-semibold text-sm">Click to upload certificate</p>
                    <p className="text-[#8A929C] text-xs mt-1">PDF only · max 20 MB</p>
                  </div>
                  <input
                    id="cert-pdf-upload"
                    ref={certFileInputRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    onChange={handleCertFileChange}
                  />
                </label>
              ) : (
                <div className="border border-[#E4E1D6] rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-[#F8F7F2]">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-[#B98A28]/10 flex items-center justify-center shrink-0">
                        <FileText size={16} className="text-[#B98A28]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[#08283F] text-sm font-semibold truncate">{certPdfFile.name}</p>
                        <p className="text-[#8A929C] text-xs">{(certPdfFile.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>
                    <button type="button" onClick={clearCertFile}
                      className="p-1.5 rounded-lg hover:bg-[#F5E5E3] text-[#A23B34] transition-colors ml-3 shrink-0">
                      <X size={15} />
                    </button>
                  </div>
                  <iframe
                    src={certPdfPreview}
                    title="Certificate preview"
                    className="w-full"
                    style={{ height: "400px" }}
                  />
                </div>
              )}
            </div>

            {/* Transcript Upload - Only for full_upload flow */}
            {flowType === "full_upload" && (
              <div className="flex flex-col gap-2">
                <label className="text-[#08283F] text-sm font-semibold">Transcript PDF *</label>
                {!transcriptPdfFile ? (
                  <label
                    htmlFor="transcript-pdf-upload"
                    className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-[#E4E1D6] rounded-xl p-8 cursor-pointer hover:border-[#2F6F4E] hover:bg-[#E7F1EB]/30 transition-all text-center"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#2F6F4E]/10 flex items-center justify-center">
                      <Upload size={18} className="text-[#2F6F4E]" />
                    </div>
                    <div>
                      <p className="text-[#08283F] font-semibold text-sm">Click to upload transcript</p>
                      <p className="text-[#8A929C] text-xs mt-1">PDF only · max 20 MB</p>
                    </div>
                    <input
                      id="transcript-pdf-upload"
                      ref={transcriptFileInputRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      onChange={handleTranscriptFileChange}
                    />
                  </label>
                ) : (
                  <div className="border border-[#E4E1D6] rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-[#F8F7F2]">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-[#2F6F4E]/10 flex items-center justify-center shrink-0">
                          <FileText size={16} className="text-[#2F6F4E]" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[#08283F] text-sm font-semibold truncate">{transcriptPdfFile.name}</p>
                          <p className="text-[#8A929C] text-xs">{(transcriptPdfFile.size / 1024).toFixed(1)} KB</p>
                        </div>
                      </div>
                      <button type="button" onClick={clearTranscriptFile}
                        className="p-1.5 rounded-lg hover:bg-[#F5E5E3] text-[#A23B34] transition-colors ml-3 shrink-0">
                        <X size={15} />
                      </button>
                    </div>
                    <iframe
                      src={transcriptPdfPreview}
                      title="Transcript preview"
                      className="w-full"
                      style={{ height: "400px" }}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button 
                onClick={handleUpload} 
                disabled={busy || !certPdfFile || (flowType === "full_upload" && !transcriptPdfFile)}
                className="cd-btn-primary disabled:opacity-60"
                style={{ background: "#B98A28" }}>
                {busy
                  ? <><Loader2 size={15} className="animate-spin" /> Uploading & hashing…</>
                  : <><Upload size={15} /> Upload & Anchor</>}
              </button>
              <button onClick={() => { setStep(0); setError(""); clearCertFile(); clearTranscriptFile(); }}
                className="cd-btn-secondary">← Back</button>
            </div>

            <p className="text-[#8A929C] text-xs">
              {flowType === "full_upload"
                ? "Both PDFs are hashed (SHA-256) and pinned to IPFS via Pinata. The hashes are then anchored on the Ethereum blockchain."
                : "The PDF is hashed (SHA-256) and pinned to IPFS via Pinata. The hash is then anchored on the Ethereum blockchain."
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
                with MetaMask to put these hashes on-chain for VC and Dean approval. They will review exactly these documents.
              </p>
            </div>

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

            <button onClick={handleSign} disabled={busy} className="cd-btn-primary self-start disabled:opacity-60"
              style={{ background: "#B98A28" }}>
              {busy
                ? <><Loader2 size={15} className="animate-spin" /> Waiting for MetaMask…</>
                : <><Wallet size={15} /> Submit for Approval</>}
            </button>
          </div>
        )}

        {/* ── Step 3: Confirm ── */}
        {step === 3 && (
          <div className="flex flex-col gap-5">
            <div>
              <h3 className="text-[#08283F] font-semibold text-base">Confirm Submission</h3>
              <p className="text-[#4A5A68] text-sm mt-0.5">Transaction signed. Recording the submission in Credence. The certificate will now be pending VC approval.</p>
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
                The certificate has been submitted on-chain. The VC and Dean can review the documents and record their approvals through MetaMask. The registrar will finalize the document hashes on-chain after both approvals.
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-sm">
              {txHash && <div className="flex items-center gap-2 bg-[#F8F7F2] border border-[#E4E1D6] px-4 py-3 rounded-xl">
                <ShieldCheck size={14} className="text-[#B98A28] shrink-0" />
                <span className="font-mono text-[#08283F] text-xs break-all">{txHash}</span>
              </div>}
              {anchorData?.ipfs_url_pdf && (
                <a href={anchorData.ipfs_url_pdf} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 bg-[#F8F7F2] border border-[#E4E1D6] px-4 py-3 rounded-xl text-[#B98A28] text-sm font-semibold hover:underline">
                  <FileText size={14} /> View on IPFS
                </a>
              )}
            </div>
            <div className="flex gap-3 mt-2">
              <Link href="/dashboard/certificates" className="cd-btn-primary">View All Certificates</Link>
              <button onClick={resetAll} className="cd-btn-secondary">Issue Another</button>
            </div>
          </div>
        )}
        </>}
      </div>
      <CertLoaderOverlay variant="finalize" open={finalizing} />
    </div>
  );
}
