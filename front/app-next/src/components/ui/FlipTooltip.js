"use client";

/**
 * FlipTooltip
 * A 3-D envelope / box that flips open a grid-paper tooltip above it on hover.
 * Source: mail.html (uiverse, MIT licence)
 * Adapted: Intelligent Academic Credentialing paper/navy palette — used for notification badges,
 * "unread messages" counts, or any context where a tactile reveal fits.
 *
 * Props:
 *   tip       — text shown in the floating tooltip panel (required)
 *   children  — content inside the box face (icon, count, emoji…)
 *   className — extra classes on the outer wrapper
 */
export default function FlipTooltip({ tip, children = "!", className = "" }) {
  return (
    <div className={`cd-flip-tip ${className}`} tabIndex={0} role="button" aria-label={tip}>
      {/* Floating tooltip panel — appears above on hover/focus */}
      <span className="cd-flip-tip-panel" role="tooltip">
        {tip}
      </span>

      {/* The visible "box" face */}
      <span className="cd-flip-tip-face">{children}</span>
    </div>
  );
}
