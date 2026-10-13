"use client";

import Link from "next/link";
import { Download } from "lucide-react";
import styles from "./AnimatedControls.module.css";

export function ActionButton({ as, href, children, className = "", disabled, tone, ...props }) {
  const Control = as || (href ? Link : "button");
  return <Control {...props} href={href} disabled={disabled} data-tone={tone} className={`${className} ${styles.action}`}>
    <span className={styles.frame} aria-hidden="true"><i /><i /><i /><i /></span>
    <span className={styles.content}>{children}</span>
  </Control>;
}

export function DownloadButton({ as, href, children = "Download", iconOnly = false, className = "", disabled, ...props }) {
  const Control = as === "a" ? "a" : href ? Link : "button";
  return <Control {...props} href={href} disabled={disabled} className={`${className} ${styles.download} ${iconOnly ? styles.iconOnly : ""}`}>
    {!iconOnly && <span className={styles.downloadLabel}>{children}</span>}
    <span className={styles.downloadIcon} aria-hidden="true"><Download size={20} /></span>
  </Control>;
}
