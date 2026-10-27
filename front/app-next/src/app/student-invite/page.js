"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function StudentInvitationPage() {
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("token") || "";
    if (/^[A-Za-z0-9_-]+$/.test(value)) setToken(value);
    setReady(true);
  }, []);

  async function copyInvitation() {
    try {
      await navigator.clipboard.writeText(`credence://student-invite?token=${encodeURIComponent(token)}`);
      setMessage("Invitation copied. Open the app, choose Claim credential, and paste it.");
    } catch {
      setMessage("Copy the invitation from your address bar, then paste it under Claim credential in the app.");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#F8F7F2] px-6 py-12">
      <section className="w-full max-w-lg rounded-2xl border border-[#E4E1D6] bg-white p-8 text-[#08283F] shadow-sm">
        <p className="text-sm font-semibold text-[#B98A28]">Intelligent Academic Credentialing</p>
        <h1 className="mt-4 text-3xl font-semibold">Claim your credential</h1>
        {!ready ? <p className="mt-4" role="status">Opening your invitation...</p> : token ? <>
          <p className="mt-4 leading-7">Open this invitation in the Credence mobile app to access the credential issued by your institution.</p>
          <a href={`credence://student-invite?token=${encodeURIComponent(token)}`} className="mt-6 block rounded-lg bg-[#08283F] p-4 text-center font-semibold text-white">Open in Credence</a>
          <button type="button" onClick={copyInvitation} className="mt-3 w-full rounded-lg border border-[#E4E1D6] p-4 font-semibold">Copy invitation</button>
          <p className="mt-4 text-sm leading-6">If the app does not open, install your institution&apos;s Credence app, then paste this invitation under Claim credential. Keep your invitation private.</p>
          <p className="mt-3 text-sm" role="status">{message}</p>
        </> : <p className="mt-4" role="alert">This invitation is missing a valid token. Open the full link sent by your institution, or ask them to resend it.</p>}
        <Link href="/" className="mt-6 inline-block underline">Back to home</Link>
      </section>
    </main>
  );
}
