"use client";
import { connectSingleWallet, disconnectWalletAccounts, readWalletAccounts, singleWalletAccount } from "@/lib/walletConnection.mjs";
import NavigationButton from "@/components/ui/NavigationButton";

import { ActionButton } from "@/components/ui/AnimatedControls";

import { useEffect, useRef, useState } from "react";
import { Building2, CheckCircle2, Loader2, ArrowLeft, Wallet } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { AuthTransitionLink, AuthTransitionSurface } from "@/components/AuthRouteTransition";
import styles from "../login/LoginSwitch.module.css";
import AuthField from "@/components/AuthField";
import AuthEmailField from "@/components/AuthEmailField";
import { emailValidationMessage } from "@/lib/applicationEmail.mjs";
import AuthCountrySelect from "@/components/AuthCountrySelect";
import AuthPhoneField from "@/components/AuthPhoneField";
import WalletStatusDialog from "@/components/WalletStatusDialog";
import { requireEthereum as getMetaMaskProvider } from "@/lib/walletActions";

const API = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000/api";
const STEPS = ["Institution Details", "Admin Contact", "Review & Submit"];
const SL_REGISTRATION_AUTHORITY = "Tertiary Education Commission (TEC)";

export default function ApplyPage() {
  const [step,       setStep]       = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [done,       setDone]       = useState(false);
  const [error,      setError]      = useState("");
  const walletRequestLock = useRef(false);
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletStatus, setWalletStatus] = useState(null);

  const [form, setForm] = useState({
    institution_name:    "",
    accreditation_body:  "",
    registration_number: "",
    country:             "",
    contact_email:       "",
    contact_phone:       "",
    admin_first_name:    "",
    admin_last_name:     "",
    admin_email:         "",
    wallet_address:      "",
  });
  const [walletVerified, setWalletVerified] = useState(false);
  const [callingCode, setCallingCode] = useState("232");
  useEffect(() => {
    let ethereum;
    try { ethereum = getMetaMaskProvider(); } catch { return; }
    const changed = () => { setWalletVerified(false); setForm(previous => ({ ...previous, wallet_address: "" })); };
    ethereum?.on?.("accountsChanged", changed);
    return () => ethereum?.removeListener?.("accountsChanged", changed);
  }, []);

  async function switchWalletAccount() {
    if (walletRequestLock.current) return;
    walletRequestLock.current = true;
    setWalletStatus(null); setError("");
    setWalletBusy(true);
    try {
      const ethereum = getMetaMaskProvider();
      await disconnectWalletAccounts(ethereum);
      window.dispatchEvent(new Event("credence:wallet-connection-changed"));
      setWalletVerified(false); setForm(previous => ({ ...previous, wallet_address: "" }));

    } catch (e) {
      const message = e.code === 4001 ? "Disconnection cancelled." : e.message || "Could not disconnect MetaMask accounts.";
      setError(message); setWalletStatus({ kind: "error", message });
    }
    finally { walletRequestLock.current = false; setWalletBusy(false); }
  }

  function validateStep(event) {
    const controls = event.currentTarget.closest('[data-auth-transition]').querySelectorAll('input');
    for (const input of controls) { if (!input.reportValidity()) return false; }
    return true;
  }

  function update(field, value) {
    if (field === "country") {
      setForm(previous => ({ ...previous, country: value, accreditation_body: value === "Sierra Leone" ? SL_REGISTRATION_AUTHORITY : "", registration_number: "" }));
      return;
    }
    if (["contact_email", "admin_email"].includes(field)) value = value.trim();
    if (["institution_name", "admin_first_name", "admin_last_name"].includes(field)) value = value.replace(/[^\p{L}\p{M} ]/gu, "");
    if (["institution_name", "admin_first_name", "admin_last_name", "accreditation_body"].includes(field)) {
      value = value.replace(/(^|[\s-])(\p{L})/gu, (_, boundary, letter) => boundary + letter.toLocaleUpperCase());
    }
    if (field === "contact_phone") value = value.replace(/[^0-9]/g, "").replace(/^0+/, "");
    if (field === "institution_name" && walletVerified) {
      setWalletVerified(false);
      setForm(prev => ({ ...prev, institution_name: value, wallet_address: "" }));
      return;
    }
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function connectAndVerifyWallet() {
    if (walletRequestLock.current) return;
    walletRequestLock.current = true;
    setError("");
    setWalletBusy(true);
    setWalletStatus({ kind: "checking", message: "Choose your MetaMask account. We will check whether it is already registered." });
    try {
      const ethereum = getMetaMaskProvider();
      if (!form.institution_name.trim()) throw new Error("Enter the institution name on Step 1 first.");

      const address = await connectSingleWallet(ethereum);

      const challengeRes = await fetch(`${API}/institutions/apply/wallet/challenge/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, institution_name: form.institution_name.trim() }),
      });
      const challenge = await challengeRes.json();
      if (!challengeRes.ok) throw Object.assign(new Error(challenge.detail || "Challenge failed."), { code: challenge.code });
      setWalletStatus({ kind: "checking", address, message: "This account is available. Sign the free MetaMask message to verify ownership." });

      if (singleWalletAccount(await readWalletAccounts(ethereum)) !== address) throw new Error("Your wallet connection changed. Connect and verify again.");
      const signature = await ethereum.request({
        method: "personal_sign",
        params: [challenge.message, address],
      });

      const verifyRes = await fetch(`${API}/institutions/apply/wallet/verify/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, signature }),
      });
      const verified = await verifyRes.json();
      if (!verifyRes.ok) throw Object.assign(new Error(verified.detail || "Signature verification failed."), { code: verified.code });
      const current = await ethereum.request({ method: "eth_accounts" });
      if (current?.[0]?.toLowerCase() !== address) throw new Error("MetaMask account changed. Connect and verify the selected account again.");

      if (singleWalletAccount(await readWalletAccounts(ethereum)) !== address) throw new Error("Your wallet connection changed. Connect and verify again.");
      setForm(prev => ({ ...prev, wallet_address: verified.wallet_address }));
      setWalletVerified(true);
      setWalletStatus({ kind: "verified", address, message: "This account is not registered elsewhere and its ownership is verified. You can continue to review." });
    } catch (e) {
      setWalletVerified(false);
      setForm(prev => ({ ...prev, wallet_address: "" }));
      setError(e?.message || "Wallet verification failed.");
      setWalletStatus({ kind: e.code === "wallet_taken" ? "taken" : "error", message: e.code === 4001 ? "MetaMask request cancelled. Try again when ready." : e?.message || "Wallet verification failed." });
    } finally {
      walletRequestLock.current = false; setWalletBusy(false);
    }
  }

  async function handleSubmit() {
    for (const [field, label, targetStep] of [["contact_email", "Contact email", 0], ["admin_email", "Admin email", 1]]) {
      const message = emailValidationMessage(form[field]);
      if (message) { setError(`${label}: ${message}`); setStep(targetStep); return; }
    }
    if (!walletVerified || !form.wallet_address) {
      setError("Verify your MetaMask wallet on Step 2 before submitting.");
      return;
    }
    setLoading(true); setError("");
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, k === "contact_phone" && v ? callingCode + v : v));
      fd.append("contact_calling_code", callingCode);
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

  return <main className={`${styles.page} bg-[#F8F7F2] flex`}>
    <aside className={`${styles.sidebar} hidden lg:flex shrink-0 bg-[#08283F] flex-col justify-between`}>
      <div><div className="flex items-center gap-2.5 mb-8"><Image src="/fav.png" alt="Credence" width={32} height={32} className="rounded-lg" /><span className="text-white font-bold text-xl">Credence</span></div>
      <h2 className="text-white font-bold text-2xl mb-3">Join the network</h2><p className="text-white/65 text-sm leading-relaxed">Register your institution to issue verifiable academic credentials.</p>
      <div className="mt-6 pt-5 border-t border-white/15"><h3 className="text-white text-sm font-semibold mb-4">How to join</h3><ol className="space-y-5">{[
        ["Institution details", "Provide your official institution and contact information."],
        ["Admin & wallet", "Add your administrator and verify the MetaMask wallet."],
        ["Review & submit", "Check your details. Approval comes from the system administrator."],
      ].map(([title, description], i) => <li key={title} className="flex gap-3"><span className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-xs ${i === step ? "bg-white text-[#08283F]" : "border border-white/30 text-white/60"}`}>{i + 1}</span><div><h4 className="text-white text-sm font-semibold">{title}</h4><p className="text-white/60 text-xs leading-relaxed mt-1">{description}</p></div></li>)}</ol></div></div>
      {step === 0 && !done && <p className="text-white/50 text-xs">Already registered? <AuthTransitionLink href="/login" className="text-white underline">Sign in</AuthTransitionLink></p>}
    </aside>
    <section className={`${styles.workspace} flex-1 flex flex-col items-center justify-center`}>
      <div className="w-full max-w-4xl mb-3"><NavigationButton direction="back" href="/" className="inline-flex items-center gap-2 text-[#4A5A68] text-sm"><ArrowLeft size={14} /> Back to home</NavigationButton></div>
      <div className="w-full max-w-4xl">
        <div className="flex lg:hidden items-center gap-2.5 mb-3"><Image src="/fav.png" alt="Credence" width={32} height={32} /><span className="text-[#08283F] font-bold text-xl">Credence</span></div>
        <h1 className="text-[#08283F] font-bold text-2xl mb-1">Apply to join</h1><p className="text-[#4A5A68] text-sm mb-4">Institution registration</p>
        <AuthTransitionSurface className={`${styles.card} ${styles.application}`}>
          <div className={styles.applicationProgress} role="progressbar" aria-label="Application progress" aria-valuemin={0} aria-valuemax={3} aria-valuenow={done ? 3 : step + 1}><span style={{ width: `${done ? 100 : ((step + 1) / 3) * 100}%` }} /></div>
          <nav className={styles.applicationSteps} aria-label="Application progress">{STEPS.map((label, i) => <div key={label} aria-current={i === step ? "step" : undefined}><span>{i < step ? <CheckCircle2 size={16} /> : i + 1}</span>{label}</div>)}</nav>
          <div className={styles.applicationBody}>
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
              <AuthTransitionLink href="/login" className="cred-btn cred-btn-primary">Go to sign in</AuthTransitionLink>
            </div>
          ) : (

          <div className={styles.applicationFields}>

            {/* ── Step 0: Institution details ── */}
            {step === 0 && (
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                  <h3 className="text-[#08283F] font-semibold text-base">Institution information</h3>
                  <p className="text-[#4A5A68] text-sm mt-0.5">Use your institution?s official registration details.</p>
                  </div>
                  <AuthTransitionLink href="/login" className="cred-btn cred-btn-secondary shrink-0">Sign in</AuthTransitionLink>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <AuthField pattern={"[\\p{L}\\p{M} ]*\\p{L}[\\p{L}\\p{M} ]*"} autoCapitalize="words" label="Institution name *" example="e.g. Central University Sierra Leone" value={form.institution_name}
                    onChange={e => update("institution_name", e.target.value)}
                    required />
                </div>
                  <div>
                    <AuthEmailField hint="Letters and numbers before @; start with a letter." label="Contact email *" example="registrar@institution.edu" type="email" value={form.contact_email} onChange={e => update("contact_email", e.target.value)} required />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <AuthCountrySelect value={form.country} onChange={value => update("country", value)} />
                  </div>

                  <div>
                    <AuthField autoCapitalize="words" label={form.country === "Sierra Leone" ? "Accreditation body (TEC)" : "Accreditation body"} example="Official authority name" value={form.accreditation_body} disabled={!form.country} readOnly={form.country === "Sierra Leone"} onChange={e => update("accreditation_body", e.target.value)} aria-describedby="registration-authority-help" />
                    <p id="registration-authority-help" className="text-xs text-[#536575] mt-2">{form.country === "Sierra Leone" ? "Automatically selected for Sierra Leone." : "Choose a country first; enter its official authority."}</p>
                  </div>
                  <div className={styles.fullWidthField}>
                    <AuthField label={form.country === "Sierra Leone" ? "TEC registration reference" : "Registration reference"} example="Copy from the official registration document" maxLength={100} value={form.registration_number} onChange={e => update("registration_number", e.target.value)} aria-describedby="registration-number-help" />
                    <p id="registration-number-help" className="text-xs text-[#536575] mt-2">Copy the official reference. Optional if unavailable.</p>
                  </div>
                  <div className="sm:col-span-2">
                    <AuthPhoneField callingCode={callingCode} onCodeChange={setCallingCode} number={form.contact_phone} onNumberChange={value => update("contact_phone", value)} />
                  </div>
                </div>
                <p className="text-xs text-[#536575]">Registration evidence is reviewed before platform access is granted.</p>
                <NavigationButton
                  disabled={!form.country || !form.institution_name || Boolean(emailValidationMessage(form.contact_email))}
                  onClick={e => { if (validateStep(e)) { setError(""); setStep(1); } }}
                  className="cd-btn-primary self-start disabled:opacity-40">
                  Continue →
                </NavigationButton>
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
                    <AuthField pattern={"[\\p{L}\\p{M} ]*\\p{L}[\\p{L}\\p{M} ]*"} autoCapitalize="words" label="First name *" example="e.g. Mariama" value={form.admin_first_name} onChange={e => update("admin_first_name", e.target.value)}  required />
                  </div>
                  <div>
                    <AuthField pattern={"[\\p{L}\\p{M} ]*\\p{L}[\\p{L}\\p{M} ]*"} autoCapitalize="words" label="Last name *" example="e.g. Kamara" value={form.admin_last_name} onChange={e => update("admin_last_name", e.target.value)}  required />
                  </div>
                  <div className="sm:col-span-2">
                    <AuthEmailField label="Admin email *" example="admin@institution.edu" type="email" value={form.admin_email} onChange={e => update("admin_email", e.target.value)}  required />
                  </div>
                </div>

                {/* Wallet */}
                <div className="border border-[#E4E1D6] rounded-xl p-4">
                  <span className="cd-label mb-2">Admin wallet *</span>

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
                      <ActionButton type="button" onClick={connectAndVerifyWallet}
                        disabled={walletBusy || !form.institution_name}
                        className="cd-btn-primary w-full disabled:opacity-50">
                        {walletBusy ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
                        {walletBusy ? "Confirm in MetaMask…" : "Connect Wallet & Sign"}
                      </ActionButton>
                    </>
                  )}
                </div>

                <div className="flex gap-3">
                  <NavigationButton direction="back" onClick={() => setStep(0)} className="cd-btn-secondary">← Back</NavigationButton>
                  <NavigationButton
                    disabled={!form.admin_first_name || !form.admin_last_name || Boolean(emailValidationMessage(form.admin_email)) || !walletVerified}
                    onClick={e => { if (validateStep(e)) { setError(""); setStep(2); } }}
                    className="cd-btn-primary disabled:opacity-40">
                    Review →
                  </NavigationButton>
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
                    ["Contact phone", form.contact_phone ? `+${callingCode}${form.contact_phone}` : "Not provided"],
                    ["Registration / accreditation body", form.accreditation_body || "—"],
                    [form.country === "Sierra Leone" ? "TEC registration reference" : "Registration reference", form.registration_number || "Not provided"],
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
                  <NavigationButton direction="back" onClick={() => setStep(1)} className="cd-btn-secondary">← Back</NavigationButton>
                  <button disabled={loading || !walletVerified} onClick={handleSubmit}
                    className="cred-btn cred-btn-primary disabled:opacity-60">
                    {loading && <Loader2 size={15} className="animate-spin" />}
                    {loading ? "Submitting…" : "Submit Application"}
                  </button>
                </div>
              </div>
            )}

          </div>
          )}

          </div>
        </AuthTransitionSurface>
      </div>
    </section>
    {walletStatus && <WalletStatusDialog status={walletStatus} onClose={() => setWalletStatus(null)} onSwitch={switchWalletAccount} />}
  </main>;
}
