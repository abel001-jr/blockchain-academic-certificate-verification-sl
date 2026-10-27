"use client";


import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import AnimatedBrandMark from "./ui/AnimatedBrandMark";
import { usePathname } from "next/navigation";
import { Menu, X, ChevronDown } from "lucide-react";
import styles from "./Navbar.module.css";
import { visibleSection } from "@/lib/visibleSection.mjs";
import { publicNavigation, publicNavigationGroups, publicNavigationHref } from "@/lib/publicNavigation";

const navLinks = publicNavigation;

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isHome = pathname === "/";
  const navRef = useRef(null);
  const [activeSection, setActiveSection] = useState("");
  const closeGroups = () => navRef.current?.querySelectorAll("details[open]").forEach(item => {item.open = false;});
  useEffect(() => {
    const dismiss = event => {if (!navRef.current?.contains(event.target)) closeGroups();};
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);


  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1101px)");
    const switchLayout = () => {
      setOpen(false);
      navRef.current?.querySelectorAll("details[open]").forEach(group => {group.open = false;});
    };
    desktop.addEventListener("change", switchLayout);
    return () => desktop.removeEventListener("change", switchLayout);
  }, []);


  useEffect(() => {
    if (!isHome) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const headerBottom = navRef.current?.querySelector(".cred-nav")?.getBoundingClientRect().bottom || 0;
      const sections = navLinks.flatMap(({anchor}) => {
        const section = anchor && document.getElementById(anchor);
        if (!section) return [];
        const rect = section.getBoundingClientRect();
        const style = getComputedStyle(section);
        return [{anchor, top: rect.top, bottom: rect.bottom,
          hidden: !section.getClientRects().length || style.visibility === "hidden" || style.display === "none"}];
      });
      setActiveSection(visibleSection(sections, headerBottom, window.innerHeight));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    if (document.querySelector("main")) observer.observe(document.querySelector("main"));
    if (navRef.current) observer.observe(navRef.current);
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("hashchange", schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("hashchange", schedule);
    };
  }, [isHome]);

  const currentLocation = ({ anchor, destination }) => destination === pathname
    ? "page"
    : isHome && anchor === activeSection ? "location" : undefined;


  return (
    <nav ref={navRef} data-active-section={activeSection || undefined} className="cred-nav-wrap" aria-label="Main navigation" onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); closeGroups(); } }}>
      <div className="cred-nav">

        {/* Brand */}
        <Link href="/" onClick={() => setOpen(false)} className="cred-brand" aria-label="Intelligent Academic Credentialing home">
          <AnimatedBrandMark priority />
          <span className="cred-brand-name">Intelligent Academic Credentialing</span>
        </Link>

        {/* Desktop nav links */}
        <div className="cred-nav-links">
          {publicNavigationGroups.map(group => <details key={group.label} className={styles.group} onToggle={event => {
            if (event.currentTarget.open) navRef.current?.querySelectorAll("details[open]").forEach(other => {if (other !== event.currentTarget) other.open = false;});
          }}>
            <summary className={`cred-nav-link ${styles.groupTrigger}`} data-current={group.items.some(item => Boolean(currentLocation(item))) ? "true" : "false"}>{group.label}<ChevronDown size={14} aria-hidden="true" /></summary>
            <div className={styles.dropdown}>{group.items.map(item => <Link key={item.anchor} href={publicNavigationHref(item, isHome)} aria-current={currentLocation(item)} className={styles.dropdownLink} onClick={closeGroups}>{item.label}</Link>)}</div>
          </details>)}
          <Link href={publicNavigationHref({anchor: "get-started"}, isHome)} className={`cred-nav-link${currentLocation({anchor: "get-started"}) ? " active" : ""}`} aria-current={currentLocation({anchor: "get-started"})} onClick={closeGroups}>Get started</Link>
          <Link href={publicNavigationHref({anchor: "verify"}, isHome)} className={`cred-nav-link${currentLocation({anchor: "verify"}) ? " active" : ""}`} aria-current={currentLocation({anchor: "verify"})}>Verify a credential</Link>
        </div>

        {/* Desktop CTA buttons */}
        <div className="cred-nav-actions">
          <Link href="/login" className="cred-btn cred-btn-secondary">
            Sign in
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="cred-nav-burger"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="public-navigation-menu"
          type="button"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div id="public-navigation-menu" className="cred-nav-drawer">
          {publicNavigationGroups.map(group => <details key={group.label} className={styles.mobileGroup}>
            <summary className={styles.mobileHeading} data-current={group.items.some(item => Boolean(currentLocation(item)))}>{group.label}<ChevronDown size={17} aria-hidden="true" /></summary>
            <div className={styles.mobileLinks}>
            {group.items.map(item => <Link key={item.anchor} href={publicNavigationHref(item, isHome)} className={`cred-nav-drawer-link${currentLocation(item) ? " active" : ""}`} aria-current={currentLocation(item)} onClick={() => setOpen(false)}>{item.label}</Link>)}
            </div>
          </details>)}
          <Link href={publicNavigationHref({anchor: "get-started"}, isHome)} className={`cred-nav-drawer-link${currentLocation({anchor: "get-started"}) ? " active" : ""}`} aria-current={currentLocation({anchor: "get-started"})} onClick={() => setOpen(false)}>Get started</Link>
          <Link href={publicNavigationHref({anchor: "verify"}, isHome)} className={`cred-nav-drawer-link${currentLocation({anchor: "verify"}) ? " active" : ""}`} aria-current={currentLocation({anchor: "verify"})} onClick={() => setOpen(false)}>Verify a credential</Link>
          <div className="cred-nav-drawer-actions">
            <Link href="/login"  className="cred-btn cred-btn-secondary w-full text-center" onClick={() => setOpen(false)}>
              Sign in
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
