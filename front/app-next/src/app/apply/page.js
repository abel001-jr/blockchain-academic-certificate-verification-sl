"use client";
import { useState } from "react";
import { Building2, CheckCircle2, Loader2, ArrowLeft, Wallet } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000/api";
const STEPS = ["Institution Details", "Admin Contact", "Review & Submit"];

export default function ApplyPage() {
  const [step,       setStep]       = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [done,       setDone]       = useState(false);
  const [error,      setError]      = useState("");
  const [walletBusy, setWalletBusy] = useState(false);

  const [form, setForm] = useState({
    institution_name:    "",
    accreditation_body:  "",
    registration_number: "",
    country:             "Sierra Leone",
    contact_email:       "",
    contact_phone:       "",
    admin_first_name:    "",
    admin_last_name:     "",
    admin_email:         "",
    wallet_address:      "",
  });
  const [walletVerified, setWalletVerified] = useState(false);

  function update(field, value) {
    if (field === "institution_name" && walletVerified) {
      setWalletVerified(false);
      setForm(prev => ({ ...prev, institution_name: value, wallet_address: "" }));
      return;
    }
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function connectAndVerifyWallet() {
    setError("");
    setWalletBusy(true);
    try {
      if (!window.ethereum) throw new Error("MetaMask not found. Install MetaMask to continue.");
      if (!form.institution_name.trim()) throw new Error("Enter the institution name on Step 1 first.");

      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const address = (accounts[0] || "").toLowerCase();
      if (!address) throw new Error("No wallet account selected.");

      const challengeRes = await fetch(`${API}/institutions/apply/wallet/challenge/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, institution_name: form.institution_name.trim() }),
      });
      const challenge = await challengeRes.json();
      if (!challengeRes.ok) throw new Error(challenge.detail || "Challenge failed.");

      const signature = await window.ethereum.request({
        method: "personal_sign",
        params: [challenge.message, address],
      });

      const verifyRes = await fetch(`${API}/institutions/apply/wallet/verify/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, signature }),
      });
      const verified = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verified.detail || "Signature verification failed.");

      setForm(prev => ({ ...prev, wallet_address: verified.wallet_address }));
      setWalletVerified(true);
    } catch (e) {
      setWalletVerified(false);
      setForm(prev => ({ ...prev, wallet_address: "" }));
      setError(e?.message || "Wallet verification failed.");
    } finally {
      setWalletBusy(false);
    }
  }

  async function handleSubmit() {
    if (!walletVerified || !form.wallet_address) {
      setError("Verify your MetaMask wallet on Step 2 before submitting.");
      return;
    }
    setLoading(true); setError("");
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      const res  = await fetch(`${API}/institutions/apply/`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.detail || data.wallet_address?.[0] || Object.values(data).flat().join(" ");
        throw new Error(msg);
      }
      setDone(true);
    } catch (e) {
      setError(e.message || "Submission failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8F7F2] flex">

      {/* ── Left brand panel ── */}
      <div className="hidden lg:flex w-[420px] shrink-0 bg-[#08283F] flex-col justify-between px-10 py-12 relative overflow-hidden">
        <div className="absolute -right-16 -bottom-16 w-64 h-64 bg-[#B98A28]/20 rounded-full blur-3xl" />

        <div className="relative z-10">
          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-14">
            <Image src="/logo.png" alt="Credence" width={32} height={32} className="rounded-lg" />
            <span className="text-white font-bold text-xl tracking-tight">Credence</span>
          </div>

          <h2 className="text-white font-bold text-3xl leading-snug mb-4">
            Join the Credence Network
          </h2>
          <p className="text-white/65 text-base leading-relaxed mb-10">
            Register your institution to issue blockchain-anchored academic credentials that anyone can verify independently.
          </p>

          {/* What you get */}
          <div className="flex flex-col gap-4">
            {[
              {
                icon: "🏛️",
                title: "Institutional issuance",
                desc: "Issue verifiable credentials directly from your institution's wallet.",
              },
              {
                icon: "⛓️",
                title: "On-chain trust",
                desc: "Every certificate is anchored on Ethereum — tamper-proof and permanent.",
              },
              {
                icon: "✅",
                title: "Instant verification",
                desc: "Employers verify in seconds — no phone calls, no paperwork.",
              },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="flex items-start gap-3">
                <span className="text-xl shrink-0 mt-0.5">{icon}</span>
                <div>
                  <p className="text-white text-sm font-semibold">{title}</p>
                  <p className="text-white/55 text-xs leading-relaxed mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Step preview */}
          <div className="mt-10 pt-8 border-t border-white/10">
            <p className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-4">Application steps</p>
            <div className="flex flex-col gap-2.5">
              {STEPS.map((label, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all ${
                    i < step  ? "bg-[#2F6F4E] text-white"
                    : i === step ? "bg-[#B98A28] text-white"
                    : "bg-white/10 text-white/40"
                  }`}>
                    {i < step ? "✓" : i + 1}
                  </div>
                  <span className={`text-sm transition-all ${
                    i === step ? "text-white font-semibold" :
                    i < step   ? "text-white/70" : "text-white/35"
                  }`}>
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative z-10">
          <p className="text-white/40 text-xs">
            Already registered?{" "}
            <Link href="/login" className="text-white/70 hover:text-white underline transition-colors">
              Sign in here
            </Link>
          </p>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 overflow-y-auto">

        {/* Back link */}
        <div className="w-full max-w-xl mb-5">
          <Link href="/"
            className="inline-flex items-center gap-2 text-[#4A5A68] text-sm font-medium hover:text-[#08283F] transition-colors group">
            <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
            Back to home
          </Link>
        </div>

        <div className="w-full max-w-xl">

          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2.5 mb-6">
            <Image src="/logo.png" alt="Credence" width={32} height={32} className="rounded-lg" />
            <span className="text-[#08283F] font-bold text-xl">Credence</span>
          </div>

          {/* Mobile step indicator */}
          <div className="flex lg:hidden items-center gap-2 mb-6">
            {STEPS.map((label, i) => (
              <div key={i} className="flex items-center gap-2 flex-1">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  i < step  ? "bg-[#2F6F4E] text-white"
                  : i === step ? "bg-[#08283F] text-white"
                  : "bg-[#EAF2FB] text-[#4A5A68]"
                }`}>
                  {i < step ? "✓" : i + 1}
                </div>
                <span className={`text-xs font-medium hidden sm:block ${i === step ? "text-[#08283F]" : "text-[#8A929C]"}`}>
                  {label}
                </span>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-px mx-1 ${i < step ? "bg-[#2F6F4E]" : "bg-[#E4E1D6]"}`} />
                )}
              </div>
            ))}
          </div>

          {/* Heading */}
          {!done && (
            <div className="mb-6">
              <h1 className="text-[#08283F] font-bold text-2xl">Institution Onboarding</h1>
              <p className="text-[#4A5A68] text-sm mt-0.5">Apply to join the Credence network</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-[#F5E5E3] text-[#A23B34] text-sm px-4 py-3 rounded-lg mb-5 flex items-start gap-2">
              <span className="shrink-0">⚠</span><span>{error}</span>
            </div>
          )}

          {/* ── Success state ── */}
          {done ? (
            <div className="bg-white rounded-xl border border-[#E4E1D6] p-8 text-center">
              <div className="w-14 h-14 rounded-full bg-[#E7F1EB] flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={28} className="text-[#2F6F4E]" />
              </div>
              <h2 className="text-[#08283F] font-bold text-xl mb-3">Application Submitted</h2>
              <p className="text-[#4A5A68] text-sm leading-relaxed max-w-sm mx-auto mb-4">
                Your application is under review. A Super Admin will approve and anchor your verified wallet on-chain. Sign in with the same MetaMask account after approval.
              </p>
              <p className="text-[#8A929C] text-xs font-mono break-all mb-6">{form.wallet_address}</p>
              <Link href="/login" className="cd-btn-primary">Go to sign in</Link>
            </div>
          ) : (

          <div className="bg-white rounded-xl border border-[#E4E1D6] p-6">

            {/* ── Step 0: Institution details ── */}
            {step === 0 && (
              <div className="flex flex-col gap-4">
                <div>
                  <h3 className="text-[#08283F] font-semibold text-base">Institution information</h3>
                  <p className="text-[#4A5A68] text-sm mt-0.5">Official details as they appear in accreditation records.</p>
                </div>
                <div>
                  <label className="cd-label">Institution name *</label>
                  <input className="cd-input" value={form.institution_name}
                    onChange={e => update("institution_name", e.target.value)}
                    placeholder="e.g. Central University Sierra Leone" required />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="cd-label">Accreditation body</label>
                    <input className="cd-input" value={form.accreditation_body} onChange={e => update("accreditation_body", e.target.value)} placeholder="e.g. TEACH-SL" />
                  </div>
                  <div>
                    <label className="cd-label">Registration number</label>
                    <input className="cd-input" value={form.registration_number} onChange={e => update("registration_number", e.target.value)} placeholder="e.g. EDU-2024-001" />
                  </div>
                  <div>
                    <label className="cd-label">Country *</label>
                    <input className="cd-input" value={form.country} onChange={e => update("country", e.target.value)} />
                  </div>
                  <div>
                    <label className="cd-label">Contact email *</label>
                    <input type="email" className="cd-input" value={form.contact_email} onChange={e => update("contact_email", e.target.value)} placeholder="registrar@institution.edu" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="cd-label">Contact phone</label>
                    <input className="cd-input" value={form.contact_phone} onChange={e => update("contact_phone", e.target.value)} placeholder="+232 76 000 000" />
                  </div>
                </div>
                <button
                  disabled={!form.institution_name || !form.contact_email}
                  onClick={() => { setError(""); setStep(1); }}
                  className="cd-btn-primary self-start disabled:opacity-40">
                  Continue →
                </button>
              </div>
            )}

            {/* ── Step 1: Admin contact ── */}
            {step === 1 && (
              <div className="flex flex-col gap-4">
                <div>
                  <h3 className="text-[#08283F] font-semibold text-base">Institutional admin account</h3>
                  <p className="text-[#4A5A68] text-sm mt-0.5 leading-relaxed">
                    Prove ownership of the MetaMask wallet that will become this institution&apos;s on-chain issuer. Signing costs no gas.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="cd-label">First name *</label>
                    <input className="cd-input" value={form.admin_first_name} onChange={e => update("admin_first_name", e.target.value)} />
                  </div>
                  <div>
                    <label className="cd-label">Last name *</label>
                    <input className="cd-input" value={form.admin_last_name} onChange={e => update("admin_last_name", e.target.value)} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="cd-label">Admin email *</label>
                    <input type="email" className="cd-input" value={form.admin_email} onChange={e => update("admin_email", e.target.value)} placeholder="admin@institution.edu" />
                  </div>
                </div>

                {/* Wallet */}
                <div className="border border-[#E4E1D6] rounded-xl p-4">
                  <label className="cd-label mb-2">Admin wallet *</label>
                  {walletVerified ? (
                    <div className="flex items-start gap-3 bg-[#E7F1EB] rounded-xl px-4 py-3">
                      <CheckCircle2 size={17} className="shrink-0 mt-0.5 text-[#2F6F4E]" />
                      <div className="min-w-0">
                        <p className="text-[#2F6F4E] text-sm font-semibold">Wallet verified</p>
                        <p className="text-[#2F6F4E] text-xs font-mono break-all mt-0.5">{form.wallet_address}</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-[#4A5A68] text-sm mb-3">Connect MetaMask and sign a free challenge message to prove wallet ownership.</p>
                      <button type="button" onClick={connectAndVerifyWallet}
                        disabled={walletBusy || !form.institution_name}
                        className="cd-btn-primary w-full disabled:opacity-50">
                        {walletBusy ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
                        {walletBusy ? "Confirm in MetaMask…" : "Connect Wallet & Sign"}
                      </button>
                    </>
                  )}
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setStep(0)} className="cd-btn-secondary">← Back</button>
                  <button
                    disabled={!form.admin_first_name || !form.admin_last_name || !form.admin_email || !walletVerified}
                    onClick={() => { setError(""); setStep(2); }}
                    className="cd-btn-primary disabled:opacity-40">
                    Review →
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 2: Review ── */}
            {step === 2 && (
              <div className="flex flex-col gap-4">
                <div>
                  <h3 className="text-[#08283F] font-semibold text-base">Review your application</h3>
                  <p className="text-[#4A5A68] text-sm mt-0.5">Check all details before submitting.</p>
                </div>
                <div className="bg-white rounded-xl border border-[#E4E1D6] divide-y divide-[#E4E1D6]">
                  {[
                    ["Institution",   form.institution_name],
                    ["Country",       form.country],
                    ["Contact email", form.contact_email],
                    ["Accreditation", form.accreditation_body || "—"],
                    ["Admin name",    `${form.admin_first_name} ${form.admin_last_name}`],
                    ["Admin email",   form.admin_email],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-start gap-4 px-4 py-3">
                      <p className="text-[#8A929C] text-sm w-32 shrink-0 pt-0.5">{label}</p>
                      <p className="text-[#08283F] text-sm font-medium break-words">{value}</p>
                    </div>
                  ))}
                  <div className="flex items-start gap-4 px-4 py-3 bg-[#E7F1EB]">
                    <p className="text-[#2F6F4E] text-sm w-32 shrink-0 pt-0.5 font-semibold flex items-center gap-1">
                      <CheckCircle2 size={12} /> Wallet
                    </p>
                    <p className="text-[#08283F] text-sm font-mono break-all">{form.wallet_address}</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setStep(1)} className="cd-btn-secondary">← Back</button>
                  <button disabled={loading || !walletVerified} onClick={handleSubmit}
                    className="cd-btn-primary disabled:opacity-60">
                    {loading && <Loader2 size={15} className="animate-spin" />}
                    {loading ? "Submitting…" : "Submit Application"}
                  </button>
                </div>
              </div>
            )}

          </div>
          )}

          {/* Footer note */}
          {!done && (
            <p className="text-[#8A929C] text-xs text-center mt-5">
              Already have an account?{" "}
              <Link href="/login" className="text-[#B98A28] font-semibold hover:underline">Sign in</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
