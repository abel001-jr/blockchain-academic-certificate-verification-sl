"use client";
import { useState } from "react";
import { Eye, EyeOff, Loader2, ArrowLeft, Wallet } from "lucide-react";
import Image from "next/image";
import Link  from "next/link";
import Navbar      from "@/components/Navbar";
import Footer      from "@/components/Footer";
import WalletSignIn from "@/components/WalletSignIn";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [form,         setForm]         = useState({ email: "", password: "" });
  const [error,        setError]        = useState("");
  const [method,       setMethod]       = useState("password"); // "password" | "wallet"

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = {
        email: form.email.trim().toLowerCase(),
        password: form.password,
      };
      const res  = await fetch("http://127.0.0.1:8000/api/auth/login/", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Invalid credentials. Please try again.");
        return;
      }
      if (!data.access) {
        setError("Login succeeded but no token was returned.");
        return;
      }
      localStorage.setItem("access_token",  data.access);
      localStorage.setItem("refresh_token", data.refresh);

      // Confirm JWT carries a role, then enter setup gate or dashboard
      try {
        const part = data.access.split(".")[1];
        const b64  = part.replace(/-/g, "+").replace(/_/g, "/");
        const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
        const claims = JSON.parse(atob(padded));
        if (!claims.role) {
          setError("Account has no CREDENCE role. Set Role in Django Admin.");
          return;
        }
        if (data.setup_required || claims.token_use === "officer_setup") {
          window.location.href = "/setup";
          return;
        }
      } catch {
        // Still redirect — dashboard will re-check the token
      }
      window.location.href = "/dashboard";
    } catch {
      setError("Unable to reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleWalletSuccess() {
    window.location.href = "/dashboard";
  }

  const inp = "w-full bg-[#eef4ff] border border-transparent focus:border-[#022448] focus:bg-white rounded-[10px] px-4 py-3.5 text-sm text-[#121c28] outline-none transition-all placeholder:text-[#74777f]";
  const lbl = "text-[#022448] text-xs font-semibold uppercase tracking-widest";

  return (
    <div className="min-h-screen bg-[#FAF7F2] flex flex-col">
      <Navbar />

      <main className="flex-1 flex flex-col items-center justify-center px-4 pt-28 pb-16">

        {/* Back */}
        <div className="w-full max-w-md mb-6">
          <Link href="/" className="inline-flex items-center gap-2 text-[#43474e] text-sm font-medium hover:text-[#022448] transition-colors group">
            <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
            Back to home
          </Link>
        </div>

        <div className="w-full max-w-md bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 p-8">

          {/* Logo */}
          <div className="flex items-center gap-3 mb-7">
            <div className="w-11 h-11 rounded-[10px] overflow-hidden shrink-0 shadow-sm">
              <Image src="/logo.png" alt="CREDENCE" width={44} height={44} className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="text-[#022448] font-bold text-xl leading-tight">Sign In</h1>
              <p className="text-[#43474e] text-xs mt-0.5">
                Existing accounts only — there is no public Super Admin signup
              </p>
            </div>
          </div>

          <div className="h-px bg-[#c4c6cf]/20 mb-6" />

          {/* Method toggle */}
          <div className="flex gap-1 bg-[#eef4ff] p-1 rounded-[12px] mb-6">
            <button
              onClick={() => { setMethod("password"); setError(""); }}
              className={`flex-1 py-2 rounded-[10px] text-sm font-medium transition-all ${
                method === "password" ? "bg-white text-[#022448] font-semibold shadow-sm" : "text-[#43474e]"
              }`}
            >
              Email & Password
            </button>
            <button
              onClick={() => { setMethod("wallet"); setError(""); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-[10px] text-sm font-medium transition-all ${
                method === "wallet" ? "bg-white text-[#022448] font-semibold shadow-sm" : "text-[#43474e]"
              }`}
            >
              <Wallet size={14} /> MetaMask
            </button>
          </div>

          {error && (
            <div className="bg-[#ffdad6] text-[#93000a] text-sm px-4 py-3 rounded-lg mb-5 flex items-start gap-2">
              <span className="mt-0.5 shrink-0">⚠</span>
              <span>{error}</span>
            </div>
          )}

          {/* ── Password method ── */}
          {method === "password" && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <label className={lbl}>Email Address</label>
                <input type="email" required autoComplete="email"
                  value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="admin@institution.edu" className={inp}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={lbl}>Password</label>
                <div className="relative">
                  <input type={showPassword ? "text" : "password"} required autoComplete="current-password"
                    value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                    placeholder="••••••••"
                    className={inp + " pr-12"}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#74777f] hover:text-[#022448] transition-colors p-1"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading}
                className="bg-[#022448] text-white py-4 rounded-[14px] font-semibold text-sm hover:opacity-90 transition-all active:scale-95 flex items-center justify-center gap-2 mt-1 disabled:opacity-60"
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                {loading ? "Signing in…" : "Sign In"}
              </button>
            </form>
          )}

          {/* ── Wallet method ── */}
          {method === "wallet" && (
            <div>
              <div className="bg-[#eef4ff] rounded-[10px] p-3 mb-5">
                <p className="text-[#022448] text-xs font-semibold mb-1">Wallet sign-in is for:</p>
                <ul className="text-[#43474e] text-xs leading-relaxed space-y-0.5">
                  <li>• Registrars (after on-chain anchor)</li>
                  <li>• VC / Chancellor (after setup + on-chain authorization)</li>
                </ul>
              </div>
              <WalletSignIn onSuccess={handleWalletSuccess} onError={setError} />
            </div>
          )}

          <div className="h-px bg-[#c4c6cf]/20 mt-7 mb-5" />
          <div className="flex flex-col gap-2 text-center">
            <p className="text-[#43474e] text-xs">
              Institution seeking access?{" "}
              <Link href="/apply" className="text-[#7b5900] font-semibold hover:underline">
                Apply to join the network
              </Link>
            </p>
            <p className="text-[#74777f] text-[11px] leading-relaxed">
              Super Admin accounts are created by the platform operator in Django Admin — not via this form.
            </p>
            <p className="text-[#43474e] text-xs">
              To verify a certificate,{" "}
              <Link href="/#verify" className="text-[#7b5900] font-semibold hover:underline">
                go here
              </Link>
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
