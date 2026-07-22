import { BadgeCheck, Lock, Zap, FileSearch } from "lucide-react";

const cards = [
  {
    icon: BadgeCheck,
    title: "Cryptographic Issuance",
    body: "Every certificate is hashed with SHA-256 and anchored to the Ethereum blockchain by the issuing institution.",
  },
  {
    icon: Lock,
    title: "Tamper-Proof Records",
    body: "Once recorded on-chain, certificate data is immutable — no entity, including the issuing university, can alter it.",
  },
  {
    icon: Zap,
    title: "Instant Verification",
    body: "Employers verify certificates in seconds by scanning a QR code — no login, no waiting, no manual inquiry.",
  },
  {
    icon: FileSearch,
    title: "IPFS Document Storage",
    body: "Certificate PDFs and JSON records are stored on IPFS via Pinata, with their CIDs permanently registered on-chain.",
  },
];

export default function TrustIndicators() {
  return (
    <section className="bg-[#eef4ff] py-16">
      <div className="max-w-[1280px] mx-auto px-4 md:px-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {cards.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="bg-white p-6 rounded-[14px] shadow-card flex flex-col gap-4"
            >
              <Icon size={32} className="text-[#7b5900]" strokeWidth={1.8} />
              <h3 className="text-[#022448] font-semibold text-xl">{title}</h3>
              <p className="text-[#43474e] text-base leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
