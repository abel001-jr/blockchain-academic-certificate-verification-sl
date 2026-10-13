"use client";

/**
 * MessengerTooltip
 * An icon button that morphs into a circle on hover while floating its
 * label upward. Generic enough for any action — not limited to Messenger.
 * Source: messenger_tooltip.html (uiverse, MIT licence)
 * Adapted: Intelligent Academic Credentialing navy base, gold accent, label uses ink colour.
 *
 * Props:
 *   label     — tooltip text shown above on hover (required)
 *   icon      — ReactNode — the SVG/icon to render inside (required)
 *   onClick   — click handler (optional)
 *   href      — if provided, renders an <a> instead of <button>
 *   className — extra classes
 *   ariaLabel — accessible name (defaults to label)
 */
export default function MessengerTooltip({
  label,
  icon,
  onClick,
  href,
  className = "",
  ariaLabel,
}) {
  const Tag   = href ? "a" : "button";
  const extra = href ? { href, target: "_blank", rel: "noopener noreferrer" } : { type: "button", onClick };

  return (
    <Tag
      {...extra}
      aria-label={ariaLabel ?? label}
      className={`cd-msg-btn ${className}`}
    >
      {icon}
      <span className="cd-msg-tooltip" role="tooltip" aria-hidden="true">
        {label}
      </span>
    </Tag>
  );
}
