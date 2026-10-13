/**
 * DotsLoader
 * Three pulsing dots — inline/button-level loading state.
 * Source: loader_nd.html (uiverse, MIT licence)
 * Adapted to Intelligent Academic Credentialing navy palette.
 *
 * Props:
 *   size   — "sm" | "md" (default "md")
 *   color  — "navy" (default) | "white" | "gold"
 */
export default function DotsLoader({ size = "md", color = "navy" }) {
  const colors = {
    navy:  "var(--color-navy)",
    white: "#ffffff",
    gold:  "var(--color-gold)",
  };

  const dotSize  = size === "sm" ? 8  : 13;
  const dotWidth = size === "sm" ? 12 : 20;
  const gap      = size === "sm" ? 6  : 10;
  const c        = colors[color] ?? colors.navy;

  return (
    <span
      role="status"
      aria-label="Loading"
      style={{ display: "inline-flex", alignItems: "center", gap }}
    >
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="cd-dots-dot"
          style={{
            width: dotWidth,
            height: dotSize,
            borderRadius: dotSize,
            backgroundColor: c,
            animationDelay: `${-0.1875 + i * 0.0625}s`,
          }}
        />
      ))}
    </span>
  );
}
