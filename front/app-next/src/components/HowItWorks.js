const steps = [
  {
    number: "01",
    title: "Registrar Signs In",
    body: "The registrar authenticates into the INTELLIGENT ACADEMIC CREDENTIALING dashboard. Institutional admins manage access and roles.",
    active: true,
  },
  {
    number: "02",
    title: "Certificate Created & Uploaded",
    body: "The registrar creates the certificate record and uploads the PDF. A structured JSON representation is also generated.",
    active: true,
  },
  {
    number: "03",
    title: "Hashed & Pinned to IPFS",
    body: "SHA-256 hashes are generated for both the PDF and JSON. Both documents are pinned to IPFS via Pinata.",
    active: true,
  },
  {
    number: "04",
    title: "Blockchain Transaction Signed",
    body: "The registrar signs the transaction via MetaMask. The smart contract records the certificate hash, IPFS CIDs, issuer, and timestamp.",
    active: false,
  },
  {
    number: "05",
    title: "Student Receives Certificate",
    body: "The student can view, download, and share their certificate — including a QR code and shareable verification link.",
    active: false,
  },
  {
    number: "06",
    title: "Employer Verifies Independently",
    body: "The employer scans the QR code. Verification queries the blockchain directly — no reliance on the Django backend.",
    active: false,
  },
];

export default function HowItWorks() {
  return (
    <section className="py-20 px-4 md:px-10 max-w-[1920px] mx-auto" id="how-it-works">
      <div className="text-center mb-14">
        <h2 className="text-[#022448] font-bold text-4xl md:text-[48px] leading-tight tracking-tight">
          The Certificate Lifecycle
        </h2>
        <p className="text-[#43474e] text-lg mt-3">
          From issuance to independent verification — every step is secured by blockchain.
        </p>
      </div>

      {/* Timeline */}
      <div className="relative pl-14">
        {/* Vertical line */}
        <div className="absolute left-[19px] top-0 bottom-0 w-0.5 bg-[#c4c6cf]" />

        <div className="flex flex-col gap-12">
          {steps.map((step, i) => (
            <div key={i} className="relative">
              <div
                className={`absolute -left-14 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold z-10 ${
                  step.active ? "bg-[#7b5900] text-white" : "bg-[#74777f] text-white"
                }`}
              >
                {step.number}
              </div>
              <div>
                <h4 className="text-[#022448] font-semibold text-xl mb-2">{step.title}</h4>
                <p className="text-[#43474e] text-base leading-relaxed">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
