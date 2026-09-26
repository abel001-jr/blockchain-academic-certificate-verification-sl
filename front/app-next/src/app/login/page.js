"use client";
import { useState } from "react";
import { Eye, EyeOff, Loader2, ArrowLeft, Wallet } from "lucide-react";
import Image from "next/image";
import Link  from "next/link";
import WalletSignIn from "@/components/WalletSignIn";

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
    <div className="min-h-screen bg-[#F8F7F2] flex">

      {/* ── Left brand panel (hidden on mobile) ── */}
      <div className="hidden lg:flex w-[420px] shrink-0 bg-[#08283F] flex-col justify-between px-10 py-12 relative overflow-hidden">
        <div className="absolute -right-16 -bottom-16 w-64 h-64 bg-[#B98A28]/20 rounded-full blur-3xl" />
        <div className="relative z-10">
          <div className="flex items-center gap-2.5 mb-14">
            <Image src="/logo.png" alt="Credence" width={32} height={32} className="rounded-lg" />
            <span className="text-white font-bold text-xl tracking-tight">Credence</span>
          </div>
          <h2 className="text-white font-bold text-3xl leading-snug mb-4">
            Academic Credential Verification
          </h2>
          <p className="text-white/65 text-base leading-relaxed">
            Blockchain-anchored credentials that anyone can verify independently — no phone calls, no waiting.
          </p>

          <div className="mt-10 flex flex-col gap-3">
            {[
              "Institutionally issued",
              "Tamper-evident fingerprint",
              "Independently verifiable",
            ].map(item => (
              <div key={item} className="flex items-center gap-3 text-white/80 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-[#B98A28] shrink-0" />
                {item}
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10">
          <p className="text-white/40 text-xs">Credence</p>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10">

        {/* Back link */}
        <div className="w-full max-w-sm mb-6">
          <Link href="/" className="inline-flex items-center gap-2 text-[#4A5A68] text-sm font-medium hover:text-[#08283F] transition-colors group">
            <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
            Back to home
          </Link>
        </div>

        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2.5 mb-7">
            <Image src="/logo.png" alt="Credence" width={32} height={32} className="rounded-lg" />
            <span className="text-[#08283F] font-bold text-xl">Credence</span>
          </div>

          <h1 className="text-[#08283F] font-bold text-2xl mb-1">Sign in</h1>
          <p className="text-[#4A5A68] text-sm mb-4">Institutional accounts only</p>

          {/* Which credential is which — the two methods are not interchangeable
              for long-term use, so say so before the user picks a tab. */}
          <div className="bg-[#EAF2FB] border border-[#CFE1F2] rounded-xl px-4 py-3 mb-5">
            <p className="text-[#08283F] text-sm leading-relaxed">
              <span className="font-semibold">Email and password</span> are a temporary login,
              issued to newly registered users so they can get in the first time.
            </p>
            <p className="text-[#08283F] text-sm leading-relaxed mt-1.5">
              <span className="font-semibold">MetaMask</span> is the main system authentication
              for regular users — your wallet is what proves who you are when you sign
              a credential on-chain.
            </p>
          </div>

          {/* Method toggle */}
          <div className="flex gap-1 bg-[#EAF2FB] p-1 rounded-xl mb-5">
            <button onClick={() => { setMethod("password"); setError(""); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                method === "password" ? "bg-white text-[#08283F] font-semibold shadow-sm" : "text-[#4A5A68]"
              }`}>
              Email & Password
            </button>
            <button onClick={() => { setMethod("wallet"); setError(""); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${
                method === "wallet" ? "bg-white text-[#08283F] font-semibold shadow-sm" : "text-[#4A5A68]"
              }`}>
              <Wallet size={13} /> MetaMask
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-[#F5E5E3] text-[#A23B34] text-sm px-4 py-3 rounded-lg mb-4 flex items-start gap-2">
              <span className="shrink-0 mt-0.5">⚠</span><span>{error}</span>
            </div>
          )}

          {/* Email + Password form */}
          {method === "password" && (
            <form
              onSubmit={handleSubmit}
              onPointerDownCapture={enableBrowserAutofill}
              onFocusCapture={enableBrowserAutofill}
              className="flex flex-col gap-4"
            >
              <div>
                <label className="cd-label">Email address</label>
                <input type="email" name="email" required readOnly={!autofillEnabled}
                  autoComplete={autofillEnabled ? "username" : "off"}
                  value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="admin@institution.edu" className="cd-input" />
              </div>
              <div>
                <label className="cd-label">Password</label>
                <div className="relative">
                  <input type={showPassword ? "text" : "password"} name="password" required readOnly={!autofillEnabled}
                    autoComplete={autofillEnabled ? "current-password" : "off"}
                    value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                    placeholder="••••••••" className="cd-input pr-11" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A929C] hover:text-[#08283F] p-1">
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading} className="cd-btn-primary w-full mt-1">
                {loading && <Loader2 size={15} className="animate-spin" />}
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
          )}

          {/* MetaMask form */}
          {method === "wallet" && (
            <div>
              <div className="bg-[#EAF2FB] border border-[#CFE1F2] rounded-xl px-4 py-3 mb-4">
                <p className="text-[#08283F] text-sm font-semibold mb-1">Who uses wallet sign-in?</p>
                <ul className="text-[#4A5A68] text-sm space-y-0.5">
                  <li>• Registrars (after on-chain anchor)</li>
                  <li>• VC / Dean (after setup)</li>
                </ul>
              </div>
              <WalletSignIn onSuccess={() => { window.location.href = "/dashboard"; }} onError={setError} />
            </div>
          )}

          {/* Footer links */}
          <div className="mt-6 pt-5 border-t border-[#E4E1D6] flex flex-col gap-2 text-center">
            <p className="text-[#4A5A68] text-sm">
              Institution seeking access?{" "}
              <Link href="/apply" className="text-[#B98A28] font-semibold hover:underline">Apply to join</Link>
            </p>
            <p className="text-[#4A5A68] text-sm">
              Verify a certificate?{" "}
              <Link href="/#verify" className="text-[#B98A28] font-semibold hover:underline">Go here</Link>
            </p>
            <p className="text-[#8A929C] text-xs mt-1 leading-relaxed">
              Super Admin accounts are created via Django Admin — not this form.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
