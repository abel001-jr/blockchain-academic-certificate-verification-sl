"use client";
import { ActionButton } from "@/components/ui/AnimatedControls";

import { useState } from "react";
import { Palette, Check, RotateCcw } from "lucide-react";
import { THEMES, useDashboardTheme } from "./DashboardThemeProvider";

export default function SystemBrandingPanel() {
  const { theme, chooseTheme } = useDashboardTheme();
  const [message, setMessage] = useState("");
  function select(id) {
    const saved = chooseTheme(id);
    const name = THEMES.find(item => item.id === id).name;
    setMessage(saved ? `${name} applied and saved for this browser.` : `${name} applied for this session. Browser storage is unavailable.`);
  }
  return <section className="space-y-6" aria-labelledby="system-branding-title">
    <div><h3 id="system-branding-title" className="flex items-center gap-2 text-xl font-semibold text-[#08283F]"><Palette size={22} /> System Branding</h3><p className="mt-2 text-sm text-[#4A5A68]">Choose the dashboard colors you prefer. Changes apply immediately to navigation, headings and primary controls, and stay selected when you return in this browser.</p><p className="mt-2 text-xs text-[#687B8E]">This is your browser&apos;s appearance preference. Certificate artwork and other users&apos; settings keep their own configuration. Success, warning and error colors keep their meaning.</p></div>
    {message && <p role="status" className="rounded-lg border border-[#B6D9C4] bg-[#EFFAF3] p-3 text-sm text-[#245C3E]">{message}</p>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" role="group" aria-label="Dashboard theme presets">
      {THEMES.map(item => <button key={item.id} type="button" aria-pressed={theme.id === item.id} onClick={() => select(item.id)} className="overflow-hidden rounded-xl border-2 bg-white text-left transition-shadow hover:shadow-md" style={{borderColor: theme.id === item.id ? item.primary : "#D8DEE6"}}>
        <div className="flex h-28 p-3" style={{background: item.paper}} aria-hidden="true"><div className="w-9 rounded-l-md p-2" style={{background: item.primary}}><div className="mb-2 h-2 rounded bg-white/70" /><div className="h-5 rounded" style={{background: item.accent}} /></div><div className="flex-1 rounded-r-md bg-white p-3"><div className="mb-3 h-2 w-2/3 rounded" style={{background: item.primary}} /><div className="mb-2 h-3 rounded" style={{background: item.tint}} /><div className="h-5 w-20 rounded" style={{background: item.primary}} /></div></div>
        <div className="flex items-center justify-between px-4 py-3"><span className="font-semibold" style={{color: item.primary}}>{item.name}</span>{theme.id === item.id && <Check size={19} style={{color: item.primary}} />}</div>
      </button>)}
    </div>
    <ActionButton type="button" onClick={() => select("navy")} disabled={theme.id === "navy"} className="cred-btn cred-btn-primary inline-flex items-center gap-2 disabled:opacity-50"><RotateCcw size={16} /> Restore Credence Navy</ActionButton>
  </section>;
}
