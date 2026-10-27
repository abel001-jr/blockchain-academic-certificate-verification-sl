"use client";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import countries from "@/lib/countries.json";
import styles from "./AuthCountrySelect.module.css";

export default function AuthCountrySelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState({});
  const anchor = useRef(null), popup = useRef(null), searchInput = useRef(null);
  const id = useId();
  const results = countries.filter(country => country.name.toLowerCase().includes(search.trim().toLowerCase()));
  useEffect(() => {
    if (!open) return;
    searchInput.current?.focus();
    const close = event => {
      if (event.key === "Escape") { setOpen(false); anchor.current?.focus(); }
      else if (event.type === "mousedown" && !anchor.current?.contains(event.target) && !popup.current?.contains(event.target)) setOpen(false);
    };
    const resized = () => setOpen(false);
    document.addEventListener("mousedown", close); document.addEventListener("keydown", close); window.addEventListener("resize", resized);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); window.removeEventListener("resize", resized); };
  }, [open]);
  function toggle() {
    const rect = anchor.current.getBoundingClientRect();
    setPosition({ left: rect.left, width: rect.width, top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 310)) });
    setSearch(""); setOpen(!open);
  }
  return <div className={styles.field}>
    <span id={`${id}-label`} className={styles.label}>Country *</span>
    <button type="button" ref={anchor} onClick={toggle} aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="dialog" aria-expanded={open} className={styles.trigger}><span id={`${id}-value`}>{value || "Choose country"}</span><ChevronDown size={16} /></button>
    {open && createPortal(<div ref={popup} role="dialog" aria-label="Choose country" className={styles.popup} style={position}>
      <input ref={searchInput} type="search" placeholder="Search countries" aria-label="Search countries" value={search} onChange={e => setSearch(e.target.value)} />
      {results.length ? <select size={7} aria-label="Country options" value={results.some(row => row.name === value) ? value : ""} onChange={e => { onChange(e.target.value); setOpen(false); anchor.current?.focus(); }}><option value="" disabled>Choose country</option>{results.map(country => <option key={country.code} value={country.name}>{country.name}</option>)}</select> : <p>No countries found.</p>}
    </div>, document.body)}
  </div>;
}
