"use client";
import NavigationButton from "@/components/ui/NavigationButton";

import { ActionButton } from "@/components/ui/AnimatedControls";

/**
 * Officer setup gate — only screen reachable with a limited setup JWT.
 * 1) Connect MetaMask + sign nonce
 * 2) Set permanent password
 * Then wait for Registrar on-chain authorization.
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Loader2, Wallet, KeyRound, CheckCircle2, Shield, PenLine } from "lucide-react";
import { clearSession, jwtPayload } from "@/lib/api";
import { connectWallet, signMessage } from "@/lib/walletActions";
import OfficerSignaturePanel from "@/components/dashboard/OfficerSignaturePanel";

const BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000/api";

function authHeaders() {
  const t = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  return {
    "Content-Type": "application/json",
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  };
}

function StepNumber({ num, done, active }) {
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold shrink-0 transition-all ${
      done   ? "bg-[#2F6F4E] text-white"
      : active ? "bg-[#08283F] text-white"
      : "bg-[#E4E1D6] text-[#4A5A68]"
    }`}>
      {done ? <CheckCircle2 size={16} /> : <span className="text-sm">{num}</span>}
    </div>
  );
}

export default function OfficerSetupPage() {
  const [ready,        setReady]        = useState(false);
  const [profile,      setProfile]      = useState(null);
  const [error,        setError]        = useState("");
  const [walletBusy,   setWalletBusy]   = useState(false);
  const [walletDone,   setWalletDone]   = useState(false);
  const [walletAddr,   setWalletAddr]   = useState("");
  const [password,     setPassword]     = useState("");
  const [password2,    setPassword2]    = useState("");
  const [pwBusy,       setPwBusy]       = useState(false);
  const [passwordDone, setPasswordDone] = useState(false);
  const [signatureDone,setSignatureDone]= useState(false);
  const [complete,     setComplete]     = useState(false);

  useEffect(() => {
    const claims = jwtPayload();
    if (!claims) { window.location.href = "/login"; return; }
    if (claims.token_use !== "officer_setup") { window.location.href = "/dashboard"; return; }

    fetch(`${BASE}/auth/me/`, { headers: authHeaders() })
      .then(async (res) => {
        if (res.status === 401) { clearSession(); window.location.href = "/login"; return; }
        const data = await res.json();
        setProfile(data);
        if (data.wallet_verified) {
          setWalletDone(true);
          setWalletAddr(data.wallet_address || "");
        }
        if (data.wallet_verified && !data.must_change_password) {
          setPasswordDone(true);
          if (data.has_signature) { setSignatureDone(true); setComplete(true); }
        }
        setReady(true);
      })
      .catch(() => { setError("Unable to load setup session."); setReady(true); });
  }, []);

  async function connectAndVerifyWallet() {
    setError("");
    setWalletBusy(true);
    try {
      const address = await connectWallet();
      setWalletAddr(address);

      const chRes = await fetch(`${BASE}/auth/officer-setup/wallet/challenge/`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ address }),
      });
      const chData = await chRes.json();
      if (!chRes.ok) throw new Error(chData.detail || "Challenge failed.");

      const { signature } = await signMessage(chData.message, address);

      const vRes = await fetch(`${BASE}/auth/officer-setup/wallet/verify/`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ address, signature }),
      });
      const vData = await vRes.json();
      if (!vRes.ok) throw new Error(vData.detail || "Wallet verification failed.");

      setWalletDone(true);
      setProfile(vData.user);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setWalletBusy(false);
    }
  }

  async function setPermanentPassword(e) {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== password2) { setError("Passwords do not match."); return; }
    setPwBusy(true);
    try {
      const res  = await fetch(`${BASE}/auth/officer-setup/password/`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not set password.");
      setPasswordDone(true);
      setProfile(data.user);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setPwBusy(false);
    }
  }

  function finishAndLogout() { clearSession(); window.location.href = "/login"; }
  function finishSetup()     { setComplete(true); }

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#F8F7F2] flex items-center justify-center">
        <Loader2 className="animate-spin text-[#08283F]" size={28} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F7F2] flex flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-md bg-white rounded-xl shadow-card border border-[#E4E1D6]/50 p-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 shadow-sm">
            <Image src="/fav.png" alt="Intelligent Academic Credentialing" width={44} height={44} className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-[#08283F] font-bold text-2xl leading-tight">Officer setup</h1>
            <p className="text-[#4A5A68] text-sm mt-0.5">
              {profile?.full_name || "Officer"} · limited session
            </p>
          </div>
        </div>

        {/* Info banner */}
        <div className="bg-[#EAF2FB] border border-[#CFE1F2] rounded-xl p-4 mb-6 flex gap-3 items-start">
          <Shield size={17} className="text-[#08283F] mt-0.5 shrink-0" />
          <p className="text-[#4A5A68] text-sm leading-relaxed">
            Connect MetaMask and sign a free challenge (no gas), then set a permanent password.
            This screen is the only one available until setup is complete.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-[#F5E5E3] text-[#A23B34] text-sm px-4 py-3 rounded-lg mb-5 break-all">
            {error}
          </div>
        )}

        {/* Step 1 — Wallet */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <StepNumber num={1} done={walletDone} active={!walletDone} />
            <h2 className="text-[#08283F] text-base font-semibold">Connect & verify wallet</h2>
          </div>
          <div className="pl-11">
            {walletDone ? (
              <p className="text-[#2F6F4E] text-sm font-mono break-all">{walletAddr}</p>
            ) : (
              <ActionButton
                type="button"
                onClick={connectAndVerifyWallet}
                disabled={walletBusy}
                className="cd-btn-primary disabled:opacity-50"
              >
                {walletBusy ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
                {walletBusy ? "Verifying…" : "Connect Wallet"}
              </ActionButton>
            )}
          </div>
        </div>

        {/* Step 2 — Password */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <StepNumber num={2} done={passwordDone} active={walletDone && !passwordDone} />
            <h2 className="text-[#08283F] text-base font-semibold">Set permanent password</h2>
          </div>
          <div className="pl-11">
            {passwordDone ? (
              <p className="text-[#2F6F4E] text-sm">Permanent password saved.</p>
            ) : (
              <form onSubmit={setPermanentPassword} className="flex flex-col gap-3">
                <input
                  type="password" required minLength={8} disabled={!walletDone}
                  placeholder="New password (min 8 characters)"
                  className="cd-input"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
                <input
                  type="password" required minLength={8} disabled={!walletDone}
                  placeholder="Confirm password"
                  className="cd-input"
                  value={password2}
                  onChange={e => setPassword2(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={!walletDone || pwBusy}
                  className="cred-btn cred-btn-primary self-start disabled:opacity-50"
                >
                  {pwBusy ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
                  Save password
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Step 3 — Signature */}
        {passwordDone && !complete && (
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <StepNumber num={3} done={signatureDone} active={passwordDone && !signatureDone} />
              <h2 className="text-[#08283F] text-base font-semibold">Add your signature</h2>
            </div>
            <div className="pl-11">
              <OfficerSignaturePanel
                compact
                allowSkip
                defaultName={profile?.full_name || ""}
                onSaved={() => { setSignatureDone(true); finishSetup(); }}
                onSkip={finishSetup}
              />
            </div>
          </div>
        )}

        {/* Done state */}
        {complete && (
          <div className="pl-11 space-y-4 mb-2">
            <p className="text-[#2F6F4E] text-sm font-semibold">Setup complete. Your temporary password is retired.</p>
            <p className="text-[#4A5A68] text-sm leading-relaxed">
              Wait for your Registrar to authorize your wallet on-chain. After that,
              sign in with <strong>MetaMask only</strong>.
              {!signatureDone && <> You can add your certificate signature later in Settings.</>}
            </p>
            <NavigationButton direction="back"
              type="button"
              onClick={finishAndLogout}
              className="cd-btn-primary"
              style={{ background: "#B98A28" }}
            >
              Return to sign in
            </NavigationButton>
          </div>
        )}

        <div className="h-px bg-[#E4E1D6] mt-7 mb-4" />
        <p className="text-center text-[#8A929C] text-xs">
          Wrong account?{" "}
          <Link href="/login" onClick={() => clearSession()} className="text-[#B98A28] font-semibold hover:underline">
            Sign out
          </Link>
        </p>
      </div>
    </div>
  );
}
