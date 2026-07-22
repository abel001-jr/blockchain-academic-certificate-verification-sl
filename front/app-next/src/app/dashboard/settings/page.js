"use client";
import { useState, useEffect } from "react";
import { Loader2, Check, Eye, EyeOff } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth, isInstitutionHead, ROLES } from "@/lib/useAuth";
import Link from "next/link";
import AcademicStructurePanel from "@/components/dashboard/AcademicStructurePanel";
import CertificateBrandingPanel from "@/components/dashboard/CertificateBrandingPanel";
import OfficerSignaturePanel from "@/components/dashboard/OfficerSignaturePanel";

export default function SettingsPage() {
  const { user, role, loading: authLoading } = useAuth();
  const registrar = isInstitutionHead(role);
  const isOfficer = role === ROLES.VC || role === ROLES.CHANCELLOR;
  const TABS = registrar
    ? ["Academic Structure", "Certificate Branding", "Profile", "Password", "Blockchain"]
    : isOfficer
      ? ["Profile", "Signature", "Password", "Blockchain"]
      : ["Profile", "Password", "Blockchain"];
  const [tab,     setTab]     = useState(registrar ? "Academic Structure" : "Profile");
  const [saving,  setSaving]  = useState(false);
  const [success, setSuccess] = useState("");
  const [error,   setError]   = useState("");

  // Password form
  const [passwords, setPasswords] = useState({ old_password: "", new_password: "", confirm: "" });
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);

  async function changePassword(e) {
    e.preventDefault();
    setSuccess(""); setError("");
    if (passwords.new_password !== passwords.confirm) {
      setError("New passwords do not match."); return;
    }
    setSaving(true);
    try {
      await api.post("/auth/change-password/", {
        old_password: passwords.old_password,
        new_password: passwords.new_password,
      });
      setSuccess("Password changed.");
      setPasswords({ old_password: "", new_password: "", confirm: "" });
    } catch (e) {
      setError(e?.old_password?.[0] ?? e?.detail ?? JSON.stringify(e));
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={26} className="text-[#022448] animate-spin" />
      </div>
    );
  }

  const inp = "w-full bg-[#eef4ff] border border-transparent focus:border-[#022448] rounded-[10px] px-4 py-3 text-sm text-[#121c28] outline-none transition-all";
  const lbl = "text-[#022448] text-xs font-semibold uppercase tracking-widest block mb-1.5";

  return (
    <div className="flex flex-col gap-6 max-w-[860px]">
      <div>
        <h2 className="text-[#022448] font-bold text-2xl">Settings</h2>
        <p className="text-[#43474e] text-sm mt-0.5">Manage catalog, certificate branding, and account</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#eef4ff] p-1 rounded-[12px] self-start">
        {TABS.map(t => (
          <button key={t} onClick={() => { setTab(t); setSuccess(""); setError(""); }}
            className={`px-4 py-2 rounded-[10px] text-sm font-medium transition-all ${
              tab === t ? "bg-white text-[#022448] font-semibold shadow-sm" : "text-[#43474e] hover:text-[#022448]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 p-6">

        {tab === "Academic Structure" && registrar && (
          <AcademicStructurePanel />
        )}

        {tab === "Certificate Branding" && registrar && (
          <CertificateBrandingPanel />
        )}

        {tab === "Signature" && isOfficer && (
          <OfficerSignaturePanel defaultName={user?.full_name || ""} />
        )}

        {tab !== "Academic Structure" && tab !== "Certificate Branding" && tab !== "Signature" && success && (
          <div className="bg-[#2E7D32]/10 text-[#2E7D32] text-sm px-4 py-3 rounded-lg mb-5 flex items-center gap-2">
            <Check size={14} /> {success}
          </div>
        )}
        {tab !== "Academic Structure" && tab !== "Certificate Branding" && tab !== "Signature" && error && (
          <div className="bg-[#ffdad6] text-[#93000a] text-sm px-4 py-3 rounded-lg mb-5">⚠ {error}</div>
        )}

        {/* ── Profile ── */}
        {tab === "Profile" && (
          <div className="flex flex-col gap-5">
            <div>
              <h3 className="text-[#022448] font-semibold text-sm">Profile Information</h3>
              <p className="text-[#74777f] text-xs mt-0.5">Your account details are managed by your administrator.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-[#FAF7F2] rounded-[10px] p-4">
                <p className={lbl}>First Name</p>
                <p className="text-[#022448] text-sm font-medium">{user?.first_name || "—"}</p>
              </div>
              <div className="bg-[#FAF7F2] rounded-[10px] p-4">
                <p className={lbl}>Last Name</p>
                <p className="text-[#022448] text-sm font-medium">{user?.last_name || "—"}</p>
              </div>
              <div className="bg-[#FAF7F2] rounded-[10px] p-4">
                <p className={lbl}>Email</p>
                <p className="text-[#022448] text-sm font-medium">{user?.email || "—"}</p>
              </div>
              <div className="bg-[#FAF7F2] rounded-[10px] p-4">
                <p className={lbl}>Role</p>
                <p className="text-[#022448] text-sm font-medium capitalize">
                  {user?.role?.replace(/_/g, " ") || "—"}
                </p>
              </div>
            </div>

            <div className="bg-[#FAF7F2] rounded-[10px] p-4">
              <p className={lbl}>Wallet Address</p>
              {user?.wallet_address ? (
                <p className="text-[#022448] text-sm font-mono break-all">{user.wallet_address}</p>
              ) : (
                <p className="text-[#74777f] text-sm">
                  Not bound —{" "}
                  <Link href="/dashboard/institution/bind-wallet" className="text-[#7b5900] font-medium hover:underline">
                    Bind Wallet
                  </Link>
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Password ── */}
        {tab === "Password" && (
          <form onSubmit={changePassword} className="flex flex-col gap-5">
            <h3 className="text-[#022448] font-semibold text-sm">Change Password</h3>

            {[
              { field: "old_password", label: "Current Password", show: showOld, toggle: () => setShowOld(v => !v) },
              { field: "new_password", label: "New Password",     show: showNew, toggle: () => setShowNew(v => !v) },
              { field: "confirm",      label: "Confirm New Password", show: showNew, toggle: () => setShowNew(v => !v) },
            ].map(({ field, label, show, toggle }) => (
              <div key={field} className="relative">
                <label className={lbl}>{label}</label>
                <input
                  type={show ? "text" : "password"}
                  value={passwords[field]}
                  onChange={e => setPasswords(p => ({ ...p, [field]: e.target.value }))}
                  placeholder="••••••••"
                  className={inp + " pr-12"}
                  required
                />
                <button type="button" onClick={toggle}
                  className="absolute right-3 bottom-3 text-[#74777f] hover:text-[#022448] transition-colors"
                >
                  {show ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            ))}

            <button type="submit" disabled={saving}
              className="flex items-center gap-2 bg-[#022448] text-white px-6 py-3 rounded-[12px] text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-60 self-start"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? "Updating…" : "Update Password"}
            </button>
          </form>
        )}

        {/* ── Blockchain ── */}
        {tab === "Blockchain" && (
          <div className="flex flex-col gap-4">
            <h3 className="text-[#022448] font-semibold text-sm">Blockchain Configuration</h3>
            <p className="text-[#43474e] text-xs leading-relaxed bg-[#eef4ff] p-3 rounded-[10px]">
              These values are read from your environment configuration. To change them,
              update your <code className="font-mono text-[#022448]">.env</code> file and restart the server.
            </p>
            {[
              ["RPC URL",              process.env.NEXT_PUBLIC_ETH_RPC_URL               || "http://127.0.0.1:8545 (default)"],
              ["Certificate Registry", process.env.NEXT_PUBLIC_CERTIFICATE_REGISTRY_ADDRESS || "Not configured"],
              ["Issuer Registry",      process.env.NEXT_PUBLIC_ISSUER_REGISTRY_ADDRESS      || "Not configured"],
              ["Your Wallet",          user?.wallet_address || "Not bound — use Bind Wallet"],
            ].map(([label, value]) => (
              <div key={label} className="bg-[#FAF7F2] rounded-[10px] p-4">
                <p className="text-[#43474e] text-xs font-semibold uppercase tracking-wider mb-1">{label}</p>
                <p className="text-[#022448] text-sm font-mono break-all">{value}</p>
              </div>
            ))}
            <Link href="/dashboard/institution/bind-wallet"
              className="flex items-center gap-2 border border-[#022448] text-[#022448] px-5 py-3 rounded-[12px] text-sm font-semibold hover:bg-[#022448] hover:text-white transition-all self-start"
            >
              Manage Wallet Binding →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
