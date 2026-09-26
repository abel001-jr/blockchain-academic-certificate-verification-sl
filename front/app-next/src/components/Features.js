import {
  LayoutDashboard,
  QrCode,
  Link2,
  ShieldOff,
  ScrollText,
  Wallet,
} from "lucide-react";

const features = [
  {
    icon: LayoutDashboard,
    title: "Institutional Dashboard",
    body: "Registrars and admins manage certificate issuance, track records, and monitor blockchain status from a single interface.",
  },
  {
    icon: QrCode,
    title: "QR Code Verification",
    body: "Every certificate carries a unique QR code. Employers scan it to retrieve and verify the record directly from the blockchain.",
  },
  {
    icon: Link2,
    title: "Shareable Verification Links",
    body: "Students share portable, permanent verification URLs with employers and institutions — no account required to verify.",
  },
  {
    icon: ShieldOff,
    title: "Certificate Revocation",
    body: "Institutions can revoke certificates on-chain. Revocation is recorded immutably, and verifiers always see the current status.",
  },
  {
    icon: ScrollText,
    title: "Immutable Audit History",
    body: "Every certificate action — issuance, revocation, verification — is logged with a full, tamper-proof audit trail.",
  },
  {
    icon: Wallet,
    title: "Student Certificate Wallet",
    body: "Students access all their issued certificates in one place and download or share them at any time.",
  },
];

export default function Features() {
  return (
    <section className="bg-[#e5eeff] py-20" id="features">
      <div className="max-w-[1920px] mx-auto px-4 md:px-10">
        <div className="text-center mb-14">
          <h2 className="text-[#022448] font-bold text-4xl md:text-[48px] leading-tight tracking-tight">
            Built for the Full Certificate Lifecycle
          </h2>
          <p className="text-[#43474e] text-lg mt-3">
            From issuance to storage to verification — every stage is covered.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="bg-white p-8 rounded-[14px] shadow-card shadow-card-hover transition-all cursor-default"
            >
              <Icon size={40} className="text-[#7b5900] mb-5" strokeWidth={1.6} />
              <h3 className="text-[#022448] font-semibold text-xl mb-3">{title}</h3>
              <p className="text-[#43474e] text-base leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
