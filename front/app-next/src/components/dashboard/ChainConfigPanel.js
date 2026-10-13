"use client";
import { ActionButton } from "@/components/ui/AnimatedControls";

/**
 * ChainConfigPanel — deployment-wide blockchain coordinates.
 *
 * These used to be read-only `NEXT_PUBLIC_*` values baked into the bundle at build
 * time, which meant changing network or re-deploying the registries required a
 * frontend rebuild. They are editable here instead.
 *
 * There is deliberately no private key field. The browser signs through MetaMask,
 * so the app never needs a key, and a key typed into a web page would be a key
 * travelling through a web page. If a deployment ever needs automated signing, that
 * belongs in a deploy job reading its own environment, not in this endpoint.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Check, AlertTriangle, Save } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth, ROLES } from "@/lib/useAuth";

const FIELDS = [
  {
    name: "rpc_url",
    label: "RPC URL",
    type: "text",
    placeholder: "http://127.0.0.1:8545",
    help: "Shown to admins for reference. Transactions are signed by the connected wallet, not sent here.",
  },
  {
    name: "chain_id",
    label: "Chain ID",
    type: "number",
    placeholder: "31337",
    help: "The dashboard warns when the connected wallet is on a different network.",
  },
  {
    name: "issuer_registry_address",
    label: "Issuer Registry",
    type: "text",
    placeholder: "0x…",
    help: "Holds registerIssuer / officer authorisation.",
  },
  {
    name: "certificate_registry_address",
    label: "Certificate Registry",
    type: "text",
    placeholder: "0x…",
    help: "Holds credential issuance and the approval chain.",
  },
  {
    name: "expected_owner_address",
    label: "Expected IssuerRegistry Owner",
    type: "text",
    placeholder: "0x… (optional)",
    help: "Optional. The wallet allowed to call registerIssuer. Checked against the contract's own owner() before a transaction is sent.",
  },
];

const inputCls =
  "w-full border border-[#E4E1D6] rounded-lg px-4 py-2.5 text-[#08283F] bg-white " +
  "font-mono text-sm focus:outline-none focus:border-[#08283F] disabled:bg-[#F5F4F0] disabled:text-[#8A929C]";

function firstError(e) {
  if (!e || typeof e !== "object") return "Failed to save.";
  for (const v of Object.values(e)) {
    if (Array.isArray(v) && v.length) return v[0];
    if (typeof v === "string") return v;
  }
  return "Failed to save.";
}

export default function ChainConfigPanel() {
  const { user, role } = useAuth();
  const canEdit = role === ROLES.SUPER_ADMIN;

  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  // No setState before the first await: `loading` already starts true and nothing
  // needs the error cleared before a save, so neither flag is set here.
  const load = useCallback(async () => {
    try {
      setValues(await api.get("/chain-config/"));
    } catch (e) {
      setError(firstError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount. The rule below flags this even though every setState in load() is
  // after an await, so satisfying it would mean adopting a data-fetching library; the
  // three pre-existing panels (AcademicStructure, approvals, officers) carry this same
  // error unsuppressed.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setSuccess("");
    setError("");
    try {
      const payload = {
        rpc_url: values.rpc_url ?? "",
        chain_id:
          values.chain_id === "" || values.chain_id === null || values.chain_id === undefined
            ? null
            : Number(values.chain_id),
        issuer_registry_address: values.issuer_registry_address ?? "",
        certificate_registry_address: values.certificate_registry_address ?? "",
        expected_owner_address: values.expected_owner_address ?? "",
      };
      setValues(await api.patch("/chain-config/", payload));
      setSuccess("Chain configuration saved.");
    } catch (e) {
      setError(firstError(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 size={24} className="text-[#08283F] animate-spin" />
      </div>
    );
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-6">
      <div>
        <h3 className="text-[#08283F] font-semibold text-xl">Blockchain Configuration</h3>
        <p className="text-[#4A5A68] text-base mt-1.5">
          {canEdit
            ? "Where this deployment reads the chain from. Applies immediately — no rebuild, no restart."
            : "Read-only. Contact the system admin to change blockchain configuration."}
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-[#FDECEA] text-[#B3261E] text-sm px-4 py-3 rounded-lg">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span className="break-all">{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 bg-[#E7F4EA] text-[#1E6B33] text-sm px-4 py-3 rounded-lg">
          <Check size={16} /> {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {FIELDS.map(f => (
          <div key={f.name} className="bg-white rounded-xl border border-[#E4E1D6] px-6 py-5 min-w-0">
            <label htmlFor={`cc-${f.name}`} className="block text-[#8A929C] text-sm font-semibold uppercase tracking-wider mb-2">
              {f.label}
            </label>
            <input
              id={`cc-${f.name}`}
              type={f.type}
              value={values[f.name] ?? ""}
              disabled={!canEdit}
              placeholder={f.placeholder}
              onChange={e => setValues(v => ({ ...v, [f.name]: e.target.value }))}
              className={inputCls}
            />
            <p className="text-[#8A929C] text-xs mt-2 leading-relaxed">{f.help}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-[#E4E1D6] px-6 py-5">
        <p className="text-[#8A929C] text-sm font-semibold uppercase tracking-wider mb-2">Your Wallet</p>
        <p className="text-[#08283F] text-base font-mono break-all">
          {user?.wallet_address || "Not bound"}
        </p>
        <p className="mt-4 text-sm text-[#4A5A68]">Contact the system admin to change your wallet.</p>
      </div>

      {canEdit && (
        <div className="flex justify-end">
          <ActionButton
            type="submit"
            disabled={saving}
            className="cred-btn cred-btn-primary gap-2 self-start"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? "Saving…" : "Save Chain Configuration"}
          </ActionButton>
        </div>
      )}
    </form>
  );
}
