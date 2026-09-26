import { BadgeCheck, Clock3, Globe2, Leaf, LockKeyhole, ShieldCheck } from "lucide-react";

const benefits = [
  { icon: ShieldCheck, title: "Tamper-proof", body: "Built on blockchain technology for lasting security." },
  { icon: BadgeCheck, title: "Instant verification", body: "Anyone can verify in seconds, anywhere in the world." },
  { icon: Clock3, title: "Saves time", body: "No more manual checks or calls to the records office." },
  { icon: Globe2, title: "Global access", body: "Credentials can be shared and verified worldwide." },
  { icon: LockKeyhole, title: "Increases trust", body: "Builds confidence between institutions, employers and graduates." },
  { icon: Leaf, title: "Environmentally friendly", body: "Digital credentials reduce paper waste." },
];

export default function WhyCredence() {
  return (
    <section className="scroll-anchor border-y border-[#CFE1F2] bg-[#EAF2FB] py-20 sm:py-24" id="why">
      <div className="landing-wrap grid gap-14 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] lg:gap-20">
        <div className="max-w-[29rem]">
          <p className="cred-section-kicker">Why Credence</p>
          <h2 className="cred-section-title mt-3">Trusted by universities.<br />Verified by anyone.</h2>
          <p className="mt-5 text-[1rem] leading-7 text-[#4A5A68]">
            Our blockchain-backed system ensures credentials are secure, tamper-proof and easy to verify — for a more transparent and trustworthy future.
          </p>
          <a href="#lifecycle" className="cred-btn cred-btn-primary mt-7">Learn more <span aria-hidden="true">→</span></a>
        </div>
        <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2 xl:grid-cols-3">
          {benefits.map(({ icon: Icon, title, body }) => (
            <article key={title} className="flex gap-3.5">
              <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#D6B76B] bg-[#F8F7F2] text-[#B98A28]">
                <Icon size={18} strokeWidth={1.6} />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-[#08283F]">{title}</h3>
                <p className="mt-1.5 text-[.84rem] leading-5 text-[#4A5A68]">{body}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
