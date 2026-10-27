"use client";

import { useId, useState } from "react";
import AuthField from "./AuthField";
import { emailValidationMessage } from "@/lib/applicationEmail.mjs";

export default function AuthEmailField({ value, onChange, hint = "Start with a letter. Use only letters and numbers before @, for example amsam042@central.edu.sl.", ...props }) {
  const errorId = useId();
  const hintId = useId();
  const [touched, setTouched] = useState(false);
  const error = touched ? emailValidationMessage(value) : "";

  function validate(input) {
    const message = emailValidationMessage(input.value);
    input.setCustomValidity(message || (input.validity.typeMismatch || input.validity.patternMismatch
      ? "Enter a complete email address, such as name@institution.edu." : ""));
  }

  return <div>
    <AuthField {...props} type="email" value={value} required maxLength={254}
      pattern="[a-zA-Z][a-zA-Z0-9]*@[^\s@]+\.[^\s@]+"
      autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
      aria-invalid={Boolean(error)} aria-describedby={error ? `${hintId} ${errorId}` : hintId}
      onChange={event => { event.target.setCustomValidity(""); validate(event.target); setTouched(true); onChange(event); }}
      onBlur={event => { validate(event.target); setTouched(true); }}
      onInvalid={event => { validate(event.target); setTouched(true); }} />
    <p id={hintId} className="mt-2 text-xs text-[#4A5A68]">{hint}</p>
    {error ? <p id={errorId} role="alert" className="mt-2 text-sm text-[#A23B34]">{error}</p> : null}
  </div>;
}
