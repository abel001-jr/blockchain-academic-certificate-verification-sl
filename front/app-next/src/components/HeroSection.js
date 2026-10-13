
import { ActionButton } from "@/components/ui/AnimatedControls";
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
            Issue secure academic credentials, share them with graduates, and let employers verify the record independently. Wallets, IPFS and blockchain connect each step.
          </p>

          <div className="cred-hero-actions">
            <ActionButton href="/#verify"    className="cred-btn cred-btn-primary cred-btn-hero">
              Verify a certificate
            </ActionButton>
            <ActionButton href="/apply" className="cred-btn cred-btn-primary cred-btn-hero">
              Apply as an institution
            </ActionButton>
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
