import LandingCard from "./ui/LandingCard";
import { Building2 } from "lucide-react";
const tiers = [
  {
    monogram: "01",
    name: "University",
    authority:
      "Full degree-granting authority — bachelor's, master's and PhD credentials. Formally accredited, including by the Tertiary Education Commission of Sierra Leone.",
    chain: "Typical approval chain: Registrar → Vice-Chancellor → Chancellor",
  },
  {
    monogram: "02",
    name: "College",
    authority:
      "Diplomas, certificates and associate-level qualifications under a shorter, simpler hierarchy.",
    chain: "Typical approval chain: Registrar → Director",
  },
  {
    monogram: "03",
    name: "Institute",
    authority:
      "Vocational, technical and professional training — completion certificates and professional certifications.",
    chain: "Typical approval chain: single-officer sign-off",
  },
];

export default function FeaturedInstitutions() {
  return (
    <section className="py-20 sm:py-24">
      <div className="landing-wrap">
        <p className="cred-section-kicker">Issuing institutions</p>
        <h2 className="cred-section-title mt-3">Three tiers of credential issuer</h2>
        <p className="mt-4 max-w-[62ch] text-[#4A5A68] text-[1.02rem]">
          Intelligent Academic Credentialing supports three kinds of issuing institution. Each tier is scoped to
          the authority it actually holds, so a certificate is never issued outside
          what the institution is accredited to award.
        </p>
        <div className="mt-9 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {tiers.map((tier) => (
            <LandingCard key={tier.name} number={tier.monogram} icon={Building2} title={tier.name} footer={tier.chain} href="/apply" cta={`Apply as a ${tier.name.toLowerCase()}`}>
              <p>{tier.authority}</p>
            </LandingCard>
          ))}
        </div>
      </div>
    </section>
  );
}
