"use client";
import NavigationButton from "@/components/ui/NavigationButton";
import { ActionButton } from "@/components/ui/AnimatedControls";

import { useState } from "react";
import { Eye, EyeOff, Loader2, ArrowLeft, Wallet } from "lucide-react";
import Image from "next/image";
import Link  from "next/link";
import WalletSignIn from "@/components/WalletSignIn";
import styles from "./LoginSwitch.module.css";
import AuthField from "@/components/AuthField";
import { AuthTransitionLink, AuthTransitionSurface } from "@/components/AuthRouteTransition";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000/api";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [form,         setForm]         = useState({ email: "", password: "" });
  const [error,        setError]        = useState("");
  const [method,       setMethod]       = useState("password");
  const [autofillEnabled, setAutofillEnabled] = useState(false);

  function enableBrowserAutofill() {
    setAutofillEnabled(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    // Read the form controls directly so browser password-manager autofill is
    // submitted even when Chrome does not dispatch React's change event.
    const submitted = new FormData(e.currentTarget);
    const email = String(submitted.get("email") || "").trim().toLowerCase();
    const password = String(submitted.get("password") || "");
    setForm({ email, password });
    setLoading(true); setError("");
    try {
      const res  = await fetch(`${API_BASE}/auth/login/`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Invalid credentials."); return; }
      if (!data.access) { setError("Login succeeded but no token was returned."); return; }

      localStorage.setItem("access_token",  data.access);
      localStorage.setItem("refresh_token", data.refresh);

      try {
        const part   = data.access.split(".")[1];
        const b64    = part.replace(/-/g, "+").replace(/_/g, "/");
        const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
        const claims = JSON.parse(atob(padded));
        if (!claims.role)  { setError("Account has no CREDENCE role."); return; }
        if (data.setup_required || claims.token_use === "officer_setup") {
          window.location.href = "/setup"; return;
        }
      } catch { /* redirect anyway */ }
      window.location.href = "/dashboard";
    } catch { setError("Unable to reach the server. Please try again."); }
    finally  { setLoading(false); }
  }

  return (
    /* Full-viewport split: left brand panel + right form */
    <div className={`${styles.page} bg-[#F8F7F2] flex`}>

      {/* ── Left brand panel (hidden on mobile) ── */}
      <div className={`${styles.sidebar} hidden lg:flex shrink-0 bg-[#08283F] flex-col justify-between relative overflow-hidden`}>
        <div className="absolute -right-16 -bottom-16 w-64 h-64 bg-[#B98A28]/20 rounded-full blur-3xl" />
        <div className="relative z-10">
          <div className="flex items-center gap-2.5 mb-8">
            <Image src="/fav.png" alt="Credence" width={32} height={32} className="rounded-lg" />
            <span className="text-white font-bold text-xl tracking-tight">Credence</span>
          </div>
          <h2 className="text-white font-bold text-2xl leading-snug mb-3">
            Academic Credential Verification
          </h2>
          <p className="text-white/65 text-base leading-relaxed">
            Blockchain-anchored credentials that anyone can verify independently — no phone calls, no waiting.
          </p>

          <div className="mt-6 pt-5 border-t border-white/15">
            <h3 className="text-white text-sm font-semibold mb-3">Institutional staff sign-in</h3>
            <ol className="space-y-3 text-sm text-white/65 leading-relaxed list-decimal pl-4">
              <li>Start with your temporary email credentials.</li>
              <li>Complete setup and verify your wallet.</li>
              <li>Use MetaMask for future sign-ins. No gas fee.</li>
            </ol>
          </div>
        </div>
        <div className="relative z-10">
          <p className="text-white/40 text-xs">Credence</p>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className={`${styles.workspace} flex-1 flex flex-col items-center justify-center`}>

        {/* Back link */}
        <div className="w-full max-w-4xl mb-3">
          <NavigationButton direction="back" href="/" className="inline-flex items-center gap-2 text-[#4A5A68] text-sm font-medium hover:text-[#08283F] transition-colors group">
            <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
            Back to home
          </NavigationButton>
        </div>

        <div className="w-full max-w-4xl">

          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2.5 mb-3">
            <Image src="/fav.png" alt="Credence" width={32} height={32} className="rounded-lg" />
            <span className="text-[#08283F] font-bold text-xl">Credence</span>
          </div>

          <h1 className="text-[#08283F] font-bold text-2xl mb-1">Sign in</h1>
          <p className="text-[#4A5A68] text-sm mb-4">Institutional accounts only</p>

          {error && <p className="bg-[#F5E5E3] text-[#A23B34] text-sm px-4 py-3 rounded-lg mb-4" role="alert">{error}</p>}
          <AuthTransitionSurface className={`${styles.card} ${method === "wallet" ? styles.wallet : ""}`}>
            <div className={styles.background} aria-hidden="true" />
            <aside className={`${styles.hero} ${styles.emailHero}`} inert={method !== "password"} aria-hidden={method !== "password"}>
              <Wallet size={30} strokeWidth={1.5} />
              <h2>Already set up?</h2>
              <p>Sign in with the MetaMask wallet linked to your institutional account.</p>
              <button type="button" className="cred-btn cred-btn-secondary cred-btn-inverse" onClick={() => { setMethod("wallet"); setError(""); }}>Use MetaMask</button>
              <span>Sign a message. No gas fee.</span>
            </aside>
            <section className={`${styles.panel} ${styles.emailPanel}`} inert={method !== "password"} aria-hidden={method !== "password"}>
              <h2>Email &amp; password</h2>
              <p className={styles.description}>Sign in with your account email and password. Newly invited institutional staff can use their temporary credentials.</p>
            <form
              onSubmit={handleSubmit}
              onPointerDownCapture={enableBrowserAutofill}
              onFocusCapture={enableBrowserAutofill}
              className="flex flex-col gap-4"
            >
              <AuthField label="Email address" example="you@institution.edu" id="login-email" type="email" name="email" required readOnly={!autofillEnabled}
                autoComplete={autofillEnabled ? "username" : "off"} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              <AuthField label="Password" example="Enter your password" id="login-password" type={showPassword ? "text" : "password"} name="password" required readOnly={!autofillEnabled}
                autoComplete={autofillEnabled ? "current-password" : "off"} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}>
                <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button>
              </AuthField>
              <button type="submit" disabled={loading} className="cred-btn cred-btn-primary w-full mt-1">
                {loading && <Loader2 size={15} className="animate-spin" />}
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
              <p className={styles.joinPrompt}>Institution new here? <ActionButton as={AuthTransitionLink} href="/apply" className="mt-2">Apply to join</ActionButton></p>
            </section>
            <aside className={`${styles.hero} ${styles.walletHero}`} inert={method !== "wallet"} aria-hidden={method !== "wallet"}>
              <h2>First time here?</h2>
              <p>Use the email and temporary password supplied by your administrator to complete setup.</p>
              <button type="button" className="cred-btn cred-btn-secondary cred-btn-inverse" onClick={() => { setMethod("password"); setError(""); }}>Use email &amp; password</button>
              <span>Your wallet becomes your regular sign-in.</span>
            </aside>
            <section className={`${styles.panel} ${styles.walletPanel}`} inert={method !== "wallet"} aria-hidden={method !== "wallet"}>
              <h2>MetaMask sign in</h2>
              <p className={styles.description}>Connect your bound wallet, then approve the sign-in message in MetaMask.</p>
              <WalletSignIn onSuccess={() => { window.location.href = "/dashboard"; }} />
              <p className={styles.joinPrompt}>Institution new here? <ActionButton as={AuthTransitionLink} href="/apply" className="mt-2">Apply to join</ActionButton></p>
            </section>
          </AuthTransitionSurface>

        </div>
      </div>
    </div>
  );
}
