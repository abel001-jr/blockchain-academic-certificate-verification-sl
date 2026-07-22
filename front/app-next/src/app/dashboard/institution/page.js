"use client";
import { useState, useEffect } from "react";
import { Building2, Link2, ShieldCheck, Globe, Mail, Phone, Loader2, Check } from "lucide-react";
import { api }     from "@/lib/api";
import { useAuth, ROLES } from "@/lib/useAuth";

export default function InstitutionPage() {
  const { user, role } = useAuth();
  const canEdit = [ROLES.SUPER_ADMIN, ROLES.INSTITUTIONAL_ADMIN].includes(role);

  const [inst,    setInst]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [success, setSuccess] = useState(false);
  const [error,   setError]   = useState("");
  const [form,    setForm]    = useState({
    name: "", short_name: "", website: "", email: "", phone: "", address: "",
  });

  useEffect(() => {
    if (!user?.institution) { setLoading(false); return; }
    api.get(`/institutions/${user.institution}/`)
      .then((data) => {
        setInst(data);
        setForm({
          name:       data.name       ?? "",
          short_name: data.short_name ?? "",
          website:    data.website    ?? "",
          email:      data.email      ?? "",
          phone:      data.phone      ?? "",
          address:    data.address    ?? "",
        });
      })
      .catch(() => setError("Failed to load institution."))
      .finally(() => setLoading(false));
  }, [user]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    setError("");
    try {
      const updated = await api.patch(`/institutions/${inst.id}/`, form);
      setInst(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError(JSON.stringify(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="text-[#022448] animate-spin" />
      </div>
    );
  }

  if (!inst) {
    return (
      <div className="max-w-[900px]">
        <p className="text-[#43474e] text-sm">{error || "No institution linked to your account."}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-[900px]">
      <div>
        <h2 className="text-[#022448] font-bold text-2xl">Institution</h2>
        <p className="text-[#43474e] text-sm mt-0.5">Manage your institutional profile and blockchain registration</p>
      </div>

      {/* Profile card */}
      <div className="bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 p-6">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-[14px] bg-[#022448] flex items-center justify-center shrink-0">
              <Building2 size={28} className="text-white" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="text-[#022448] font-bold text-xl">{inst.name}</h3>
              <p className="text-[#43474e] text-sm">ID: {inst.institution_id} · {inst.country}</p>
            </div>
          </div>
          {inst.is_chain_active && (
            <span className="inline-flex items-center gap-1.5 bg-[#7b5900]/10 text-[#7b5900] text-xs font-bold px-3 py-1.5 rounded-full border border-[#7b5900]/20">
              <ShieldCheck size={12} /> Verified On-Chain
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { icon: Globe, label: "Website", value: inst.website   || "—" },
            { icon: Mail,  label: "Email",   value: inst.email     || "—" },
            { icon: Phone, label: "Phone",   value: inst.phone     || "—" },
            { icon: Link2, label: "Wallet",  value: inst.wallet_address ? inst.wallet_address.slice(0, 14) + "…" : "—" },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center gap-3 p-4 bg-[#FAF7F2] rounded-[10px]">
              <Icon size={16} className="text-[#022448] shrink-0" strokeWidth={1.8} />
              <div>
                <p className="text-[#43474e] text-xs font-semibold uppercase tracking-wider">{label}</p>
                <p className="text-[#022448] text-sm font-medium">{value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Edit form — only for admins */}
      {canEdit && (
        <div className="bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 p-6">
          <h3 className="text-[#022448] font-semibold text-sm mb-5">Update Institution Profile</h3>

          {error   && <div className="bg-[#ffdad6] text-[#93000a] text-xs px-4 py-2 rounded-lg mb-4">{error}</div>}
          {success && (
            <div className="bg-[#2E7D32]/10 text-[#2E7D32] text-xs px-4 py-2 rounded-lg mb-4 flex items-center gap-2">
              <Check size={14} /> Changes saved successfully.
            </div>
          )}

          <form onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              ["name",       "Institution Name", false],
              ["short_name", "Short Name",       false],
              ["website",    "Website",          false],
              ["email",      "Email",            false],
              ["phone",      "Phone",            false],
              ["address",    "Address",          true],
            ].map(([field, label, full]) => (
              <div key={field} className={full ? "sm:col-span-2" : ""}>
                <label className="text-[#022448] text-xs font-semibold uppercase tracking-widest block mb-1.5">{label}</label>
                <input
                  value={form[field]}
                  onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                  className="w-full bg-[#eef4ff] border border-transparent focus:border-[#022448] rounded-[10px] px-4 py-3 text-sm text-[#121c28] outline-none transition-all"
                  placeholder={label}
                />
              </div>
            ))}
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 bg-[#022448] text-white px-6 py-3 rounded-[12px] text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-60"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : null}
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
