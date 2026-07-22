"use client";
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
import { jwtPayload } from "@/lib/api";
import { connectWallet, signMessage } from "@/lib/walletActions";
import OfficerSignaturePanel from "@/components/dashboard/OfficerSignaturePanel";

const BASE = "http://127.0.0.1:8000/api";

function authHeaders() {
  const t = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  return {
    "Content-Type": "application/json",
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  };
}

export default function OfficerSetupPage() {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletDone, setWalletDone] = useState(false);
  const [walletAddr, setWalletAddr] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [passwordDone, setPasswordDone] = useState(false);
  const [signatureDone, setSignatureDone] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const claims = jwtPayload();
    if (!claims) {
      window.location.href = "/login";
      return;
    }
    if (claims.token_use !== "officer_setup") {
      window.location.href = "/dashboard";
      return;
    }
    fetch(`${BASE}/auth/me/`, { headers: authHeaders() })
      .then(async (res) => {
        if (res.status === 401) {
          localStorage.clear();
          window.location.href = "/login";
          return;
        }
        const data = await res.json();
        setProfile(data);
        if (data.wallet_verified) {
          setWalletDone(true);
          setWalletAddr(data.wallet_address || "");
        }
        if (data.wallet_verified && !data.must_change_password) {
          setPasswordDone(true);
          if (data.has_signature) {
            setSignatureDone(true);
            setComplete(true);
          }
        }
        setReady(true);
      })
      .catch(() => {
        setError("Unable to load setup session.");
        setReady(true);
      });
  }, []);

  async function connectAndVerifyWallet() {
    setError("");
    setWalletBusy(true);
    try {
      const address = await connectWallet();
      setWalletAddr(address);

      const chRes = await fetch(`${BASE}/auth/officer-setup/wallet/challenge/`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ address }),
      });
      const chData = await chRes.json();
      if (!chRes.ok) throw new Error(chData.detail || "Challenge failed.");

      const { signature } = await signMessage(chData.message, address);

      const vRes = await fetch(`${BASE}/auth/officer-setup/wallet/verify/`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ address, signature }),
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
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== password2) {
      setError("Passwords do not match.");
      return;
    }
    setPwBusy(true);
    try {
      const res = await fetch(`${BASE}/auth/officer-setup/password/`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ password }),
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

  function finishAndLogout() {
    localStorage.clear();
    window.location.href = "/login";
  }

  function finishSetup() {
    setComplete(true);
  }

  const inp =
    "w-full bg-[#eef4ff] border border-transparent focus:border-[#022448] focus:bg-white rounded-[10px] px-4 py-3.5 text-sm text-[#121c28] outline-none";

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center">
        <Loader2 className="animate-spin text-[#022448]" size={28} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2] flex flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-md bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-[10px] overflow-hidden shrink-0 shadow-sm">
            <Image src="/logo.png" alt="CREDENCE" width={44} height={44} className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-[#022448] font-bold text-xl leading-tight">Officer Setup</h1>
            <p className="text-[#43474e] text-xs mt-0.5">
              {profile?.full_name || "Officer"} · limited session
            </p>
          </div>
        </div>

        <div className="bg-[#eef4ff] rounded-[10px] p-3 mb-6 flex gap-2 items-start">
          <Shield size={16} className="text-[#022448] mt-0.5 shrink-0" />
          <p className="text-[#43474e] text-xs leading-relaxed">
            This is the only screen available until setup is finished. Connect MetaMask and
            sign a free challenge (no gas), then set a permanent password (off-chain).
          </p>
        </div>

        {error && (
          <div className="bg-[#ffdad6] text-[#93000a] text-sm px-4 py-3 rounded-lg mb-5 break-all">
            {error}
          </div>
        )}

        {/* Step 1 — Wallet */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
              walletDone ? "bg-[#2E7D32] text-white" : "bg-[#022448] text-white"
            }`}>
              {walletDone ? <CheckCircle2 size={14} /> : "1"}
            </span>
            <h2 className="text-[#022448] text-sm font-semibold">Connect & verify wallet</h2>
          </div>
          {walletDone ? (
            <p className="text-[#2E7D32] text-xs font-mono break-all pl-8">{walletAddr}</p>
          ) : (
            <button
              type="button"
              onClick={connectAndVerifyWallet}
              disabled={walletBusy}
              className="ml-8 flex items-center gap-2 bg-[#022448] text-white px-5 py-3 rounded-[12px] text-sm font-semibold disabled:opacity-50"
            >
              {walletBusy ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
              {walletBusy ? "Verifying…" : "Connect Wallet"}
            </button>
          )}
        </div>

        {/* Step 2 — Password */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
              passwordDone ? "bg-[#2E7D32] text-white" : walletDone ? "bg-[#022448] text-white" : "bg-[#c4c6cf] text-white"
            }`}>
              {passwordDone ? <CheckCircle2 size={14} /> : "2"}
            </span>
            <h2 className="text-[#022448] text-sm font-semibold">Set permanent password</h2>
          </div>

          {passwordDone ? (
            <p className="text-[#2E7D32] text-xs pl-8">Permanent password saved.</p>
          ) : (
            <form onSubmit={setPermanentPassword} className="pl-8 flex flex-col gap-3">
              <input
                type="password"
                required
                minLength={8}
                disabled={!walletDone}
                placeholder="New password (min 8)"
                className={inp + " disabled:opacity-50"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <input
                type="password"
                required
                minLength={8}
                disabled={!walletDone}
                placeholder="Confirm password"
                className={inp + " disabled:opacity-50"}
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
              />
              <button
                type="submit"
                disabled={!walletDone || pwBusy}
                className="self-start flex items-center gap-2 bg-[#7b5900] text-white px-5 py-3 rounded-[12px] text-sm font-semibold disabled:opacity-50"
              >
                {pwBusy ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
                Save password
              </button>
            </form>
          )}
        </div>

        {/* Step 3 — Signature (VC / Chancellor only) */}
        {passwordDone && !complete && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                signatureDone ? "bg-[#2E7D32] text-white" : "bg-[#022448] text-white"
              }`}>
                {signatureDone ? <CheckCircle2 size={14} /> : <PenLine size={14} />}
              </span>
              <h2 className="text-[#022448] text-sm font-semibold">Add your signature</h2>
            </div>
            <div className="pl-8">
              <OfficerSignaturePanel
                compact
                allowSkip
                defaultName={profile?.full_name || ""}
                onSaved={() => {
                  setSignatureDone(true);
                  finishSetup();
                }}
                onSkip={finishSetup}
              />
            </div>
          </div>
        )}

        {/* Done */}
        {complete && (
          <div className="mb-2 pl-8 space-y-4">
            <p className="text-[#2E7D32] text-sm">
              Setup complete. Your temporary password is retired.
            </p>
            <p className="text-[#43474e] text-xs leading-relaxed">
              Wait for your Registrar to authorize your wallet on-chain. After that,
              sign in with <strong>MetaMask only</strong>.
              {!signatureDone && (
                <> You can add your certificate signature later in Settings.</>
              )}
            </p>
            <button
              type="button"
              onClick={finishAndLogout}
              className="bg-[#7b5900] text-white px-5 py-3 rounded-[12px] text-sm font-semibold"
            >
              Return to sign in
            </button>
          </div>
        )}

        <div className="h-px bg-[#c4c6cf]/20 mt-7 mb-4" />
        <p className="text-center text-[#74777f] text-[11px]">
          Wrong account?{" "}
          <Link href="/login" onClick={() => localStorage.clear()} className="text-[#7b5900] font-semibold hover:underline">
            Sign out
          </Link>
        </p>
      </div>
    </div>
  );
}
