"use client";
import { useId } from "react";
import styles from "./AuthField.module.css";

export default function AuthField({ label, example, id, children, ...props }) {
  const generatedId = useId();
  const inputId = id || generatedId;
  return <div className={`${styles.field} ${children ? styles.withAction : ""}`}>
    <input {...props} pattern={props.pattern || (props.type === "email" ? "[^\\s@]+@[^\\s@]+\\.[^\\s@]+" : undefined)} id={inputId} placeholder={example || " "} />
    <label htmlFor={inputId}>{label}</label>
    {children && <div className={styles.action}>{children}</div>}
  </div>;
}
