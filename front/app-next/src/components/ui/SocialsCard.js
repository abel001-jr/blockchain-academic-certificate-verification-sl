"use client";

/**
 * SocialsCard
 * A card with a gradient background whose corner panels sweep out on hover,
 * each revealing a social-link icon. Generic enough for any icon set.
 * Source: socials_card.html (uiverse, MIT licence)
 * Adapted: Intelligent Academic Credentialing navy gradient, paper/gold icon tints.
 *
 * Props:
 *   title   — text shown centred on the resting card (default "Connect")
 *   links   — array of { label, href, icon: ReactNode, gradient: string }
 *             up to 3 items (maps to box1, box2, box3)
 *   className — extra wrapper classes
 *
 * Example:
 *   <SocialsCard
 *     title="Project"
 *     links={[
 *       { label: "GitHub",   href: "https://github.com", icon: <GithubIcon />,   gradient: "linear-gradient(45deg,#24262a,#444)" },
 *       { label: "LinkedIn", href: "https://linkedin.com", icon: <LinkedinIcon />, gradient: "linear-gradient(45deg,#0274b3,#005983)" },
 *       { label: "Twitter",  href: "https://x.com",      icon: <TwitterIcon />,  gradient: "linear-gradient(45deg,#1da1f2,#0d8bd9)" },
 *     ]}
 *   />
 */
export default function SocialsCard({ title = "Connect", links = [], className = "" }) {
  const boxes = ["cd-sc-box1", "cd-sc-box2", "cd-sc-box3"];

  return (
    <div className={`cd-sc-card ${className}`}>
      {/* Gradient background layer */}
      <div className="cd-sc-bg" aria-hidden="true" />

      {/* Resting label */}
      <span className="cd-sc-logo">{title}</span>

      {/* Corner panels — one per link */}
      {links.slice(0, 3).map((link, i) => (
        <a
          key={i}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={link.label}
          className={`cd-sc-box ${boxes[i]}`}
          style={{ "--sc-box-gradient": link.gradient }}
        >
          <span className="cd-sc-icon" aria-hidden="true">
            {link.icon}
          </span>
        </a>
      ))}

      {/* 4th invisible spacer box (keeps geometry) */}
      <div className="cd-sc-box cd-sc-box4" aria-hidden="true" />
    </div>
  );
}
