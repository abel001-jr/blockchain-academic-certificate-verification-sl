"use client";
import { ActionButton } from "@/components/ui/AnimatedControls";
import { useState } from "react";
import { api } from "@/lib/api";
import ProfileAvatar from "./ProfileAvatar";

export default function ProfilePanel({ user }) {
  const [profile, setProfile] = useState(user);
  const [form, setForm] = useState(() => Object.fromEntries(["first_name", "last_name", "email", "phone_number"].map(key => [key, user?.[key] || ""])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function uploadPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(""); setMessage("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { setError("Choose a JPEG, PNG or WebP image up to 5 MB."); return; }
    setBusy(true);
    try {
      const data = new FormData(); data.append("profile_photo", file);
      const updated = await api.patch("/auth/me/", data);
      setProfile(updated); setMessage("Profile photo updated.");
    } catch { setError("Unable to update your photo. Choose a valid image and try again."); }
    finally { setBusy(false); }
  }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const updated = await api.patch("/auth/me/", form);
      setProfile(updated);
      setMessage("Profile saved.");
    } catch (err) {
      setError(err?.detail || Object.entries(err || {}).map(([key, value]) => `${key.replaceAll("_", " ")}: ${[].concat(value).join(" ")}`).join(" ") || "Unable to save profile.");
    } finally { setBusy(false); }
  }
  return <section className="space-y-5">
    <h3 className="text-xl font-semibold text-[#08283F]">Profile Information</h3>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {message && <p role="status" className="text-green-800">{message}</p>}
    <div className="flex items-center gap-4 rounded-xl border border-[#E4E1D6] bg-[#F8F7F2] p-4">
      <ProfileAvatar user={profile} size={64} />
      <div><label className="cd-btn-secondary inline-flex cursor-pointer">{busy ? "Saving…" : "Update profile photo"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} onChange={uploadPhoto} /></label><p className="mt-2 text-xs text-[#4A5A68]">JPEG, PNG or WebP · up to 5 MB</p></div>
    </div>
    <form onSubmit={save} className="grid gap-5 sm:grid-cols-2">
      {[["first_name", "First name"], ["last_name", "Last name"], ["email", "Email"], ["phone_number", "Phone"]].map(([key, label]) => <label key={key} className="text-sm font-semibold text-[#08283F]">{label}<input className="cd-input mt-2" value={form[key]} disabled={busy} required={key === "email"} type={key === "email" ? "email" : key === "phone_number" ? "tel" : "text"} onChange={event => setForm(previous => ({...previous, [key]: event.target.value}))} /></label>)}
      <div className="rounded-xl border bg-white p-4"><p className="text-sm font-semibold">Role</p><p className="mt-2 capitalize">{profile?.role?.replaceAll("_", " ")}</p></div>
      <div className="rounded-xl border bg-white p-4"><p className="text-sm font-semibold">Wallet</p><p className="mt-2 break-all font-mono text-sm">{profile?.wallet_address || "Not bound"}</p><p className="mt-2 text-sm text-[#4A5A68]">Contact the system admin to change your wallet.</p></div>
      <ActionButton className="cred-btn cred-btn-primary gap-2 self-start" disabled={busy} type="submit">{busy ? "Saving..." : "Save profile"}</ActionButton>
    </form>
  </section>;
}
