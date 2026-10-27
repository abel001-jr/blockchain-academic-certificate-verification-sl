"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "@/lib/useAuth";

export default function WelcomeBackToast() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(true);
  const name = user?.first_name?.trim();

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 6000);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-6 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm items-start gap-4 rounded-xl border border-[#c4c6cf] bg-[#F8F7F2] p-5 text-[#022448] shadow-lg sm:right-6">
      <div role="status" aria-live="polite" className="flex-1">
        <p className="text-sm font-semibold">Welcome back{name ? `, ${name}` : ""}!</p>
        <p className="mt-1 text-sm">Your dashboard is ready. Pick up where you left off.</p>
      </div>
      <button type="button" aria-label="Dismiss welcome message" onClick={() => setVisible(false)} className="rounded p-1 focus-visible:outline-2 focus-visible:outline-offset-2">
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
