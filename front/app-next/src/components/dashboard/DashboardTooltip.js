"use client";
import { cloneElement, isValidElement, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./DashboardTooltip.module.css";

export default function DashboardTooltip({ title, detail, children, className = "", style }) {
  const id = useId();
  const anchor = useRef(null);
  const tooltip = useRef(null);
  const timer = useRef(null);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState(null);
  function hide() { clearTimeout(timer.current); setVisible(false); setPosition(null); }
  function show() { clearTimeout(timer.current); timer.current = setTimeout(() => setVisible(true), 250); }
  useLayoutEffect(() => {
    if (!visible || !anchor.current || !tooltip.current) return;
    const rect = anchor.current.getBoundingClientRect();
    const tip = tooltip.current.getBoundingClientRect();
    const left = Math.max(12, Math.min(rect.left + rect.width / 2 - tip.width / 2, window.innerWidth - tip.width - 12));
    const below = rect.bottom + 10;
    const top = below + tip.height <= window.innerHeight - 12 ? below : Math.max(12, rect.top - tip.height - 10);
    setPosition({ left, top });
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => { window.removeEventListener("scroll", hide, true); window.removeEventListener("resize", hide); };
  }, [visible]);
  useLayoutEffect(() => () => clearTimeout(timer.current), []);
  return <div ref={anchor} className={`${styles.anchor} ${className}`} style={style} aria-describedby={visible ? id : undefined}
    onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
    onPointerDown={event => { if (event.pointerType === "touch") { clearTimeout(timer.current); setVisible(value => !value); } }}
    onKeyDown={event => { if (event.key === "Escape") hide(); }}>
    {isValidElement(children) ? cloneElement(children, { "aria-describedby": visible ? id : undefined }) : children}
    {visible && createPortal(<div ref={tooltip} id={id} role="tooltip" className={styles.tooltip} style={{ ...position, visibility: position ? "visible" : "hidden" }}><strong>{title}</strong><span>{detail}</span></div>, document.body)}
  </div>;
}
