import { Gavel, Building2, ClipboardEdit, GraduationCap, Briefcase } from "lucide-react";

const roles = [
  {
    icon: Gavel,
    title: "Super Admin",
    desc: "System governance, institution onboarding, platform monitoring and configuration.",
  },
  {
    icon: Building2,
    title: "Institutional Admin",
    desc: "Manages institutional settings, registrar accounts, roles and institutional profile.",
  },
  {
    icon: ClipboardEdit,
    title: "Registrar",
    desc: "Issues certificates, uploads documents, initiates blockchain transactions and handles revocations.",
  },
  {
    icon: GraduationCap,
    title: "Student",
    desc: "Views, downloads and shares issued certificates via QR codes and verification links.",
  },
  {
    icon: Briefcase,
    title: "Employer / Verifier",
    desc: "Verifies certificates by scanning a QR code or entering a Certificate ID — no account required.",
  },
];

export default function UserRoles() {
  return (
    <section className="bg-[#eef4ff] py-20 px-4 md:px-10" id="institutions">
      <div className="max-w-[1280px] mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-[#022448] font-bold text-4xl md:text-[48px] leading-tight tracking-tight">
            Designed for Every Stakeholder
          </h2>
          <p className="text-[#43474e] text-lg mt-3">
            Each role has a purpose-built interface exposing only what they need.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {roles.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="bg-white p-6 rounded-[14px] shadow-card flex flex-col items-center text-center gap-3"
            >
              <div className="w-12 h-12 rounded-full bg-[#022448]/5 flex items-center justify-center">
                <Icon size={22} className="text-[#022448]" strokeWidth={1.8} />
              </div>
              <h4 className="text-[#022448] font-semibold text-sm">{title}</h4>
              <p className="text-[#43474e] text-xs leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
