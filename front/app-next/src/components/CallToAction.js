
import { ActionButton } from "@/components/ui/AnimatedControls";
import Link from "next/link";
import CertificateHero from "@/components/CertificateHero";

export default function CallToAction() {
  return (
    <section id="get-started" className="scroll-anchor cred-section-dark bg-[#08283F] py-16 sm:py-20">
      <div className="landing-wrap grid items-center gap-10 lg:grid-cols-[1fr_auto] lg:gap-20">
        <div className="max-w-[33rem]">
        <p className="cred-section-kicker !text-[#F8F7F2]">Get started</p>
        <h2 className="mt-3 font-serif text-[2.35rem] leading-[1.12] text-white font-medium sm:text-[2.8rem]">
          Already part of an institution?
        </h2>
        <p className="mt-5 text-[1rem] text-[#F8F7F2]/80 max-w-[44ch] leading-7">
          Institutional staff can access their credential workspace with a linked wallet. Use account sign-in for email and password access.
        </p>
        <div className="mt-8 flex gap-3 flex-wrap">
          <ActionButton href="/login" tone="inverse" className="cred-btn cred-btn-primary">
            Institution sign in
          </ActionButton>
          <Link href="/login" className="cred-btn cred-btn-secondary cred-btn-inverse">
            Account sign in
          </Link>
        </div>
        <div className="mt-7 max-w-[38rem] border-l-2 border-[#F8F7F2]/50 pl-4">
          <p className="text-[0.82rem] font-semibold uppercase tracking-[0.14em] text-[#F8F7F2]">
            How sign-in works
          </p>
          <p className="mt-2 text-[0.9rem] leading-6 text-[#F8F7F2]/80">
            New institutional staff use the temporary credentials supplied by their administrator,
            then complete wallet setup. Existing account holders can use account sign-in;
            staff with a linked wallet can use MetaMask. Public verification does not require an account.
          </p>
        </div>
        </div>
        <div className="mx-auto w-full max-w-[330px] lg:mx-0"><CertificateHero /></div>
      </div>
    </section>
  );
}
