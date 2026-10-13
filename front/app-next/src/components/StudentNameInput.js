"use client";
import { useEffect, useId, useRef, useState } from "react";
import styles from "./StudentNameInput.module.css";
const allowed = /^[\p{L}\p{M} '\u2019.\-]*$/u;
function capitalizeNames(value) {
  return value.replace(/(^|[\s'\u2019.\-])(\p{L})/gu, (_, separator, letter) => separator + letter.toUpperCase());
}
export function NameField({ value, onChange, label = "Student name", required = true, embedded = false }) {
  const id = useId();
  const input = useRef(null);
  const [notice, setNotice] = useState("");
  const error = value && (!allowed.test(value) || value.trim().length < 1 || !/\p{L}/u.test(value)) ? "Enter an official name. Use letters, spaces, apostrophes, hyphens or initials." : "";
  useEffect(() => { input.current?.setCustomValidity(error); }, [error]);
  return <div><input ref={input} className={embedded ? styles.input : "cd-input"} style={embedded ? undefined : { minHeight: 96 }} aria-label={label} required={required} minLength={1} maxLength={200} autoComplete={label === "Surname" ? "family-name" : label === "Middle names" ? "additional-name" : "given-name"} value={value} aria-invalid={!!error} aria-describedby={notice || error ? id : undefined} onChange={event => {
    const next = event.target.value;
    if (!allowed.test(next)) { setNotice("Numbers and symbols such as #, @ and $ are not allowed in the student's name."); return; }
    setNotice(""); onChange(capitalizeNames(next));
  }} placeholder={label === "Surname" ? "e.g. Sam" : label === "Middle names" ? "e.g. Morie" : "e.g. Abel"} />{(notice || error) && <p id={id} role="alert" className={`mt-1 text-xs ${notice || error ? "text-[#A23B34]" : "text-[#687B8E]"}`}>{notice || error}</p>}</div>;
}

function splitName(value) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return { first: words.shift() || "", surname: words.length ? words.pop() : "", other: words.join(" ") };
}
export default function StudentNameInput({ value, onChange }) {
  const [parts, setParts] = useState(() => splitName(value));
  const emitted = useRef(value);
  useEffect(() => {
    if (value !== emitted.current) { setParts(splitName(value)); emitted.current = value; }
  }, [value]);
  function update(key, next) {
    const updated = { ...parts, [key]: next };
    setParts(updated);
    const full = [updated.first.trim(), updated.other.trim(), updated.surname.trim()].filter(Boolean).join(" ");
    emitted.current = full;
    onChange(full, updated);
  }
  return <fieldset className="min-w-0">
    <legend className="sr-only">Student name</legend>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div><span className="cd-label">First &amp; last names *</span>
        <div className={styles.composite}>
          <label className={styles.cell}><span>First name *</span><NameField embedded label="First name" value={parts.first} onChange={next => update("first", next)} /></label>
          <label className={styles.cell}><span>Surname *</span><NameField embedded label="Surname" value={parts.surname} onChange={next => update("surname", next)} /></label>
        </div>
      </div>
      <div><label className="cd-label">Middle names <span className={styles.optional}>&middot; optional</span></label><NameField label="Middle names" required={false} value={parts.other} onChange={next => update("other", next)} /></div>
    </div>
    <p className="mt-2 text-xs text-[#687B8E]">Use the official names shown on the student&apos;s documents. Middle names are optional.</p>
  </fieldset>;
}
