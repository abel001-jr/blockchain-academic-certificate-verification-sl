"use client";
import { useState } from "react";
import { Loader2, Check, Eye, EyeOff, Link2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth, isInstitutionHead, ROLES } from "@/lib/useAuth";
import Link from "next/link";
import AcademicStructurePanel   from "@/components/dashboard/AcademicStructurePanel";
import CertificateBrandingPanel from "@/components/dashboard/CertificateBrandingPanel";
import OfficerSignaturePanel    from "@/components/dashboard/OfficerSignaturePanel";

export default function SettingsPage() {
  const { user, role, loading: authLoading } = useAuth();
  const registrar = isInstitutionHead(role);
  const isOfficer = role === ROLES.VC || role === ROLES.CHANCELLOR;

  const TABS = registrar
    ? ["Academic Structure", "Certificate Branding", "Signature", "Profile", "Password", "Blockchain"]
    : isOfficer
      ? ["Profile", "Signature", "Password", "Blockchain"]
      : ["Profile", "Password", "Blockchain"];

  const [tab,     setTab]     = useState(registrar ? "Academic Structure" : "Profile");
  const [saving,  setSaving]  = useState(false);
  const [success, setSuccess] = useState("");
  const [error,   setError]   = useState("");
  const [passwords, setPasswords] = useState({ old_password: "", new_password: "", confirm: "" });
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);

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
      <div className="flex border-b border-[#E4E1D6] gap-1">
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

        {/* ── Academic Structure ── */}
        {tab === "Academic Structure" && registrar && <AcademicStructurePanel />}

        {/* ── Certificate Branding ── */}
        {tab === "Certificate Branding" && registrar && <CertificateBrandingPanel />}

        {/* ── Signature ── */}
        {tab === "Signature" && (isOfficer || registrar) && <OfficerSignaturePanel defaultName={user?.full_name || ""} />}

        {/* ── Profile ── */}
        {tab === "Profile" && (
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="text-[#08283F] font-semibold text-xl">Profile Information</h3>
              <p className="text-[#4A5A68] text-base mt-1.5">Your account details are managed by your administrator.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {[
                ["First name", user?.first_name || "—"],
                ["Last name",  user?.last_name  || "—"],
                ["Email",      user?.email      || "—"],
                ["Role",       user?.role === "chancellor" ? "Dean" : (user?.role?.replace(/_/g, " ") || "—")],
              ].map(([label, value]) => (
                <div key={label} className="bg-white rounded-xl border border-[#E4E1D6] px-6 py-5">
                  <p className="text-[#8A929C] text-sm font-semibold uppercase tracking-wider mb-2">{label}</p>
                  <p className="text-[#08283F] text-lg font-medium capitalize break-all">{value}</p>
                </div>
              ))}
              <div className="bg-white rounded-xl border border-[#E4E1D6] px-6 py-5 sm:col-span-2">
                <p className="text-[#8A929C] text-sm font-semibold uppercase tracking-wider mb-2">Wallet</p>
                {user?.wallet_address ? (
                  <p className="text-[#08283F] text-base font-mono break-all leading-relaxed">{user.wallet_address}</p>
                ) : (
                  <p className="text-[#4A5A68] text-base">
                    Not bound —{" "}
                    <Link href="/dashboard/institution/bind-wallet" className="text-[#B98A28] font-semibold hover:underline">Bind Wallet</Link>
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

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
                <button type="submit" disabled={saving} className="cd-btn-primary disabled:opacity-60">
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {saving ? "Updating…" : "Update Password"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Blockchain ── */}
        {tab === "Blockchain" && (
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="text-[#08283F] font-semibold text-xl">Blockchain Configuration</h3>
              <p className="text-[#4A5A68] text-base mt-1.5">
                Read-only — update your <code className="font-mono text-[#08283F] bg-[#EAF2FB] px-1.5 py-0.5 rounded">.env</code> file and restart to change these values.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {[
                ["RPC URL",              process.env.NEXT_PUBLIC_ETH_RPC_URL                  || "http://127.0.0.1:8545"],
                ["Certificate Registry", process.env.NEXT_PUBLIC_CERTIFICATE_REGISTRY_ADDRESS || "Not configured"],
                ["Issuer Registry",      process.env.NEXT_PUBLIC_ISSUER_REGISTRY_ADDRESS      || "Not configured"],
                ["Your Wallet",          user?.wallet_address                                  || "Not bound"],
              ].map(([label, value]) => (
                <div key={label} className="bg-white rounded-xl border border-[#E4E1D6] px-6 py-5 min-w-0">
                  <p className="text-[#8A929C] text-sm font-semibold uppercase tracking-wider mb-2">{label}</p>
                  <p className="text-[#08283F] text-base font-mono break-all leading-relaxed">{value}</p>
                </div>
              ))}
            </div>

            <div>
              <Link href="/dashboard/institution/bind-wallet"
                className="inline-flex items-center gap-2 border border-[#E4E1D6] text-[#08283F] px-5 py-3 rounded-xl text-base font-semibold hover:bg-[#08283F] hover:text-white hover:border-[#08283F] transition-all">
                <Link2 size={16} /> Manage Wallet Binding
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
