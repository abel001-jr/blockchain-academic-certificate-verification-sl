import Link from "next/link";
import Image from "next/image";

const links = {
  Platform: [
    { label: "Home",         href: "#home" },
    { label: "Features",     href: "#features" },
    { label: "Why Blockchain", href: "#why-blockchain" },
    { label: "Verify Certificate", href: "#verify" },
  ],
  "For Institutions": [
    { label: "Institution Sign In", href: "/login" },
    { label: "How It Works",        href: "#how-it-works" },
    { label: "Supported Roles",     href: "#institutions" },
  ],
  "Dev & Legal": [
    { label: "API Docs",       href: "#" },
    { label: "GitHub",         href: "#" },
    { label: "Privacy Policy", href: "#" },
    { label: "Terms of Use",   href: "#" },
  ],
};

export default function Footer() {
  return (
    <footer className="bg-white border-t border-[#c4c6cf]/30 pt-14 pb-8">
      <div className="max-w-[1280px] mx-auto px-4 md:px-10 grid grid-cols-1 md:grid-cols-5 gap-10">

        {/* Brand — spans 2 cols */}
        <div className="md:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Image src="/logo.png" alt="CREDENCE" width={28} height={28} className="rounded-lg" />
            <span className="text-[#022448] font-bold text-xl tracking-tighter">CREDENCE</span>
          </div>
          <p className="text-[#43474e] text-sm leading-relaxed mb-4">
            A blockchain-powered academic certificate issuance and verification platform — built as a proof-of-concept for higher education institutions.
          </p>
          <p className="text-[#74777f] text-xs">
            Case Study: Central University Sierra Leone
          </p>
        </div>

        {/* Link columns */}
        {Object.entries(links).map(([section, items]) => (
          <div key={section}>
            <h5 className="text-[#022448] font-semibold text-sm mb-4">{section}</h5>
            <ul className="flex flex-col gap-2.5">
              {items.map(({ label, href }) => (
                <li key={label}>
                  <Link
                    href={href}
                    className="text-[#43474e] text-sm hover:text-[#7b5900] underline underline-offset-4 decoration-[#7b5900]/30 transition-colors"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Bottom bar */}
      <div className="max-w-[1280px] mx-auto px-4 md:px-10 mt-12 pt-6 border-t border-[#c4c6cf]/20 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-[#74777f] text-xs">
          © {new Date().getFullYear()} CREDENCE — Abel Morie Sam. Undergraduate Final Year Project, 2026.
        </p>
        <p className="text-[#74777f] text-xs">Trust Layer: Ethereum · Storage: IPFS · Backend: Django</p>
      </div>
    </footer>
  );
}
