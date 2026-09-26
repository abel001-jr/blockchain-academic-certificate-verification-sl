"use client";
/**
 * Flow A — System Designed
 * Student details → Preview → Hash & Submit → Sign On-Chain → Complete
 * Unchanged from original, just extracted as a component.
 */

import { useState, useEffect } from "react";
import {
  ArrowLeft, CheckCircle2, Loader2,
  Wallet, ShieldCheck, Eye, User,
} from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { capitalizeName } from "@/lib/formatName";
import { useAuth } from "@/lib/useAuth";
import { submitForSealedReviewOnChain } from "@/lib/walletActions";
import CertificatePreview from "@/components/dashboard/CertificatePreview";
import CertLoaderOverlay from "@/components/dashboard/CertLoaderOverlay";

const STEPS = [
  { label: "Student Details", icon: User },
  { label: "Preview",         icon: Eye },
  { label: "Hash & Submit",   icon: ShieldCheck },
  { label: "Sign On-Chain",   icon: Wallet },
  { label: "Complete",        icon: CheckCircle2 },
];

export default function SystemDesignedFlow({ onBack, draftId = null }) {
  const { user } = useAuth();

  const [step,     setStep]     = useState(0);
  const [certId,   setCertId]   = useState(null);
  const [cert,     setCert]     = useState(null);
  const [certData, setCertData] = useState(null);
  const [branding, setBranding] = useState(null);
  const [txHash,   setTxHash]   = useState("");
  const [blockNum, setBlockNum] = useState(null);
  const [busy,       setBusy]       = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [resumeLoading, setResumeLoading] = useState(Boolean(draftId));
  const [error,    setError]    = useState("");

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
          api.get("/catalog/departments/"),
          api.get("/catalog/grades/"),
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

  // Continue an existing draft from its preview instead of creating a second
  // certificate when the registrar returns from the certificate details page.
  useEffect(() => {
    if (!draftId) return;
    let cancelled = false;

    (async () => {
      try {
        const data = await api.get(`/certificates/${draftId}/`);
        if (data.flow_type !== "system_designed" || data.status !== "draft") {
          throw new Error("This certificate is not an editable Credence design draft.");
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
  }, [draftId]);

  function upd(field, val) {
    setForm(prev => {
      const next = { ...prev, [field]: val };
      if (field === "department_id") next.program_id = "";
      return next;
    });
  }

  const catalogReady    = departments.length > 0;
  const selectedDept    = departments.find(d => d.id === form.department_id);
  const selectedProg    = programs.find(p => p.id === form.program_id);
  const selectedGrade   = grades.find(g => g.id === form.grade_classification_id);

  const previewCert = cert || {
    student_name:       form.student_name || "—",
    degree_title:       selectedProg?.title || "—",
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
      setError(e?.program_id?.[0] || e?.department_id?.[0] || e?.detail || JSON.stringify(e));
    } finally { setBusy(false); }
  }

  async function handlePrepare() {
    setBusy(true); setError("");
    try {
      const data = await api.post(`/certificates/${certId}/prepare/`, {});
      setCertData(data); setStep(2);
    } catch (e) { setError(e.detail || JSON.stringify(e)); }
    finally { setBusy(false); }
  }

  async function handleSign() {
    setBusy(true); setFinalizing(true); setError("");
    try {
      const { hash, blockNumber } = await submitForSealedReviewOnChain(certData);
      setTxHash(hash); setBlockNum(blockNumber); setStep(3);
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
      setStep(4);
    } catch (e) { setError(JSON.stringify(e)); }
    finally { setBusy(false); }
  }

  function resetAll() {
    setStep(0); setCertId(null); setCert(null); setCertData(null);
    setTxHash(""); setBlockNum(null); setError("");
    setForm({ student_name: "", student_email: "", department_id: "", program_id: "", grade_classification_id: "", graduation_year: new Date().getFullYear() });
  }

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-[#EAF2FB] transition-colors text-[#4A5A68]">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h2 className="text-[#08283F] font-bold text-2xl">Design within Credence</h2>
          <p className="text-[#4A5A68] text-sm mt-0.5">Full dual-approval flow · system-generated PDF</p>
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
                done   ? "bg-[#E7F1EB] text-[#2F6F4E]"
                : active ? "bg-[#08283F] text-white"
                : "bg-[#EAF2FB] text-[#4A5A68]"
              }`}>
                <Icon size={13} />
                <span className="hidden sm:block">{label}</span>
                <span className="sm:hidden">{i + 1}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-4 h-px ${done ? "bg-[#2F6F4E]" : "bg-[#E4E1D6]"}`} />
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
                    disabled={!form.department_id}
                    onChange={e => upd("program_id", e.target.value)}>
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
              className="cd-btn-primary self-start mt-1 disabled:opacity-60">
              {busy && <Loader2 size={15} className="animate-spin" />}
              {busy ? "Creating…" : "Continue to preview →"}
            </button>
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
              certificate={previewCert}
              presetId={cert?.branding_preset || branding?.preset}
              logoUrl={cert?.logo_url || branding?.logo_url || ""}
              institutionName={cert?.institution_name || branding?.institution_name}
            />
            <div className="flex gap-3">
              <button onClick={handlePrepare} disabled={busy} className="cd-btn-primary disabled:opacity-60">
                {busy ? <><Loader2 size={15} className="animate-spin" /> Hashing…</> : "Submit for Approval →"}
              </button>
              <button onClick={() => { setStep(0); setError(""); }} className="cd-btn-secondary">← Back</button>
            </div>
          </div>
        )}

        {/* ── Step 2: Hash & Sign ── */}
        {step === 2 && certData && (
          <div className="flex flex-col gap-5">
            <div>
              <h3 className="text-[#08283F] font-semibold text-base">Sign On-Chain Submission</h3>
              <p className="text-[#4A5A68] text-sm mt-0.5">
                Review copy rendered. Sign{" "}
                <code className="font-mono text-xs bg-[#EAF2FB] px-1 rounded">submitForSealedReview</code>{" "}
                with MetaMask to put the review document&apos;s hash on-chain. The VC and Dean approve this exact copy; the
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

        {/* ── Step 3: Confirm tx ── */}
        {step === 3 && (
          <div className="flex flex-col gap-5">
            <div>
              <h3 className="text-[#08283F] font-semibold text-base">Confirm On-Chain</h3>
              <p className="text-[#4A5A68] text-sm mt-0.5">Transaction signed. Recording in Credence.</p>
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

        {/* ── Step 4: Done ── */}
        {step === 4 && (
          <div className="flex flex-col items-center gap-5 py-4 text-center">
            <CheckCircle2 size={52} className="text-[#2F6F4E]" />
            <div>
              <h3 className="text-[#08283F] font-bold text-xl mb-2">Submitted for Dual Approval</h3>
              <p className="text-[#4A5A68] text-sm leading-relaxed max-w-md">
                VC and Dean will review the preview then approve with MetaMask.
                After both signatures, you finalize the PDF and issue on-chain.
              </p>
            </div>
            <div className="flex items-center gap-2 bg-[#F8F7F2] border border-[#E4E1D6] px-5 py-3 rounded-xl">
              <ShieldCheck size={14} className="text-[#2F6F4E]" />
              <span className="font-mono text-[#08283F] text-xs">{txHash}</span>
            </div>
            <div className="flex gap-3">
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
