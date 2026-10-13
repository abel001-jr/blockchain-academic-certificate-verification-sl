"use client";
import { useEffect, useId, useRef, useState } from "react";
export default function GraduateEmailInput({ value, onChange, domain, studentName = "", nameParts }) {
  const input = useRef(null);
  const [notice, setNotice] = useState("");
  const id = useId();
  const normalizedDomain = domain?.trim().toLowerCase().replace(/^[.@]+/, "");
  const matchesDomain = normalizedDomain && value.toLowerCase().endsWith(`@${normalizedDomain}`);
  const local = matchesDomain ? value.slice(0, value.lastIndexOf("@")) : value;
  const error = normalizedDomain && value && (!matchesDomain || !local || /[\s@]/.test(local)) ? `Use the institution's @${normalizedDomain} domain. Other domains are not allowed.` : "";
  useEffect(() => { input.current?.setCustomValidity(error); }, [error]);
  const clean = name => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
  const words = studentName.trim().split(/\s+/).filter(Boolean);
  const surname = nameParts ? nameParts.surname : (words.length > 1 ? words.pop() : "");
  const given = nameParts ? [nameParts.first, ...nameParts.other.trim().split(/\s+/)] : words;
  const suggested = surname && given[0] ? given.filter(Boolean).map(name => clean(name).charAt(0)).join("") + clean(surname) : "";
  return <div><div className="flex items-center rounded-xl border border-[var(--cd-line)] bg-[var(--cd-tint)] focus-within:ring-2 focus-within:ring-[var(--cd-primary)]"><input ref={input} type={normalizedDomain ? "text" : "email"} style={{background: "transparent", border: 0, boxShadow: "none"}} className="cd-input min-w-0 flex-1" required maxLength={254} value={local} onChange={e => {
    const entered = e.target.value;
    if (normalizedDomain && /[^a-zA-Z0-9._+\-]/.test(entered)) { setNotice("Enter only the email username, using letters, numbers, dots, underscores, plus or hyphens. The @domain is already provided."); return; }
    setNotice(""); onChange(entered && normalizedDomain && !entered.includes("@") ? `${entered}@${normalizedDomain}` : entered);
  }} placeholder={normalizedDomain ? "graduate email name" : "graduate@example.edu.sl"} aria-label="Graduate email" aria-invalid={Boolean(error)} aria-describedby={id} />{normalizedDomain && <span className="shrink-0 pr-4 text-sm font-semibold text-[var(--cd-primary)]">@{normalizedDomain}</span>}</div>
    {normalizedDomain && suggested && !value && <button type="button" className="mt-2 text-xs text-[#08283F] underline" onClick={() => onChange(`${suggested}@${normalizedDomain}`)}>Use {suggested}@{normalizedDomain}</button>}
    <p id={id} role={error || notice ? "alert" : undefined} className={`mt-1 text-xs ${error || notice ? "text-red-700" : "text-[#687B8E]"}`}>{notice || error || (normalizedDomain ? `Enter the graduate's email name. Only @${normalizedDomain} addresses are accepted.` : "Confirm the graduate's actual email address.")}</p>
  </div>;
}
