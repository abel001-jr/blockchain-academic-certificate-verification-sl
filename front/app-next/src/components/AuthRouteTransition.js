"use client";
import { useEffect, useLayoutEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./AuthRouteTransition.module.css";

export function AuthTransitionLink({ href, children, ...props }) {
  const router = useRouter();
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  function navigate(event) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const surface = document.querySelector("[data-auth-transition]");
    if (!surface) return;
    event.preventDefault();
    if (timer.current) return;
    surface.classList.add(styles.leaving);
    surface.setAttribute("aria-busy", "true");
    sessionStorage.setItem("credence:auth-transition", href);
    timer.current = setTimeout(() => router.push(href), 750);
  }
  return <Link {...props} href={href} onClick={navigate}>{children}</Link>;
}

export function AuthTransitionSurface({ children, className = "" }) {
  const surface = useRef(null);
  useLayoutEffect(() => {
    if (sessionStorage.getItem("credence:auth-transition") === window.location.pathname) {
      sessionStorage.removeItem("credence:auth-transition");
      surface.current?.classList.add(styles.entering);
    }
  }, []);
  return <div ref={surface} data-auth-transition className={`${styles.surface} ${className}`}>
    <div className={styles.sweepOne} aria-hidden="true" /><div className={styles.sweepTwo} aria-hidden="true" />
    {children}
  </div>;
}
