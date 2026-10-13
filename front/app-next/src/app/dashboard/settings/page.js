"use client";
import { ActionButton } from "@/components/ui/AnimatedControls";
import { useEffect, useState } from "react";
import { Loader2, Check, Eye, EyeOff } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth, ROLES } from "@/lib/useAuth";
import ProfilePanel from "@/components/dashboard/ProfilePanel";
import AcademicStructurePanel   from "@/components/dashboard/AcademicStructurePanel";
import CertificateBrandingPanel from "@/components/dashboard/CertificateBrandingPanel";
import OfficerSignaturePanel    from "@/components/dashboard/OfficerSignaturePanel";
import ChainConfigPanel         from "@/components/dashboard/ChainConfigPanel";
import SystemBrandingPanel from "@/components/dashboard/SystemBrandingPanel";
import InstitutionEmailSettingsPanel from "@/components/dashboard/InstitutionEmailSettingsPanel";
import NotificationSettingsPanel from "@/components/dashboard/NotificationSettingsPanel";

export default function SettingsPage() {
  const { user, role, loading: authLoading } = useAuth();
  const registrar = role === ROLES.REGISTRAR;
  const systemAdmin = role === ROLES.INSTITUTIONAL_ADMIN || role === ROLES.SUPER_ADMIN;
  const isOfficer = role === ROLES.VC || role === ROLES.CHANCELLOR;

  const TABS = [...(registrar
    ? ["Academic Structure", "Institution Email", "Certificate Branding", "Signature", "Profile", "Password"]
    : isOfficer
      ? ["Profile", "Signature", "Password"]
      : systemAdmin ? ["Profile", "System Branding", "Password", "Blockchain"] : ["Profile", "Password"]), "Notifications"];

  const [tab,     setTab]     = useState(registrar ? "Academic Structure" : "Profile");
  const [saving,  setSaving]  = useState(false);
  const [success, setSuccess] = useState("");
  const [error,   setError]   = useState("");
  const [passwords, setPasswords] = useState({ old_password: "", new_password: "", confirm: "" });
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  useEffect(() => {
    const openNotifications = () => setTab("Notifications");
    window.addEventListener("credence:notification-settings", openNotifications);
    if (systemAdmin && new URLSearchParams(window.location.search).get("tab") === "System Branding") {
      Promise.resolve().then(() => setTab("System Branding"));
    }
    if (new URLSearchParams(window.location.search).get("tab") === "Notifications") {
      Promise.resolve().then(() => setTab("Notifications"));
    }
    if (registrar && new URLSearchParams(window.location.search).get("tab") === "Certificate Branding") {
      Promise.resolve().then(() => setTab("Certificate Branding"));
    }
    return () => window.removeEventListener("credence:notification-settings", openNotifications);
  }, [registrar, systemAdmin]);

  async function changePassword(e) {
    e.preventDefault();
    setSuccess(""); setError("");
    if (passwords.new_password !== passwords.confirm) { setError("New passwords do not match."); return; }
    setSaving(true);
    try {
      await api.post("/auth/change-password/", {
        old_password: passwords.old_password,
        new_password: passwords.new_password,
      });
      setSuccess("Password changed successfully.");
      setPasswords({ old_password: "", new_password: "", confirm: "" });
    } catch (e) {
      setError(e?.old_password?.[0] ?? e?.detail ?? JSON.stringify(e));
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) return <div className="flex items-center justify-center h-48"><Loader2 size={24} className="text-[#08283F] animate-spin" /></div>;

  return (
    <div className="flex flex-col gap-8 w-full">
      <div>
        <h2 className="text-[#08283F] font-bold text-3xl">Settings</h2>
        <p className="text-[#4A5A68] text-base mt-1.5">Manage catalog, certificate branding, and account</p>
      </div>

      {/* Tab bar — full width */}
      <div className="flex flex-wrap border-b border-[#E4E1D6] gap-1">
        {TABS.map(t => (
          <button key={t}
            onClick={() => { setTab(t); setSuccess(""); setError(""); }}
            className={`px-5 py-3.5 text-base font-medium transition-all border-b-2 -mb-px ${
              tab === t
                ? "text-[#08283F] border-[#08283F] font-semibold"
                : "text-[#4A5A68] border-transparent hover:text-[#08283F]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content — no outer card, full-width panels */}
      <div>
        {tab === "Notifications" && <NotificationSettingsPanel />}
        {tab === "System Branding" && systemAdmin && <SystemBrandingPanel />}
        {tab === "Institution Email" && registrar && <InstitutionEmailSettingsPanel />}

        {/* ── Academic Structure ── */}
        {tab === "Academic Structure" && registrar && <AcademicStructurePanel />}

        {/* ── Certificate Branding ── */}
        {tab === "Certificate Branding" && registrar && <CertificateBrandingPanel />}

        {/* ── Signature ── */}
        {tab === "Signature" && (isOfficer || role === ROLES.REGISTRAR) && <OfficerSignaturePanel defaultName={user?.full_name || ""} />}

        {/* ── Profile ── */}
        {tab === "Profile" && user && <ProfilePanel key={user.id} user={user} />}

        {/* ── Password ── */}
        {tab === "Password" && (
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="text-[#08283F] font-semibold text-xl">Change Password</h3>
              <p className="text-[#4A5A68] text-base mt-1.5">Choose a strong password of at least 8 characters.</p>
            </div>

            {success && (
              <div className="bg-[#E7F1EB] text-[#2F6F4E] text-base px-5 py-4 rounded-xl flex items-center gap-2">
                <Check size={16} /> {success}
              </div>
            )}
            {error && <div className="bg-[#F5E5E3] text-[#A23B34] text-base px-5 py-4 rounded-xl">⚠ {error}</div>}

            <form onSubmit={changePassword} className="bg-white rounded-xl border border-[#E4E1D6] divide-y divide-[#E4E1D6]">
              {[
                { field: "old_password", label: "Current password", show: showOld, toggle: () => setShowOld(v => !v) },
                { field: "new_password", label: "New password",     show: showNew, toggle: () => setShowNew(v => !v) },
                { field: "confirm",      label: "Confirm new",      show: showNew, toggle: () => setShowNew(v => !v) },
              ].map(({ field, label, show, toggle }) => (
                <div key={field} className="flex items-center gap-6 px-6 py-5">
                  <label className="text-[#4A5A68] text-base w-44 shrink-0">{label}</label>
                  <div className="relative flex-1">
                    <input
                      type={show ? "text" : "password"}
                      value={passwords[field]}
                      onChange={e => setPasswords(p => ({ ...p, [field]: e.target.value }))}
                      placeholder="••••••••"
                      required
                      className="cd-input pr-10"
                    />
                    <button type="button" onClick={toggle}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A929C] hover:text-[#08283F] transition-colors">
                      {show ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              ))}
              <div className="px-6 py-4 bg-[#F8F7F2] flex justify-end">
                <ActionButton type="submit" disabled={saving} className="cred-btn cred-btn-primary gap-2 self-start">
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {saving ? "Updating…" : "Update Password"}
                </ActionButton>
              </div>
            </form>
          </div>
        )}

        {/* ── Blockchain ── */}
        {tab === "Blockchain" && systemAdmin && <ChainConfigPanel />}
      </div>
    </div>
  );
}
