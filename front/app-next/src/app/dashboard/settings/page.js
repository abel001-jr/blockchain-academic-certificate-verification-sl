"use client";
import { ActionButton } from "@/components/ui/AnimatedControls";
import { useEffect, useState } from "react";
import { Loader2, Check, Eye, EyeOff, UserRound, Building2, Settings2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth, ROLES } from "@/lib/useAuth";
import styles from "./SettingsPage.module.css";
import ProfilePanel from "@/components/dashboard/ProfilePanel";
import AcademicStructurePanel   from "@/components/dashboard/AcademicStructurePanel";
import CertificateBrandingPanel from "@/components/dashboard/CertificateBrandingPanel";
import OfficerSignaturePanel    from "@/components/dashboard/OfficerSignaturePanel";
import ChainConfigPanel         from "@/components/dashboard/ChainConfigPanel";
import SystemBrandingPanel from "@/components/dashboard/SystemBrandingPanel";
import InstitutionIdentityPanel from "@/components/dashboard/InstitutionIdentityPanel";
import InstitutionEmailSettingsPanel from "@/components/dashboard/InstitutionEmailSettingsPanel";
import NotificationSettingsPanel from "@/components/dashboard/NotificationSettingsPanel";

export default function SettingsPage() {
  const { user, role, loading: authLoading } = useAuth();
  const institutionAdmin = role === ROLES.INSTITUTIONAL_ADMIN;
  const registrar = role === ROLES.REGISTRAR;
  const systemAdmin = role === ROLES.INSTITUTIONAL_ADMIN || role === ROLES.SUPER_ADMIN;
  const isOfficer = role === ROLES.VC || role === ROLES.CHANCELLOR;

  const groups = [
    { id: "personal", title: "Personal", description: "Your account, security and preferences", icon: UserRound,
      tabs: ["Profile", ...(registrar || isOfficer ? ["Signature"] : []), "Password", "Notifications"] },
    ...(registrar ? [{ id: "institution", title: "Institution", description: "Academic structure and credential setup", icon: Building2,
      tabs: ["Academic Structure", "Certificate Branding", "Institution Identity"] }] : []),
    ...(institutionAdmin ? [{ id: "institution-email", title: "Institution", description: "Institution email settings", icon: Building2, tabs: ["Institution Email", "Institution Identity"] }] : []),
    ...(isOfficer ? [{ id: "institution-identity", title: "Institution", description: "Official identity references", icon: Building2, tabs: ["Institution Identity"] }] : []),
    ...(systemAdmin ? [{ id: "system", title: "System", description: "Dashboard appearance and blockchain setup", icon: Settings2,
      tabs: ["System Branding", "Blockchain"] }] : []),
  ];
  const [tab, setTab] = useState("Profile");
  const availableTabs = groups.flatMap(group => group.tabs);
  const activeTab = availableTabs.includes(tab) ? tab : "Profile";
  const activeGroup = groups.find(group => group.tabs.includes(activeTab));
  const [saving,  setSaving]  = useState(false);
  const [success, setSuccess] = useState("");
  const [error,   setError]   = useState("");
  const [passwords, setPasswords] = useState({ old_password: "", new_password: "", confirm: "" });
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  useEffect(() => {
    const openNotifications = () => setTab("Notifications");
    window.addEventListener("credence:notification-settings", openNotifications);
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    const permittedTabs = ["Profile", "Password", "Notifications",
      ...(registrar ? ["Signature", "Academic Structure", "Certificate Branding", "Institution Identity"] : []),
      ...(institutionAdmin ? ["Institution Email", "Institution Identity"] : []),
      ...(isOfficer ? ["Signature", "Institution Identity"] : []),
      ...(systemAdmin ? ["System Branding", "Blockchain"] : [])];
    if (permittedTabs.includes(requestedTab)) {
      Promise.resolve().then(() => setTab(requestedTab));
    }
    return () => window.removeEventListener("credence:notification-settings", openNotifications);
  }, [registrar, systemAdmin, isOfficer, institutionAdmin]);

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
        <p className="text-[#4A5A68] text-base mt-1.5">Your account and institution settings, organised in one place.</p>
      </div>

      <div className={styles.layout}>
        <nav className={styles.navigation} aria-label="Settings categories">
          {groups.map(({ id, title, tabs }) => (
            <section key={id} className={styles.group} aria-labelledby={`settings-${id}`}>
              <div className={styles.groupHeading}>
                <h3 id={`settings-${id}`}>{title}</h3>
              </div>
              <div className={styles.links}>
                {tabs.map(item => <button key={item} type="button"
                  aria-current={activeTab === item ? "page" : undefined}
                  aria-controls="settings-content"
                  onClick={() => { setTab(item); setSuccess(""); setError(""); }}>
                  {item === "Password" ? "Security" : item === "Institution Identity" ? "Identity" : item}
                </button>)}
              </div>
            </section>
          ))}
        </nav>
        <section id="settings-content" className={styles.content} aria-label={`${activeGroup.title} settings: ${activeTab}`}>
          <p className={styles.breadcrumb}>{activeGroup.title} <span aria-hidden="true">/</span> {activeTab}</p>
        {activeTab === "Notifications" && <NotificationSettingsPanel />}
        {activeTab === "System Branding" && systemAdmin && <SystemBrandingPanel />}
        {activeTab === "Institution Identity" && (institutionAdmin || registrar || isOfficer) && <InstitutionIdentityPanel readOnly={!institutionAdmin} />}
        {activeTab === "Institution Email" && institutionAdmin && <InstitutionEmailSettingsPanel />}

        {/* ── Academic Structure ── */}
        {activeTab === "Academic Structure" && registrar && <AcademicStructurePanel />}

        {/* ── Certificate Branding ── */}
        {activeTab === "Certificate Branding" && registrar && <CertificateBrandingPanel />}

        {/* ── Signature ── */}
        {activeTab === "Signature" && (isOfficer || role === ROLES.REGISTRAR) && <OfficerSignaturePanel defaultName={user?.full_name || ""} />}

        {/* ── Profile ── */}
        {activeTab === "Profile" && user && <ProfilePanel key={user.id} user={user} />}

        {/* ── Password ── */}
        {activeTab === "Password" && (
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
        {activeTab === "Blockchain" && systemAdmin && <ChainConfigPanel />}
        </section>
      </div>
    </div>
  );
}
