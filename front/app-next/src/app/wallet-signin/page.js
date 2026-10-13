"use client";
import { ActionButton } from "@/components/ui/AnimatedControls";
import NavigationButton from "@/components/ui/NavigationButton";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Navbar  from "@/components/Navbar";
import Footer  from "@/components/Footer";
import WalletSignIn from "@/components/WalletSignIn";

export default function WalletSignInPage() {
  const [error, setError] = useState("");

  function handleSuccess(data) {
    window.location.href = "/dashboard";
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2] flex flex-col">
      <Navbar />

      <main className="flex-1 flex flex-col items-center justify-center px-4 pt-28 pb-16">

        <div className="w-full max-w-md mb-6">
          <NavigationButton direction="back" href="/login" className="inline-flex items-center gap-2 text-[#43474e] text-sm font-medium hover:text-[#022448] transition-colors group">
            <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
            Back to login options
          </NavigationButton>
        </div>

        <div className="w-full max-w-md bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 p-8">

          <div className="flex items-center gap-3 mb-7">
            <div className="w-11 h-11 rounded-[10px] overflow-hidden shrink-0 shadow-sm">
              <Image src="/fav.png" alt="INTELLIGENT ACADEMIC CREDENTIALING" width={44} height={44} className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-[#022448] font-bold text-xl leading-tight">Wallet Sign In</h1>
              <p className="text-[#43474e] text-xs mt-0.5">For Institutional Admins & Registrars</p>
            </div>
          </div>

          <div className="h-px bg-[#c4c6cf]/20 mb-7" />

          <div className="bg-[#eef4ff] rounded-[10px] p-4 mb-6">
            <p className="text-[#022448] text-xs font-semibold mb-1">Who uses wallet sign-in?</p>
            <ul className="text-[#43474e] text-xs leading-relaxed space-y-0.5">
              <li>• Institutional Admins (after wallet binding)</li>
              <li>• Registrars (after on-chain authorization)</li>
            </ul>
          </div>

          <WalletSignIn onSuccess={handleSuccess} onError={setError} />

          <div className="h-px bg-[#c4c6cf]/20 mt-7 mb-5" />
          <p className="text-center text-[#43474e] text-xs">
            Not yet onboarded?{" "}
            <ActionButton href="/apply" className="mt-2">
              Apply for your institution
            </ActionButton>
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}

