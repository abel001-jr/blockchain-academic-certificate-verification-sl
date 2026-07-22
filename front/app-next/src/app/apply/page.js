"use client";
import { useState } from "react";
import { Building2, CheckCircle2, Loader2, ArrowLeft, Wallet } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const API = "http://127.0.0.1:8000/api";
const STEPS = ["Institution Details", "Admin Contact", "Review & Submit"];

export default function ApplyPage() {
  const [step,    setStep]    = useState(0);
  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState(false);
  const [error,   setError]   = useState("");
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
      if (!form.institution_name.trim()) {
        throw new Error("Enter the institution name on Step 1 first.");
      }

      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const address = (accounts[0] || "").toLowerCase();
      if (!address) throw new Error("No wallet account selected.");

      const challengeRes = await fetch(`${API}/institutions/apply/wallet/challenge/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          institution_name: form.institution_name.trim(),
        }),
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
    setLoading(true);
    setError("");
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));

      const res  = await fetch(`${API}/institutions/apply/`, {
        method: "POST",
        body:   fd,
      });
      const data = await res.json();

      if (!res.ok) {
        const msg = data.detail
          || data.wallet_address?.[0]
          || Object.values(data).flat().join(" ");
        throw new Error(msg);
      }

      setDone(true);
    } catch (e) {
      setError(e.message || "Submission failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const inp = "w-full bg-[#eef4ff] border border-transparent focus:border-[#022448] rounded-[10px] px-4 py-3 text-sm text-[#121c28] outline-none transition-all placeholder:text-[#74777f]";
  const lbl = "text-[#022448] text-xs font-semibold uppercase tracking-widest block mb-1.5";

  return (
    <div className="min-h-screen bg-[#FAF7F2] flex flex-col">
      <Navbar />

      <main className="flex-1 px-4 pt-28 pb-16">
        <div className="max-w-2xl mx-auto">

          <Link href="/" className="inline-flex items-center gap-2 text-[#43474e] text-sm font-medium hover:text-[#022448] transition-colors group mb-8">
            <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
            Back to home
          </Link>

          <div className="flex items-center gap-3 mb-8">
            <div className="w-11 h-11 rounded-[10px] overflow-hidden shrink-0 shadow-sm">
              <Image src="/logo.png" alt="CREDENCE" width={44} height={44} className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="text-[#022448] font-bold text-2xl leading-tight">Institution Onboarding</h1>
              <p className="text-[#43474e] text-sm">Apply to join the CREDENCE network</p>
            </div>
          </div>

          {done ? (
            <div className="bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 p-8 text-center">
              <CheckCircle2 size={48} className="text-[#2E7D32] mx-auto mb-4" />
              <h2 className="text-[#022448] font-bold text-xl mb-2">Application Submitted</h2>
              <p className="text-[#43474e] text-sm leading-relaxed max-w-md mx-auto">
                Your application is under review. A Super Admin will Approve &amp; Anchor
                your verified wallet on-chain. After that, sign in with the same MetaMask
                account — no extra wallet-binding step.
              </p>
              <p className="text-[#74777f] text-xs font-mono mt-3 break-all">{form.wallet_address}</p>
              <Link href="/login" className="inline-block mt-6 text-[#7b5900] text-sm font-semibold hover:underline">
                Go to Sign In
              </Link>
            </div>
          ) : (
            <div className="bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 p-8">

              <div className="flex items-center gap-2 mb-8">
                {STEPS.map((label, i) => (
                  <div key={i} className="flex items-center gap-2 flex-1">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all ${
                      i < step  ? "bg-[#2E7D32] text-white"
                      : i === step ? "bg-[#022448] text-white"
                      : "bg-[#eef4ff] text-[#43474e]"
                    }`}>
                      {i < step ? "✓" : i + 1}
                    </div>
                    <span className={`text-xs font-medium hidden sm:block ${i === step ? "text-[#022448]" : "text-[#74777f]"}`}>
                      {label}
                    </span>
                    {i < STEPS.length - 1 && (
                      <div className={`flex-1 h-px mx-2 ${i < step ? "bg-[#2E7D32]" : "bg-[#c4c6cf]/40"}`} />
                    )}
                  </div>
                ))}
              </div>

              {error && (
                <div className="bg-[#ffdad6] text-[#93000a] text-sm px-4 py-3 rounded-lg mb-6 flex items-start gap-2">
                  <span className="shrink-0">⚠</span><span>{error}</span>
                </div>
              )}

              {step === 0 && (
                <div className="flex flex-col gap-5">
                  <h3 className="text-[#022448] font-semibold text-sm">Institution Information</h3>
                  <div>
                    <label className={lbl}>Institution Name *</label>
                    <input className={inp} value={form.institution_name} onChange={e => update("institution_name", e.target.value)} placeholder="e.g. Central University Sierra Leone" required />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={lbl}>Accreditation Body</label>
                      <input className={inp} value={form.accreditation_body} onChange={e => update("accreditation_body", e.target.value)} placeholder="e.g. TEACH-SL" />
                    </div>
                    <div>
                      <label className={lbl}>Registration Number</label>
                      <input className={inp} value={form.registration_number} onChange={e => update("registration_number", e.target.value)} placeholder="e.g. EDU-2024-001" />
                    </div>
                    <div>
                      <label className={lbl}>Country *</label>
                      <input className={inp} value={form.country} onChange={e => update("country", e.target.value)} />
                    </div>
                    <div>
                      <label className={lbl}>Contact Email *</label>
                      <input type="email" className={inp} value={form.contact_email} onChange={e => update("contact_email", e.target.value)} placeholder="registrar@institution.edu" />
                    </div>
                    <div>
                      <label className={lbl}>Contact Phone</label>
                      <input className={inp} value={form.contact_phone} onChange={e => update("contact_phone", e.target.value)} placeholder="+232 76 000 000" />
                    </div>
                  </div>
                  <button
                    disabled={!form.institution_name || !form.contact_email}
                    onClick={() => { setError(""); setStep(1); }}
                    className="bg-[#022448] text-white px-6 py-3 rounded-[12px] text-sm font-semibold hover:opacity-90 transition-all self-start disabled:opacity-40 mt-2"
                  >
                    Continue →
                  </button>
                </div>
              )}

              {step === 1 && (
                <div className="flex flex-col gap-5">
                  <h3 className="text-[#022448] font-semibold text-sm">Institutional Admin Account</h3>
                  <p className="text-[#43474e] text-xs leading-relaxed bg-[#eef4ff] p-3 rounded-[10px]">
                    Prove ownership of the MetaMask wallet that will become this institution&apos;s
                    on-chain issuer. Signing costs no gas — Super Admin will anchor it later.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={lbl}>First Name *</label>
                      <input className={inp} value={form.admin_first_name} onChange={e => update("admin_first_name", e.target.value)} />
                    </div>
                    <div>
                      <label className={lbl}>Last Name *</label>
                      <input className={inp} value={form.admin_last_name} onChange={e => update("admin_last_name", e.target.value)} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={lbl}>Admin Email *</label>
                      <input type="email" className={inp} value={form.admin_email} onChange={e => update("admin_email", e.target.value)} placeholder="admin@institution.edu" />
                    </div>
                  </div>

                  <div className="border border-[#c4c6cf]/20 rounded-[12px] p-4">
                    <label className={lbl}>Admin Wallet *</label>
                    {walletVerified ? (
                      <div className="flex items-start gap-2 bg-[#2E7D32]/10 text-[#2E7D32] rounded-[10px] px-4 py-3">
                        <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">Wallet verified</p>
                          <p className="text-xs font-mono break-all mt-0.5">{form.wallet_address}</p>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={connectAndVerifyWallet}
                        disabled={walletBusy || !form.institution_name}
                        className="w-full flex items-center justify-center gap-2 bg-[#022448] text-white py-3 rounded-[12px] text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-50"
                      >
                        {walletBusy ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
                        {walletBusy ? "Confirm in MetaMask…" : "Connect Wallet & Sign"}
                      </button>
                    )}
                  </div>

                  <div className="flex gap-3 mt-2">
                    <button onClick={() => setStep(0)} className="border border-[#c4c6cf]/40 text-[#43474e] px-6 py-3 rounded-[12px] text-sm font-medium hover:bg-[#eef4ff] transition-all">← Back</button>
                    <button
                      disabled={!form.admin_first_name || !form.admin_last_name || !form.admin_email || !walletVerified}
                      onClick={() => { setError(""); setStep(2); }}
                      className="bg-[#022448] text-white px-6 py-3 rounded-[12px] text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-40"
                    >
                      Review →
                    </button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="flex flex-col gap-5">
                  <h3 className="text-[#022448] font-semibold text-sm">Review Your Application</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      ["Institution", form.institution_name],
                      ["Country", form.country],
                      ["Contact Email", form.contact_email],
                      ["Accreditation", form.accreditation_body || "—"],
                      ["Admin Name", `${form.admin_first_name} ${form.admin_last_name}`],
                      ["Admin Email", form.admin_email],
                    ].map(([label, value]) => (
                      <div key={label} className="bg-[#FAF7F2] rounded-[10px] p-3">
                        <p className="text-[#43474e] text-xs font-semibold uppercase tracking-wider mb-0.5">{label}</p>
                        <p className="text-[#022448] text-sm font-medium">{value}</p>
                      </div>
                    ))}
                    <div className="bg-[#2E7D32]/5 border border-[#2E7D32]/20 rounded-[10px] p-3 col-span-2">
                      <p className="text-[#2E7D32] text-xs font-semibold uppercase tracking-wider mb-0.5 flex items-center gap-1">
                        <CheckCircle2 size={12} /> Verified Wallet
                      </p>
                      <p className="text-[#022448] text-sm font-mono break-all">{form.wallet_address}</p>
                    </div>
                  </div>
                  <div className="flex gap-3 mt-2">
                    <button onClick={() => setStep(1)} className="border border-[#c4c6cf]/40 text-[#43474e] px-6 py-3 rounded-[12px] text-sm font-medium hover:bg-[#eef4ff] transition-all">← Back</button>
                    <button
                      disabled={loading || !walletVerified}
                      onClick={handleSubmit}
                      className="flex items-center gap-2 bg-[#022448] text-white px-8 py-3 rounded-[12px] text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-60"
                    >
                      {loading && <Loader2 size={15} className="animate-spin" />}
                      {loading ? "Submitting…" : "Submit Application"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
