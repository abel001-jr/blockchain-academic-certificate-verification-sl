"use client";


import { useState } from "react";
import Link from "next/link";
import AnimatedBrandMark from "./ui/AnimatedBrandMark";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { publicNavigation, publicNavigationHref } from "@/lib/publicNavigation";

const navLinks = publicNavigation;

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isHome = pathname === "/";


  return (
    <nav className="cred-nav-wrap" aria-label="Main navigation" onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
      <div className="cred-nav">

        {/* Brand */}
        <Link href="/" onClick={() => setOpen(false)} className="cred-brand" aria-label="Intelligent Academic Credentialing home">
          <AnimatedBrandMark priority />
          <span className="cred-brand-name">Intelligent Academic Credentialing</span>
        </Link>

        {/* Desktop nav links */}
        <div className="cred-nav-links">
          {navLinks.map(({ label, anchor, destination }) => (
            <Link key={destination || anchor} href={publicNavigationHref({ anchor, destination }, isHome)} className={`cred-nav-link${destination === pathname ? " active" : ""}`} aria-current={destination === pathname ? "page" : undefined}>
              {label}
            </Link>
          ))}
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
          {navLinks.map(({ label, anchor, destination }) => (
            <Link
              key={destination || anchor}
              href={publicNavigationHref({ anchor, destination }, isHome)}
              className="cred-nav-drawer-link"
              aria-current={destination === pathname ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              {label}
            </Link>
          ))}
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
