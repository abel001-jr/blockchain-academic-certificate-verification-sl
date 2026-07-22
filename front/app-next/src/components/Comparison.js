import { X, CheckCircle2, History, Sparkles } from "lucide-react";

const traditional = [
  "Paper certificates prone to physical damage, loss, and forgery.",
  "Verification requires 5–10 business days via manual institutional inquiry.",
  "Centralized databases are single points of failure and manipulation.",
  "No audit trail — no way to know if a certificate was verified or by whom.",
];

const blockchain = [
  "Certificates are cryptographically hashed and anchored to Ethereum.",
  "Instant verification via QR code — directly from the blockchain, no login needed.",
  "Verification remains possible even if the issuing institution goes offline.",
  "Every issuance, revocation, and verification is permanently logged on-chain.",
];

export default function Comparison() {
  return (
    <section className="py-20 px-4 md:px-10" id="why-blockchain">
      <div className="max-w-[1280px] mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-[#022448] font-bold text-4xl md:text-[48px] leading-tight tracking-tight">
            Why Blockchain?
          </h2>
          <p className="text-[#43474e] text-lg mt-3">
            The difference between trusting a server and trusting mathematics.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Traditional */}
          <div className="bg-[#dfe9fa]/50 border border-[#c4c6cf]/30 rounded-[14px] p-8">
            <div className="flex items-center gap-3 mb-8">
              <History size={22} className="text-[#43474e]" />
              <h3 className="text-[#022448] font-semibold text-xl">Traditional System</h3>
            </div>
            <ul className="flex flex-col gap-5">
              {traditional.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <X size={16} className="text-[#ba1a1a] mt-1 shrink-0" />
                  <p className="text-[#43474e] text-base leading-relaxed">{item}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* Blockchain */}
          <div className="bg-[#022448] rounded-[14px] p-8 shadow-xl">
            <div className="flex items-center gap-3 mb-8">
              <Sparkles size={22} className="text-[#ffdea4]" />
              <h3 className="text-white font-semibold text-xl">CREDENCE + Blockchain</h3>
            </div>
            <ul className="flex flex-col gap-5">
              {blockchain.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <CheckCircle2 size={16} className="text-[#ffdea4] mt-1 shrink-0" />
                  <p className="text-white/90 text-base leading-relaxed">{item}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Guiding principle */}
        <div className="mt-10 bg-white border border-[#c4c6cf]/30 rounded-[14px] p-8 text-center shadow-card">
          <p className="text-[#022448] text-base md:text-lg leading-relaxed max-w-3xl mx-auto italic">
            "Blockchain is the trust layer. PostgreSQL is the application data layer. Django orchestrates business logic.
            IPFS stores certificate documents. Users interact with a professional academic platform while blockchain
            operates transparently in the background."
          </p>
          <p className="text-[#7b5900] text-sm font-semibold mt-4 uppercase tracking-widest">CREDENCE Guiding Principle</p>
        </div>
      </div>
    </section>
  );
}
