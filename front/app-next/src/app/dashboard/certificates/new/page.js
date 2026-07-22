"use client";
/**
 * Issue Certificate — branding / preview flow:
 *
 *  1. Student & degree details (catalog)     POST /api/certificates/
 *  2. Live preview (institution theme)       GET  /api/certificate-branding/
 *  3. Hash structured data (dataHash)        POST /api/certificates/<id>/prepare/
 *  4. submitForApproval on-chain             MetaMask
 *  5. Confirm submit tx                      POST confirm-chain → Pending VC
 */

import { useState, useEffect } from "react";
import {
  ArrowLeft, CheckCircle2, Loader2,
  Wallet, ShieldCheck, Eye, User,
} from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth, isInstitutionHead } from "@/lib/useAuth";
import { submitForApprovalOnChain } from "@/lib/walletActions";
import CertificatePreview from "@/components/dashboard/CertificatePreview";

const STEPS = [
  { label: "Student Details", icon: User },
  { label: "Preview",         icon: Eye },
  { label: "Hash & Submit",   icon: ShieldCheck },
  { label: "Sign On-Chain",   icon: Wallet },
  { label: "Complete",        icon: CheckCircle2 },
];

const inp = "w-full bg-[#eef4ff] border border-transparent focus:border-[#022448] rounded-[10px] px-4 py-3 text-sm text-[#121c28] outline-none transition-all placeholder:text-[#74777f] disabled:opacity-50";
const lbl = "text-[#022448] text-xs font-semibold uppercase tracking-widest block mb-1.5";

