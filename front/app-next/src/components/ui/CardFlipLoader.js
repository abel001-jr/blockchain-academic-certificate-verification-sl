/**
 * CardFlipLoader
 * Five stacked panels flip in sequence — compact inline loading state.
 * Source: card_flip.html (uiverse, MIT licence)
 * Adapted to Intelligent Academic Credentialing navy.
 *
 * Props:
 *   size  — px size of the square (default 33)
 *   color — CSS color string (default navy)
 */
export default function CardFlipLoader({ size = 33, color = "var(--color-navy)" }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className="cd-card-flip"
      style={{ width: size, height: size, "--flip-color": color }}
    >
      {[0.15, 0.3, 0.45, 0.6, 0.75].map((delay, i) => (
        <span key={i} style={{ animationDelay: `${delay}s` }} />
      ))}
    </span>
  );
}
