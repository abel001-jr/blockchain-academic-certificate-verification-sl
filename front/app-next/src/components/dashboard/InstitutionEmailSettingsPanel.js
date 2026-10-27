"use client";
import { ActionButton } from "@/components/ui/AnimatedControls";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function InstitutionEmailSettingsPanel() {
  const [form, setForm] = useState({email: "", email_domain: ""});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let alive = true;
    api.get("/institution-email-settings/").then(data => { if (alive) setForm(data); }).catch(() => { if (alive) setError("Could not load institution email settings."); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  async function save(event) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try { setForm(await api.patch("/institution-email-settings/", form)); setMessage("Institution email settings saved."); }
    catch (err) { setError(err?.email_domain?.[0] || err?.email?.[0] || err?.detail || "Could not save email settings."); }
    finally { setSaving(false); }
  }
  return <section className="space-y-5"><div><h3 className="text-xl font-semibold text-[#08283F]">Institution email setup</h3><p className="mt-2 text-sm text-[#4A5A68]">Configure the university contact address and institution email domain. Officer and graduate forms use this saved domain automatically.</p></div>
    {error && <p role="alert" className="text-red-700">{error}</p>}{message && <p role="status" className="text-[#2F6F4E]">{message}</p>}
    {loading ? <p role="status">Loading...</p> : <form onSubmit={save} className="grid gap-5 sm:grid-cols-2"><label className="cd-label">University contact email<input type="email" className="cd-input mt-2" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="registry@central.edu.sl" /></label><label className="cd-label">Institution email domain<input type="text" maxLength={253} className="cd-input mt-2" value={form.email_domain} onChange={e => setForm({...form, email_domain: e.target.value})} placeholder="central.edu.sl" /><span className="mt-2 block text-xs font-normal text-[#4A5A68]">Example: central.edu.sl. This does not create or verify a mailbox.</span></label><ActionButton type="submit" disabled={saving} className="cred-btn cred-btn-primary gap-2 self-start">{saving ? "Saving..." : "Save email settings"}</ActionButton></form>}
  </section>;
}
