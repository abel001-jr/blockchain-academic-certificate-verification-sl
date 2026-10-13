"use client";

import Link from "next/link";
import styles from "./NavigationButton.module.css";

export default function NavigationButton({ as, href, direction = "forward", keepLabel = false, iconOnly = false, children, className = "", ...props }) {
  const Control = as === "a" ? "a" : href ? Link : "button";
  return <Control {...props} href={href} data-direction={direction} data-keep-label={keepLabel || undefined} className={`${className} ${styles.button} ${iconOnly ? styles.iconOnly : ""}`}>
    <span className={styles.icon} aria-hidden="true"><span className={styles.flight}><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M1.946 9.315c-.522-.174-.527-.455.01-.634l19.087-6.362c.529-.176.832.12.684.638l-5.454 19.086c-.15.529-.455.547-.679.045L12 14l6-8-8 6-8.054-2.685z" /></svg></span></span>
    {!iconOnly && <span className={styles.label}>{children}</span>}
  </Control>;
}
