"use client";

/**
 * SocialLinks
 * A horizontal row of circular icon links — each fills with its brand colour
 * from the bottom and floats a label tooltip above on hover.
 * Source: socials.html (uiverse, MIT licence)
 * Adapted: white circle base, Credence ink text, brand fills kept as-is
 * since they're used in footer (dark navy bg).
 *
 * Props:
 *   links — array of {
 *     label    : string          — tooltip + aria-label
 *     href     : string          — URL
 *     icon     : ReactNode       — SVG icon
 *     fillColor: string          — CSS colour / gradient for the hover fill
 *   }
 *   direction — "row" | "column" (default "row")
 *   className — extra classes on the <ul>
 *
 * Example (used in Footer):
 *   <SocialLinks links={[
 *     { label: "GitHub",   href: "https://github.com/...", icon: <GithubSvg />,   fillColor: "#24262a" },
 *     { label: "LinkedIn", href: "https://linkedin.com/",  icon: <LinkedinSvg />, fillColor: "#0274b3" },
 *   ]} />
 */
export default function SocialLinks({ links = [], direction = "row", className = "" }) {
  return (
    <ul
      className={`cd-social-list cd-social-list--${direction} ${className}`}
      role="list"
    >
      {links.map(({ label, href, icon, fillColor }) => (
        <li key={label} className="cd-social-item">
          {/* Tooltip */}
          <span className="cd-social-tip" role="tooltip" aria-hidden="true">
            {label}
          </span>

          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            className="cd-social-link"
            style={{ "--social-fill": fillColor }}
          >
            {/* Bottom-fill hover layer */}
            <span className="cd-social-fill" aria-hidden="true" />

            {/* Icon — sits above fill via z-index */}
            <span className="cd-social-icon">{icon}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
