"use client";
import { ActionButton } from "@/components/ui/AnimatedControls";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import ProfileAvatar from "./ProfileAvatar";
import ProfilePhotoCrop from "./ProfilePhotoCrop";

const profileFields = ["first_name", "last_name", "email", "phone_number"];
const editableProfile = user => Object.fromEntries(profileFields.map(key => [key, user?.[key] || ""]));

export default function ProfilePanel({ user }) {
  const [profile, setProfile] = useState(user);
  const [form, setForm] = useState(() => editableProfile(user));
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [cropFile, setCropFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);
  const hasChanges = Boolean(pendingPhoto) || profileFields.some(key => form[key] !== (profile?.[key] || ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  function uploadPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(""); setMessage("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { setError("Choose a JPEG, PNG or WebP image up to 5 MB."); return; }
    setCropFile(file);
  }
  function cancel() {
    setForm(editableProfile(profile));
    setPendingPhoto(null);
    setPhotoPreview("");
    setError("");
    setMessage("Changes discarded.");
  }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      let data = form;
      if (pendingPhoto) {
        data = new FormData();
        profileFields.forEach(key => data.append(key, form[key]));
        data.append("profile_photo", pendingPhoto);
      }
      const updated = await api.patch("/auth/me/", data);
      setProfile(updated);
      setForm(editableProfile(updated));
      setPendingPhoto(null);
      setPhotoPreview("");
      setMessage("Profile saved.");
    } catch (err) {
      setError(err?.detail || Object.entries(err || {}).map(([key, value]) => `${key.replaceAll("_", " ")}: ${[].concat(value).join(" ")}`).join(" ") || "Unable to save profile.");
    } finally { setBusy(false); }
  }
  return <section className="space-y-5">
    {cropFile && <ProfilePhotoCrop file={cropFile} onCancel={() => setCropFile(null)} onApply={file => {
      setPendingPhoto(file);
      setPhotoPreview(URL.createObjectURL(file));
      setCropFile(null);
    }} />}
    <h3 className="text-xl font-semibold text-[#08283F]">Profile Information</h3>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {message && <p role="status" className="text-green-800">{message}</p>}
    <div className="flex items-center gap-4 rounded-xl border border-[#E4E1D6] bg-[#F8F7F2] p-4">
      <ProfileAvatar user={pendingPhoto && photoPreview ? { ...profile, profile_photo: photoPreview } : profile} size={64} />
      <div><label className="cd-btn-secondary inline-flex cursor-pointer">{busy ? "Saving…" : "Update profile photo"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} onChange={uploadPhoto} /></label><p className="mt-2 text-xs text-[#4A5A68]">JPEG, PNG or WebP · up to 5 MB</p></div>
    </div>
    <form onSubmit={save} className="grid gap-5 sm:grid-cols-2">
      {[["first_name", "First name"], ["last_name", "Last name"], ["email", "Email"], ["phone_number", "Phone"]].map(([key, label]) => <label key={key} className="text-sm font-semibold text-[#08283F]">{label}<input className="cd-input mt-2" value={form[key]} disabled={busy} required={key === "email"} type={key === "email" ? "email" : key === "phone_number" ? "tel" : "text"} onChange={event => setForm(previous => ({...previous, [key]: event.target.value}))} /></label>)}
      <div className="rounded-xl border bg-white p-4"><p className="text-sm font-semibold">Role</p><p className="mt-2 capitalize">{profile?.role?.replaceAll("_", " ")}</p></div>
      <div className="rounded-xl border bg-white p-4"><p className="text-sm font-semibold">Wallet</p><p className="mt-2 break-all font-mono text-sm">{profile?.wallet_address || "Not bound"}</p><p className="mt-2 text-sm text-[#4A5A68]">Contact the system admin to change your wallet.</p></div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <ActionButton className="cred-btn cred-btn-primary gap-2" disabled={busy || !hasChanges} type="submit">{busy ? "Saving..." : "Save profile"}</ActionButton>
        <ActionButton className="cred-btn cred-btn-secondary" disabled={busy || !hasChanges} type="button" onClick={cancel}>Cancel</ActionButton>
        {hasChanges && <p role="status" className="text-sm text-[#4A5A68]">Unsaved changes. Save to apply your edits and photo.</p>}
      </div>
    </form>
  </section>;
}
