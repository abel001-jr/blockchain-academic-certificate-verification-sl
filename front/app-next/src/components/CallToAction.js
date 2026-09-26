import Link from "next/link";
import CertificateHero from "@/components/CertificateHero";

export default function CallToAction() {
  return (
    <section className="bg-[#08283F] py-16 sm:py-20">
      <div className="landing-wrap grid items-center gap-10 lg:grid-cols-[1fr_auto] lg:gap-20">
        <div className="max-w-[33rem]">
        <p className="cred-section-kicker !text-[#E9DAB8]">Get started</p>
        <h2 className="mt-3 font-serif text-[2.35rem] leading-[1.12] text-white font-medium sm:text-[2.8rem]">
          Ready to issue or verify a credential?
        </h2>
        <p className="mt-5 text-[1rem] text-[#D4E0E8] max-w-[44ch] leading-7">
          Universities can apply to issue blockchain-anchored credentials. Anyone can verify one — no account, no waiting.
        </p>
        <div className="mt-8 flex gap-3 flex-wrap">
          <Link href="#verify" className="cred-btn border-white bg-white text-[#08283F] hover:bg-[#EAF2FB]">
            Verify a certificate
          </Link>
          <Link href="/login" className="cred-btn border-white/70 bg-transparent text-white hover:border-white">
            Institution sign in
          </Link>
        </div>
        <div className="mt-7 max-w-[38rem] border-l-2 border-[#C59A3A] pl-4">
          <p className="text-[0.82rem] font-semibold uppercase tracking-[0.14em] text-[#E9DAB8]">
            How sign-in works
          </p>
          <p className="mt-2 text-[0.9rem] leading-6 text-[#C7D6E0]">
            Newly registered users are issued a temporary email and password so they
            can get in the first time. After that, MetaMask is the main way to sign in
            for regular users &mdash; your wallet is what proves who you are when you
            sign a certificate on-chain.
          </p>
        </div>
        </div>
        <div className="mx-auto w-full max-w-[330px] lg:mx-0"><CertificateHero /></div>
      </div>
    </section>
  );
}
