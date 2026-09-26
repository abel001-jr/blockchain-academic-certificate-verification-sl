export default function Comparison() {
  return (
    <section className="scroll-anchor py-24 bg-[#EAF2FB] border-t border-b border-[#CFE1F2]" id="why">
      <div className="landing-wrap">
        <div className="max-w-[560px] mb-14">
          <h2 className="font-serif text-[2.1rem] font-medium text-[#08283F] leading-[1.22]">
            Why this replaces a phone call to the registrar
          </h2>
          <p className="mt-3.5 text-[#4A5A68] text-[1.02rem] max-w-[52ch]">
            The difference isn&apos;t complexity. It&apos;s who has to be reached, and how long it takes.
          </p>
        </div>

        <div className="flex flex-col gap-7 max-w-[720px]">
          <div className="flex items-center gap-3.5 flex-wrap text-[1.06rem]">
            <span className="text-[0.78rem] font-semibold text-[#08283F] bg-white px-2.5 py-1 rounded-full border border-[#CFE1F2]">
              Today
            </span>
            <span className="text-[#1B2734]">A certificate is presented</span>
            <span className="text-[#4A5A68] text-[0.9rem]">→</span>
            <span className="text-[#1B2734]">the institution is contacted</span>
            <span className="text-[#4A5A68] text-[0.9rem]">→</span>
            <span className="text-[#1B2734]">a records office responds, days later</span>
          </div>

          <div className="flex items-center gap-3.5 flex-wrap text-[1.06rem]">
            <span className="text-[0.78rem] font-semibold text-white bg-[#08283F] px-2.5 py-1 rounded-full border border-[#08283F]">
              With Credence
            </span>
            <span className="text-[#1B2734]">A certificate ID is entered or scanned</span>
            <span className="text-[#4A5A68] text-[0.9rem]">→</span>
            <span className="text-[#1B2734]">the record is checked directly</span>
            <span className="text-[#4A5A68] text-[0.9rem]">→</span>
            <span className="text-[#1B2734]">a confirmed result, immediately</span>
          </div>
        </div>

        <p className="mt-9 pt-7 border-t border-[#CFE1F2] text-[#4A5A68] text-[0.96rem] max-w-[62ch] leading-relaxed">
          The blockchain holds a tamper-evident fingerprint of every credential — issued once, readable by anyone, alterable by no one. That record is what makes verification instant and independent, with no institution's word required.
        </p>
      </div>
    </section>
  );
}
