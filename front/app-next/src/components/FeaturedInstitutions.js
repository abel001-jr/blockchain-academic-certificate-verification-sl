const tiers = [
  {
    monogram: "01",
    name: "University",
    authority:
      "Full degree-granting authority — bachelor's, master's and PhD credentials. Formally accredited, including by the Tertiary Education Commission of Sierra Leone.",
    chain: "Typical approval chain: Registrar → Vice-Chancellor → Dean",
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
          Credence supports three kinds of issuing institution. Each tier is scoped to
          the authority it actually holds, so a certificate is never issued outside
          what the institution is accredited to award.
        </p>
        <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiers.map((tier) => (
            <article
              key={tier.name}
              className="flex min-h-64 flex-col rounded-md border border-[#E4E1D6] bg-white px-5 py-6"
            >
              <div className="font-serif text-xl font-semibold tracking-tight text-[#B98A28]">
                {tier.monogram}
              </div>
              <h3 className="mt-5 text-base font-semibold leading-5 text-[#08283F]">
                {tier.name}
              </h3>
              <p className="mt-3 text-xs leading-5 text-[#4A5A68]">{tier.authority}</p>
              <p className="mt-auto pt-5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[#718195]">
                {tier.chain}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