export default function IssueCertificatePage() {
  const { role, user } = useAuth();

  const [step,      setStep]      = useState(0);
  const [certId,    setCertId]    = useState(null);
  const [cert,      setCert]      = useState(null);
  const [certData,  setCertData]  = useState(null);
  const [branding,  setBranding]  = useState(null);
  const [txHash,    setTxHash]    = useState("");
  const [blockNum,  setBlockNum]  = useState(null);
  const [busy,      setBusy]      = useState(false);
  const [error,     setError]     = useState("");

  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [grades, setGrades] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);

  const [form, setForm] = useState({
    student_name:    "",
    student_email:   "",
    department_id:   "",
    program_id:      "",
    grade_classification_id: "",
    graduation_year: new Date().getFullYear(),
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
    if (!form.department_id) {
      setPrograms([]);
      return;
    }
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

  function upd(field, val) {
    setForm((prev) => {
      const next = { ...prev, [field]: val };
      if (field === "department_id") next.program_id = "";
      return next;
    });
  }

  const catalogReady = departments.length > 0;

  const selectedDept = departments.find((d) => d.id === form.department_id);
  const selectedProg = programs.find((p) => p.id === form.program_id);
  const selectedGrade = grades.find((g) => g.id === form.grade_classification_id);

  const previewCert = cert || {
    student_name: form.student_name || "—",
    degree_title: selectedProg?.title || "—",
    qualification_type: selectedProg?.qualification_type || cert?.qualification_type || "bachelors",
    department: selectedDept?.name || "",
    grade: selectedGrade?.label || "",
    graduation_year: form.graduation_year,
    certificate_id: "—",
    institution_name: branding?.institution_name || user?.institution_name || "Institution",
    branding_preset: branding?.preset || "classic_navy",
    registrar_signer_name: user?.full_name || [user?.first_name, user?.last_name].filter(Boolean).join(" ") || "Registrar",
    registrar_signed_at: null,
    vc_approver_name: "",
    chancellor_approver_name: "",
  };

  async function handleCreate(e) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const payload = {
        student_name: form.student_name.trim(),
        student_email: form.student_email.trim(),
        department_id: form.department_id,
        program_id: form.program_id,
        graduation_year: form.graduation_year,
      };
      if (form.grade_classification_id) {
        payload.grade_classification_id = form.grade_classification_id;
      }
      const data = await api.post("/certificates/", payload);
      setCertId(data.id);
      setCert(data);
      setStep(1);
    } catch (e) {
      setError(
        e?.program_id?.[0] ||
        e?.department_id?.[0] ||
        e?.detail ||
        JSON.stringify(e)
      );
    } finally {
      setBusy(false);
    }
  }

  async function handlePrepare() {
    setBusy(true); setError("");
    try {
      const data = await api.post(`/certificates/${certId}/prepare/`, {});
      setCertData(data);
      setStep(2);
    } catch (e) {
      setError(e.detail || JSON.stringify(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSign() {
    setBusy(true); setError("");
    try {
      const { hash, blockNumber } = await submitForApprovalOnChain(certData);
      setTxHash(hash);
      setBlockNum(blockNumber);
      setStep(3);
    } catch (e) {
      const revertMsg =
        e?.data?.message ||
        e?.error?.data?.message ||
        e?.reason ||
        e?.shortMessage ||
        e?.message ||
        "";
      const match = revertMsg.match(/execution reverted[:\s]*(.*)/i);
      setError(match?.[1]?.trim() || revertMsg || "MetaMask transaction failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    setBusy(true); setError("");
    try {
      await api.post(`/certificates/${certId}/confirm-chain/`, {
        tx_hash: txHash,
        block_number: blockNum,
      });
      setStep(4);
    } catch (e) {
      setError(JSON.stringify(e));
    } finally {
      setBusy(false);
    }
  }

  if (role && !isInstitutionHead(role)) {
    return (
      <div className="max-w-xl">
        <p className="text-[#C62828] text-sm">Only the institution Registrar can prepare certificates.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-[860px]">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/certificates" className="p-2 rounded-lg hover:bg-[#eef4ff] transition-colors text-[#43474e]">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h2 className="text-[#022448] font-bold text-2xl">Issue Certificate</h2>
          <p className="text-[#43474e] text-sm mt-0.5">
            Preview with your institution branding, then submit for dual approval
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STEPS.map(({ label, icon: Icon }, i) => {
          const done   = step > i;
          const active = step === i;
          return (
            <div key={i} className="flex items-center gap-1 shrink-0">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-[10px] text-xs font-semibold transition-all ${
                done   ? "bg-[#2E7D32]/10 text-[#2E7D32]"
                : active ? "bg-[#022448] text-white"
                : "bg-[#eef4ff] text-[#43474e]"
              }`}>
                <Icon size={13} />
                <span className="hidden sm:block">{label}</span>
                <span className="sm:hidden">{i + 1}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-5 h-px ${done ? "bg-[#2E7D32]" : "bg-[#c4c6cf]/40"}`} />
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="bg-[#ffdad6] text-[#93000a] text-sm px-4 py-3 rounded-lg flex items-start gap-2">
          <span className="shrink-0 mt-0.5">⚠</span><span className="break-all">{error}</span>
        </div>
      )}

      <div className="bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 p-8">

        {step === 0 && (
          <form onSubmit={handleCreate} className="flex flex-col gap-5">
            <h3 className="text-[#022448] font-semibold text-base mb-1">Student & Degree Details</h3>

            {catalogLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="animate-spin text-[#022448]" size={22} />
              </div>
            ) : !catalogReady ? (
              <div className="bg-[#eef4ff] rounded-[12px] px-4 py-4 text-sm text-[#43474e]">
                No departments yet. Add one in{" "}
                <Link href="/dashboard/settings" className="text-[#7b5900] font-semibold hover:underline">
                  Settings → Academic Structure
                </Link>{" "}
                before issuing a certificate.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Student Full Name *</label>
                  <input className={inp} required value={form.student_name}
                    onChange={e => upd("student_name", e.target.value)}
                    placeholder="e.g. Abel Morie Sam" />
                </div>
                <div>
                  <label className={lbl}>Student Email *</label>
                  <input type="email" className={inp} required value={form.student_email}
                    onChange={e => upd("student_email", e.target.value)}
                    placeholder="student@cusl.edu.sl" />
                </div>
                <div>
                  <label className={lbl}>Department *</label>
                  <select className={inp} required value={form.department_id}
                    onChange={e => upd("department_id", e.target.value)}>
                    <option value="">Select department…</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Degree Title *</label>
                  <select className={inp} required value={form.program_id}
                    disabled={!form.department_id}
                    onChange={e => upd("program_id", e.target.value)}>
                    <option value="">
                      {!form.department_id ? "Select a department first…" : "Select program…"}
                    </option>
                    {programs.map((p) => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Graduation Year *</label>
                  <input type="number" className={inp} required
                    value={form.graduation_year}
                    onChange={e => upd("graduation_year", parseInt(e.target.value))}
                    min={2000} max={2100} />
                </div>
                <div>
                  <label className={lbl}>Grade / Classification</label>
                  <select className={inp} value={form.grade_classification_id}
                    onChange={e => upd("grade_classification_id", e.target.value)}>
                    <option value="">Optional…</option>
                    {grades.map((g) => (
                      <option key={g.id} value={g.id}>{g.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <button type="submit" disabled={busy || catalogLoading || !catalogReady || !form.program_id}
              className="flex items-center gap-2 bg-[#022448] text-white px-6 py-3 rounded-[12px] text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-60 self-start mt-2"
            >
              {busy && <Loader2 size={15} className="animate-spin" />}
              {busy ? "Creating…" : "Continue to preview →"}
            </button>
          </form>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-5">
            <div>
              <h3 className="text-[#022448] font-semibold text-base mb-1">Certificate Preview</h3>
              <p className="text-[#43474e] text-sm">
                Generated from your catalog data and{" "}
                <Link href="/dashboard/settings" className="text-[#7b5900] font-semibold hover:underline">
                  Certificate Branding
                </Link>
                . No PDF upload — the final PDF is created after VC and Chancellor approve.
              </p>
            </div>

            <CertificatePreview
              certificate={previewCert}
              presetId={cert?.branding_preset || branding?.preset}
              logoUrl={cert?.logo_url || branding?.logo_url || ""}
              institutionName={cert?.institution_name || branding?.institution_name}
            />

            <div className="flex gap-3">
              <button onClick={handlePrepare} disabled={busy}
                className="flex items-center gap-2 bg-[#022448] text-white px-6 py-3 rounded-[12px] text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-60"
              >
                {busy ? <><Loader2 size={15} className="animate-spin" /> Hashing…</> : "Submit for Approval →"}
              </button>
              <button onClick={() => { setStep(0); setError(""); }}
                className="px-5 py-3 rounded-[12px] border border-[#c4c6cf]/40 text-[#43474e] text-sm font-medium hover:bg-[#eef4ff] transition-all">
                ← Back
              </button>
            </div>
          </div>
        )}

        {step === 2 && certData && (
          <div className="flex flex-col gap-5">
            <h3 className="text-[#022448] font-semibold text-base mb-1">Sign On-Chain Submission</h3>
            <p className="text-[#43474e] text-sm leading-relaxed">
              Structured certificate data has been hashed (<code className="font-mono text-xs">dataHash</code>).
              Sign <code className="font-mono text-xs">submitForApproval</code> with MetaMask.
            </p>

            <CertificatePreview
              certificate={previewCert}
              presetId={certData.branding_preset || branding?.preset}
              logoUrl={cert?.logo_url || branding?.logo_url || ""}
              institutionName={cert?.institution_name || branding?.institution_name}
            />

            <div className="flex flex-col gap-2">
              {[
                ["Certificate ID", certData.certificate_id],
                ["dataHash",       certData.cert_hash],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start gap-3 bg-[#FAF7F2] px-4 py-2.5 rounded-[10px]">
                  <span className="text-[#43474e] text-xs font-semibold uppercase tracking-wider w-28 shrink-0 mt-0.5">{label}</span>
                  <span className="font-mono text-[#022448] text-xs break-all">{value}</span>
                </div>
              ))}
            </div>

            <button onClick={handleSign} disabled={busy}
              className="flex items-center gap-2 bg-[#022448] text-white px-6 py-3 rounded-[12px] text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-60 self-start"
            >
              {busy
                ? <><Loader2 size={15} className="animate-spin" /> Waiting for MetaMask…</>
                : <><Wallet size={15} /> Sign submitForApproval</>}
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-5">
            <h3 className="text-[#022448] font-semibold text-base mb-1">Confirm On-Chain</h3>
            <p className="text-[#43474e] text-sm leading-relaxed">
              Transaction confirmed. Recording the submit in CREDENCE.
            </p>
            <div className="flex flex-col gap-2">
              {[
                ["Tx Hash", txHash],
                ["Block",   blockNum ? `#${blockNum}` : "—"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center gap-3 bg-[#FAF7F2] px-4 py-3 rounded-[10px]">
                  <span className="text-[#43474e] text-xs font-semibold uppercase tracking-wider w-20 shrink-0">{label}</span>
                  <span className="font-mono text-[#022448] text-xs break-all">{value}</span>
                </div>
              ))}
            </div>
            <button onClick={handleConfirm} disabled={busy}
              className="flex items-center gap-2 bg-[#2E7D32] text-white px-6 py-3 rounded-[12px] text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-60 self-start"
            >
              {busy && <Loader2 size={15} className="animate-spin" />}
              {busy ? "Saving…" : "Confirm & Complete →"}
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col items-center gap-5 py-4 text-center">
            <CheckCircle2 size={52} className="text-[#2E7D32]" />
            <div>
              <h3 className="text-[#022448] font-bold text-xl mb-2">Submitted for Dual Approval</h3>
              <p className="text-[#43474e] text-sm leading-relaxed max-w-md">
                VC and Chancellor will review the same certificate preview, then approve with MetaMask.
                After both signatures, you finalize the PDF and issue on-chain.
              </p>
            </div>
            <div className="flex items-center gap-2 bg-[#FAF7F2] px-5 py-3 rounded-[10px]">
              <ShieldCheck size={14} className="text-[#2E7D32]" />
              <span className="font-mono text-[#022448] text-xs">{txHash}</span>
            </div>
            <div className="flex gap-3">
              <Link href="/dashboard/certificates"
                className="bg-[#022448] text-white px-6 py-3 rounded-[12px] text-sm font-semibold hover:opacity-90 transition-all">
                View All Certificates
              </Link>
              <button onClick={() => {
                setStep(0); setCertId(null); setCert(null); setCertData(null);
                setTxHash(""); setBlockNum(null); setError("");
                setForm({
                  student_name: "", student_email: "", department_id: "",
                  program_id: "", grade_classification_id: "",
                  graduation_year: new Date().getFullYear(),
                });
              }}
                className="border border-[#022448] text-[#022448] px-6 py-3 rounded-[12px] text-sm font-semibold hover:bg-[#022448] hover:text-white transition-all">
                Issue Another
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
