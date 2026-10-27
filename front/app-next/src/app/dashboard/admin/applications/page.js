"use client";
import { connectWallet } from "@/lib/walletActions";
import { useState, useEffect, useCallback } from "react";
import { CheckCircle2, XCircle, Loader2, Building2, ChevronDown, ChevronUp, Anchor } from "lucide-react";
import { api }     from "@/lib/api";
import { useAuth, ROLES } from "@/lib/useAuth";

const REGISTRY_ABI = [
  {
    inputs: [
      { name: "institutionAdmin", type: "address" },
      { name: "institutionId",    type: "string"  },
      { name: "name",             type: "string"  },
    ],
    name: "registerIssuer",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

export default function PendingApplicationsPage() {
  const { role, loading: authLoading } = useAuth();
  const [apps,     setApps]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [busy,     setBusy]     = useState(null);
  const [error,    setError]    = useState("");
  const [success,  setSuccess]  = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get("/admin/institutions/pending/");
      setApps(data.results ?? data);
      window.dispatchEvent(new Event("credence:applications-updated"));
    } catch {
      setError("Failed to load applications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (role === ROLES.SUPER_ADMIN) void load();
      else setLoading(false);
    });
    return () => { active = false; };
  }, [authLoading, role, load]);

  async function handleReject(id, reason) {
    setBusy(id);
    setError("");
    setSuccess("");
    try {
      await api.post(`/admin/institutions/${id}/review/`, {
        action: "reject",
        rejection_reason: reason,
      });
      setSuccess("Application rejected.");
      load();
    } catch (e) {
      setError(typeof e === "string" ? e : (e?.detail || JSON.stringify(e)));
    } finally {
      setBusy(null);
    }
  }

  /**
   * Combined Approve & Anchor (Account 0 / contract owner via MetaMask):
   *  1. Django approve → Institution + Admin with pre-verified wallet
   *  2. MetaMask registerIssuer (onlyOwner)
   *  3. Django records tx_hash → is_chain_active
   */
  async function handleApproveAndAnchor(app, institutionId) {
    setBusy(app.id);
    setError("");
    setSuccess("");
    try {
      if (!app.wallet_verified || !app.wallet_address) {
        throw new Error("This application has no verified wallet.");
      }
      if (!window.ethereum) throw new Error("MetaMask not found. Use Account 0 (deployer) as Super Admin.");

      const selectedAccount = await connectWallet();
      const review = await api.post(`/admin/institutions/${app.id}/review/`, {
        action: "approve",
        institution_id: institutionId,
      });

      const inst = review.institution;
      if (!inst?.wallet_address) throw new Error("Approve succeeded but no wallet returned.");

      const { ethers } = await import("ethers");
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner(selectedAccount);

      const registryAddr = process.env.NEXT_PUBLIC_ISSUER_REGISTRY_ADDRESS;
      if (!registryAddr) throw new Error("NEXT_PUBLIC_ISSUER_REGISTRY_ADDRESS not set.");

      const contract = new ethers.Contract(registryAddr, REGISTRY_ABI, signer);
      const tx = await contract.registerIssuer(
        inst.wallet_address,
        inst.institution_id,
        inst.name,
      );
      await tx.wait(1);

      await api.post(`/institutions/${inst.id}/anchor/`, { tx_hash: tx.hash });

      setSuccess(`Approved & anchored ${inst.institution_id}. Tx: ${tx.hash}`);
      load();
    } catch (e) {
      const msg = e?.reason || e?.shortMessage || e?.detail || e?.message || JSON.stringify(e);
      setError(String(msg));
      // If approve already ran but chain failed, Anchor page can finish the job
      load();
    } finally {
      setBusy(null);
    }
  }

  if (authLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={28} className="text-[#022448] animate-spin" />
      </div>
    );
  }

  if (role !== ROLES.SUPER_ADMIN) {
    return (
      <div className="w-full">
        <p className="text-[#C62828] text-sm">Access restricted to Super Admins.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      <div>
        <h2 className="text-[#022448] font-bold text-2xl">Institution Applications</h2>
        <p className="text-[#43474e] text-sm mt-0.5">
          Review applications with pre-verified wallets. Approve &amp; Anchor uses MetaMask Account 0
          (IssuerRegistry owner) in one step.
        </p>
      </div>

      {error && (
        <div className="bg-[#ffdad6] text-[#93000a] text-sm px-4 py-3 rounded-lg">{error}</div>
      )}
      {success && (
        <div className="bg-[#E8F5E9] text-[#2E7D32] text-sm px-4 py-3 rounded-lg break-all">{success}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={28} className="text-[#022448] animate-spin" />
        </div>
      ) : apps.length === 0 ? (
        <div className="bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 p-12 text-center">
          <Building2 size={36} className="text-[#c4c6cf] mx-auto mb-3" />
          <p className="text-[#43474e] text-sm">No pending applications.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {apps.map((app) => (
            <div
              key={app.id}
              className="bg-white rounded-[14px] shadow-card border border-[#c4c6cf]/10 overflow-hidden"
            >
              <div
                className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-[#FAF7F2] transition-colors"
                onClick={() => setExpanded(expanded === app.id ? null : app.id)}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-[10px] bg-[#022448]/5 flex items-center justify-center shrink-0">
                    <Building2 size={18} className="text-[#022448]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[#022448] font-semibold text-sm">{app.institution_name}</p>
                    <p className="text-[#43474e] text-xs truncate">
                      {app.contact_email} · {app.country}
                      {app.wallet_verified ? " · wallet verified" : " · wallet missing"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[#74777f] text-xs">
                    {new Date(app.submitted_at).toLocaleDateString()}
                  </span>
                  {expanded === app.id ? <ChevronUp size={16} className="text-[#43474e]" /> : <ChevronDown size={16} className="text-[#43474e]" />}
                </div>
              </div>

              {expanded === app.id && (
                <div className="border-t border-[#c4c6cf]/15 px-6 py-5">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
                    {[
                      ["Institution",     app.institution_name],
                      ["Country",         app.country],
                      ["Contact Email",   app.contact_email],
                      ["Contact Phone",   app.contact_phone || "—"],
                      ["Accreditation",   app.accreditation_body || "—"],
                      ["Reg. Number",     app.registration_number || "—"],
                      ["Admin Name",      `${app.admin_first_name} ${app.admin_last_name}`],
                      ["Admin Email",     app.admin_email],
                    ].map(([label, value]) => (
                      <div key={label} className="bg-[#FAF7F2] rounded-[10px] p-3">
                        <p className="text-[#43474e] text-xs font-semibold uppercase tracking-wider mb-0.5">{label}</p>
                        <p className="text-[#022448] text-sm font-medium">{value}</p>
                      </div>
                    ))}
                    <div className="bg-[#2E7D32]/5 border border-[#2E7D32]/15 rounded-[10px] p-3 col-span-2 sm:col-span-3">
                      <p className="text-[#2E7D32] text-xs font-semibold uppercase tracking-wider mb-0.5">
                        {app.wallet_verified ? "Pre-verified Wallet" : "Wallet (not verified)"}
                      </p>
                      <p className="text-[#022448] text-sm font-mono break-all">
                        {app.wallet_address || "—"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <ApproveAndAnchorAction
                      disabled={!app.wallet_verified}
                      onConfirm={(institutionId) => handleApproveAndAnchor(app, institutionId)}
                      loading={busy === app.id}
                    />
                    <RejectAction
                      onReject={(reason) => handleReject(app.id, reason)}
                      loading={busy === app.id}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ApproveAndAnchorAction({ onConfirm, loading, disabled }) {
  const [show,  setShow]  = useState(false);
  const [instId, setInstId] = useState("");

  return show ? (
    <div className="flex gap-2 flex-1 flex-wrap">
      <input
        value={instId}
        onChange={e => setInstId(e.target.value)}
        placeholder="Institution ID (e.g. CUSL-001)"
        className="flex-1 min-w-[180px] bg-[#eef4ff] border border-transparent focus:border-[#022448] rounded-[10px] px-4 py-2.5 text-sm outline-none"
      />
      <button
        disabled={!instId.trim() || loading || disabled}
        onClick={() => onConfirm(instId.trim())}
        className="flex items-center gap-1.5 bg-[#7b5900] text-white px-5 py-2.5 rounded-[10px] text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-all"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Anchor size={14} />}
        Confirm (Account 0)
      </button>
      <button onClick={() => setShow(false)} className="px-4 py-2.5 rounded-[10px] border border-[#c4c6cf]/40 text-[#43474e] text-sm hover:bg-[#eef4ff] transition-all">
        Cancel
      </button>
    </div>
  ) : (
    <button
      onClick={() => setShow(true)}
      disabled={loading || disabled}
      title={disabled ? "Application must have a verified wallet" : "Approve in Django then registerIssuer as contract owner"}
      className="flex items-center gap-2 bg-[#7b5900] text-white px-6 py-2.5 rounded-[10px] text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-50"
    >
      <Anchor size={15} /> Approve &amp; Anchor On-Chain
    </button>
  );
}

function RejectAction({ onReject, loading }) {
  const [show,   setShow]   = useState(false);
  const [reason, setReason] = useState("");

  return show ? (
    <div className="flex gap-2 flex-1 flex-wrap">
      <input
        value={reason}
        onChange={e => setReason(e.target.value)}
        placeholder="Rejection reason"
        className="flex-1 min-w-[180px] bg-[#ffdad6]/30 border border-[#C62828]/20 focus:border-[#C62828] rounded-[10px] px-4 py-2.5 text-sm outline-none"
      />
      <button
        disabled={!reason.trim() || loading}
        onClick={() => onReject(reason.trim())}
        className="flex items-center gap-1.5 bg-[#C62828] text-white px-5 py-2.5 rounded-[10px] text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-all"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
        Confirm
      </button>
      <button onClick={() => setShow(false)} className="px-4 py-2.5 rounded-[10px] border border-[#c4c6cf]/40 text-[#43474e] text-sm hover:bg-[#eef4ff] transition-all">
        Cancel
      </button>
    </div>
  ) : (
    <button
      onClick={() => setShow(true)}
      disabled={loading}
      className="flex items-center gap-2 border border-[#C62828] text-[#C62828] px-6 py-2.5 rounded-[10px] text-sm font-semibold hover:bg-[#C62828]/5 transition-all disabled:opacity-50"
    >
      <XCircle size={15} /> Reject
    </button>
  );
}
