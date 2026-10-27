"use client";
import { useId, useState } from "react";

export default function GraduateEmailInput({ value, onChange, domain }) {
  const id = useId();
  const [selectedType, setSelectedType] = useState(null);
  const normalizedDomain = domain?.trim().toLowerCase().replace(/^[.@]+/, "");
  const suffix = normalizedDomain ? `@${normalizedDomain}` : "";
  const matchesSchool = Boolean(suffix && value?.toLowerCase().endsWith(suffix));
  const emailType = selectedType || (matchesSchool ? "school" : "personal");
  const school = emailType === "school";
  const username = matchesSchool ? value.slice(0, -suffix.length) : value || "";

  return <div>
    <label htmlFor={`${id}-type`} className="sr-only">Student email type</label>
    <select id={`${id}-type`} className="cd-input mb-2 w-full" value={emailType}
      onChange={event => { setSelectedType(event.target.value); onChange(""); }}>
      <option value="personal">Personal email</option>
      <option value="school" disabled={!normalizedDomain}>School email{!normalizedDomain ? " (domain not configured)" : ""}</option>
    </select>
    <div className="flex min-w-0 items-center gap-2">
      <input key={emailType} type={school ? "text" : "email"} className="cd-input min-w-0 w-full" required
        maxLength={school ? Math.min(64, 254 - suffix.length) : 254}
        pattern={school ? "[^\\s@]+" : undefined}
        value={school ? username : value}
        onChange={event => {
          const text = event.target.value.trim();
          const local = school && text.toLowerCase().endsWith(suffix) ? text.slice(0, -suffix.length) : text;
          onChange(school ? (local ? `${local}${suffix}` : "") : text);
        }}
        placeholder={school ? "Student email username" : "student@example.com"}
        aria-label={school ? "School email username" : "Personal student email"}
        aria-describedby={id} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      {school && <span className="shrink-0 text-sm text-[#4A5A68]">{suffix}</span>}
    </div>
    <p id={id} className="mt-1 text-xs text-[#687B8E]">
      {school ? `Enter the username only; ${suffix} is added automatically.` : "Enter the student's full personal email address."}
      {" "}The claim invitation goes to this address.
      {!normalizedDomain && " To enable school email, ask the institution admin to configure the email domain in Settings."}
    </p>
  </div>;
}
