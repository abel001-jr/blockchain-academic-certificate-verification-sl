/**
 * CertificateHero
 * Portrait certificate — seal repositioned to bottom center.
 * Footer: QR left | Seal center | Cert ID right
 * Based on credence-hero-portrait.html
 */
export default function CertificateHero() {
  return (
    <div className="cred-cert" aria-label="Generic Credence certificate preview">

      {/* Gold scan-line sweep */}
      <div className="cred-cert-scan" aria-hidden="true" />

      {/* "Design Preview" pill — top right */}
      <div className="cred-cert-preview-badge" aria-hidden="true">Design Preview</div>

      {/* PREVIEW watermark */}
      <div className="cred-cert-watermark" aria-hidden="true">PREVIEW</div>

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="cred-cert-header">
        <div className="cred-cert-top-rule" />

        <div className="cred-cert-logo-wrap" aria-label="University logo placeholder">
          <div className="cred-cert-logo-mark">
            <span>U</span>
          </div>
        </div>

        <div className="cred-cert-university">University / Institution Name</div>
        <div className="cred-cert-type">Academic Certificate</div>
      </div>

      <div className="cred-cert-divider" />

      {/* ── Content (no right padding — seal moved to footer) ─ */}
      <div className="cred-cert-content">
        <div className="cred-cert-statement">This is to certify that</div>
        <div className="cred-cert-student">Student Name</div>
        <div className="cred-cert-support">
          has successfully completed the programme of study and<br />
          has been awarded the
        </div>
        <div className="cred-cert-degree">Degree / Programme Name</div>
        <div className="cred-cert-dept">Faculty / School / Department</div>
        <div className="cred-cert-honours">Classification / Award · Year</div>
      </div>

      {/* ── Footer ─────────────────────────────────────────── */}
      <div className="cred-cert-footer">

        {/* Signature blocks — 3-col grid */}
        <div className="cred-cert-sigs">
          <div className="cred-cert-sig">
            <div className="cred-cert-sig-line" />
            <div className="cred-cert-sig-name">Registrar</div>
            <div className="cred-cert-sig-role">Institutional approval</div>
            <div className="cred-cert-sig-note">Signature / approval</div>
          </div>
          <div className="cred-cert-sig">
            <div className="cred-cert-sig-line" />
            <div className="cred-cert-sig-name">Vice Chancellor</div>
            <div className="cred-cert-sig-role">Institutional approval</div>
            <div className="cred-cert-sig-note">Signature / approval</div>
          </div>
          <div className="cred-cert-sig">
            <div className="cred-cert-sig-line" />
            <div className="cred-cert-sig-name">Dean</div>
            <div className="cred-cert-sig-role">Institutional approval</div>
            <div className="cred-cert-sig-note">Signature / approval</div>
          </div>
        </div>

        {/* Footer metadata — 3-col grid: QR | Seal | Cert ID */}
        <div className="cred-cert-footer-meta">

          {/* Left — QR */}
          <div className="cred-cert-verify">
            <div className="cred-cert-qr" aria-label="QR code placeholder" />
            <div className="cred-cert-qr-copy">
              <strong>Scan to verify</strong>
              <span>Verification QR<br />for credential record</span>
            </div>
          </div>

          {/* Center — Seal */}
          <div className="cred-cert-body-seal" aria-label="Institution official seal">
            <div className="cred-cert-seal-center">C</div>
            <div className="cred-cert-seal-caption">Official Seal</div>
          </div>

          {/* Right — Cert ID */}
          <div className="cred-cert-meta">
            <div className="cred-cert-meta-label">Certificate ID</div>
            <div className="cred-cert-meta-value">CR-YYYY-INST-0000</div>
          </div>

        </div>

        {/* Status dot below footer */}
        <div className="cred-cert-status">
          <span className="cred-cert-status-dot" />
          Credential preview
        </div>

      </div>

    </div>
  );
}
