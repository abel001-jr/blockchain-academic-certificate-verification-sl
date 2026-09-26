"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

const navLinks = [
  { label: "How it works",   anchor: "lifecycle"    },
  { label: "Why blockchain", anchor: "why"          },
  { label: "Who it's for",   anchor: "stakeholders" },
  { label: "Verify",         anchor: "verify"       },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isHome = pathname === "/";

  function href(anchor) {
    return isHome ? `#${anchor}` : `/#${anchor}`;
  }

  return (
    <nav className="cred-nav-wrap">
      <div className="cred-nav">

        {/* Brand */}
        <Link href="/" className="cred-brand" aria-label="Credence home">
          <span className="cred-brand-mark" aria-hidden="true">
            <Image
              src="/fav.png"
              alt=""
              width={96}
              height={96}
              priority
            />
          </span>
          <span className="cred-brand-name">Credence</span>
        </Link>

        {/* Desktop nav links */}
        <div className="cred-nav-links">
          {navLinks.map(({ label, anchor }) => (
            <Link key={anchor} href={href(anchor)} className="cred-nav-link">
              {label}
            </Link>
          ))}
        </div>

        {/* Desktop CTA buttons */}
        <div className="cred-nav-actions">
          <Link href="/login" className="cred-btn cred-btn-secondary">
            Institution sign in
          </Link>
          <Link href={href("verify")} className="cred-btn cred-btn-primary">
            Verify a certificate
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="cred-nav-burger"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="cred-nav-drawer">
          {navLinks.map(({ label, anchor }) => (
            <Link
              key={anchor}
              href={href(anchor)}
              className="cred-nav-drawer-link"
              onClick={() => setOpen(false)}
            >
              {label}
            </Link>
          ))}
          <div className="cred-nav-drawer-actions">
            <Link href="/login"  className="cred-btn cred-btn-secondary w-full text-center" onClick={() => setOpen(false)}>
              Institution sign in
            </Link>
            <Link href={href("verify")} className="cred-btn cred-btn-primary  w-full text-center" onClick={() => setOpen(false)}>
              Verify a certificate
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
