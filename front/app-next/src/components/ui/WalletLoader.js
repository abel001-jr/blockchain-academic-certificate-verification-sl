/**
 * WalletLoader
 * Bills drop into a wallet — repurposed for blockchain tx processing
 * (credentials being anchored to the chain).
 * Source: wallet_money_loader.html (uiverse, MIT licence)
 * Adapted: wallet → navy, bills → gold/paper, currency symbol → ✦ (chain glyph).
 *
 * Props:
 *   label — text inside the wallet front (default "Anchoring…")
 */
export default function WalletLoader({ label = "Anchoring\u2026" }) {
  const dots = [0, 1, 2];

  // Split label from trailing dots so we animate only the dots
  const baseLabel = label.replace(/\.+$/, "");

  return (
    <div role="status" aria-label={label} className="cd-wallet-loader">
      <div className="cd-wallet-back" />

      {[1, 2, 3].map((n) => (
        <div key={n} className={`cd-wallet-bill cd-wallet-bill-${n}`} />
      ))}

      <div className="cd-wallet-front">
        <div className="cd-wallet-text">
          {baseLabel}
          {dots.map((i) => (
            <span key={i} className="cd-wallet-dot" />
          ))}
        </div>
      </div>
    </div>
  );
}
