import { ActionButton } from "./AnimatedControls";
import styles from "./LandingCard.module.css";

export default function LandingCard({ variant = "issuance", borderless = false, compact = false, number, icon: Icon, title, children, footer, href, onAction, cta, className = "", ...props }) {
  return (
    <article {...props} className={`${styles.card} ${styles[variant]} ${compact ? styles.compact : ""} ${borderless ? styles.borderless : ""} ${className}`}>
      {number && <span className={styles.number}>{number}</span>}
      <div className={styles.surface}>
        <div className={styles.shine} aria-hidden="true" />
        <div className={styles.visual} aria-hidden="true">
          {variant === "luminous" && <><span className={styles.beam} /><span className={styles.slit} /></>}
          {Icon && <Icon size={40} strokeWidth={1.4} className={styles.icon} />}
        </div>
        <div className={styles.content}>
          <h3 className={styles.title}>{title}</h3>
          <div className={styles.description}>{children}</div>
          {footer && <div className={styles.footer}>{footer}</div>}
          {(href || onAction) && cta && <ActionButton href={href} onClick={onAction} type={href ? undefined : "button"} tone={variant === "luminous" ? "inverse" : undefined} className={styles.cta}>{cta}<span aria-hidden="true"> &rarr;</span></ActionButton>}
        </div>
      </div>
    </article>
  );
}
