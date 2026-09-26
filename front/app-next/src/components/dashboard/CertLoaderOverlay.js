"use client";

/**
 * CertLoaderOverlay
 * Full-screen loading overlay shown at exactly two moments in the
 * certificate lifecycle:
 *
 *   variant="view"     — navigating to the certificate detail page
 *                        (loading data + rendering preview)
 *
 *   variant="finalize" — generating the final PDF, pinning to IPFS,
 *                        and anchoring the hash on-chain via MetaMask
 *
 * Props:
 *   variant  – "view" | "finalize"
 *   open     – boolean; renders nothing when false
 */

const VARIANTS = {
  view: {
    title:   "Loading Certificate",
    message: "Fetching record and rendering preview",
    status:  "Certificate record is being prepared",
  },
  finalize: {
    title:   "Anchoring to Blockchain",
    message: "Generating PDF, pinning to IPFS, and recording on-chain",
    status:  "Blockchain transaction in progress",
  },
};

export default function CertLoaderOverlay({ variant = "view", open = false }) {
  if (!open) return null;

  const { title, message, status } = VARIANTS[variant] ?? VARIANTS.view;

  return (
    <div className="clo-overlay" role="status" aria-live="polite" aria-label={title}>
      <div className="clo-card">

        {/* ── Animated certificate graphic ─────────────────── */}
        <div className="clo-cert" aria-hidden="true">
          {/* Blockchain node connector lines */}
          <div className="clo-link clo-link-1" />
          <div className="clo-link clo-link-2" />

          {/* Certificate page */}
          <div className="clo-page">
            {/* Content skeleton lines */}
            <div className="clo-content">
              <div className="clo-line clo-line-title" />
              <div className="clo-line clo-line-medium" />
              <div className="clo-line" />
              <div className="clo-line clo-line-short" />
            </div>

            {/* Gold seal */}
            <div className="clo-seal" />

            {/* Signature line */}
            <div className="clo-signature" />

            {/* Gold scan sweep */}
            <div className="clo-scan" />
          </div>

          {/* Blockchain anchor nodes */}
          <div className="clo-node clo-node-1" />
          <div className="clo-node clo-node-2" />
          <div className="clo-node clo-node-3" />
        </div>

        {/* ── Brand mark ───────────────────────────────────── */}
        <div className="clo-brand" aria-hidden="true">
          <span className="clo-brand-mark" />
          Credence
        </div>

        {/* ── Text ─────────────────────────────────────────── */}
        <h2 className="clo-title">{title}</h2>

        <p className="clo-message">
          {message}
          <span className="clo-dots" aria-hidden="true">
            <span>.</span><span>.</span><span>.</span>
          </span>
        </p>

        {/* ── Status pill ──────────────────────────────────── */}
        <div className="clo-status">
          <span className="clo-status-dot" aria-hidden="true" />
          {status}
        </div>

      </div>
    </div>
  );
}
