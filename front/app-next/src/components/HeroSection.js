import Link from "next/link";
import CertificateHero from "@/components/CertificateHero";

export default function HeroSection() {
  return (
    <div className="cred-page">

      {/* ── Star-field background ─────────────────────────────── */}
      <div className="cred-stars" aria-hidden="true">
        <div id="cred-stars1" />
        <div id="cred-stars2" />
        <div id="cred-stars3" />
      </div>

      {/* ── Orbiting circle backdrop ─────────────────────────── */}
      <div className="cred-hero-backdrop" aria-hidden="true" />

      {/* ── Hero content ─────────────────────────────────────── */}
      <header className="cred-hero">

        {/* Left — copy */}
        <div className="cred-hero-copy">

          <div className="cred-eyebrow">Issue · Anchor · Verify</div>

          <h1 className="cred-h1">
            Issue credentials that anyone can verify.
          </h1>

          <p className="cred-hero-lead">
            Credence gives universities a secure way to issue blockchain-anchored
            academic credentials — and gives employers, institutions and graduates
            a simple, instant way to verify them independently, without contacting
            the records office.
          </p>

          <div className="cred-hero-actions">
            <Link href="#verify"    className="cred-btn cred-btn-primary cred-btn-hero">
              Verify a certificate
            </Link>
            <Link href="/apply"     className="cred-btn cred-btn-apply   cred-btn-hero">
              Issue as a university
            </Link>
            <Link href="#lifecycle" className="cred-btn cred-btn-secondary cred-btn-hero">
              See how it works
            </Link>
          </div>

          {/* Trust indicators */}
          <div className="cred-trust-line">
            {[
              "Blockchain-anchored",
              "Instantly verifiable",
              "No records office needed",
            ].map((t) => (
              <span key={t} className="cred-trust-item">
                <span className="cred-trust-dot" aria-hidden="true" />
                {t}
              </span>
            ))}
          </div>

        </div>

        {/* Right — animated certificate */}
        <div className="cred-hero-visual">
          <div className="cred-cert-shell">
            <CertificateHero />
          </div>
        </div>

      </header>
    </div>
  );
}
