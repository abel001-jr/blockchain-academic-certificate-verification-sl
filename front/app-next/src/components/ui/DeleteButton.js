"use client";
import styles from "./DeleteButton.module.css";
export default function DeleteButton({ children = "Delete", iconOnly = false, className = "", type = "button", ...props }) {
  return <button {...props} type={type} className={`${styles.button} ${iconOnly ? styles.iconOnly : ""} ${className}`}>
    {!iconOnly && <span className={styles.text}>{children}</span>}
    <span className={styles.panel} aria-hidden="true"><span className={styles.bin}>
      <svg className={styles.lid} viewBox="0 0 26 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 6h22M9 6V2h8v4" /></svg>
      <span className={styles.paper} />
      <svg className={styles.bottom} viewBox="0 0 20 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 1h16l-1 19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M7 5v12m6-12v12" /></svg>
    </span></span>
  </button>;
}
