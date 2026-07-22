"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

const navLinks = [
  { label: "Home",         anchor: "home" },
  { label: "Features",     anchor: "features" },
  { label: "Verification", anchor: "verify" },
  { label: "Institutions", anchor: "institutions" },
];

export default function Navbar() {
  const [open,     setOpen]     = useState(false);
  const [activeId, setActiveId] = useState("home");
  const pathname = usePathname();
  const isHome   = pathname === "/";

  // Only run intersection observer on the homepage
  useEffect(() => {
    if (!isHome) return;

    const observers = [];
    navLinks.forEach(({ anchor }) => {
      const el = document.getElementById(anchor);
      if (!el) return;
      const observer = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveId(anchor); },
        { rootMargin: "-20% 0px -70% 0px", threshold: 0 }
      );
      observer.observe(el);
      observers.push(observer);
    });
    return () => observers.forEach(o => o.disconnect());
  }, [isHome]);

  // Build the correct href: on homepage use #anchor, elsewhere use /#anchor
  function href(anchor) {
    return isHome ? `#${anchor}` : `/#${anchor}`;
  }

  return (
    <header className="fixed top-0 w-full z-50 bg-[#f8f9ff]/90 backdrop-blur-md shadow-sm">
      <div className="max-w-[1280px] mx-auto px-4 md:px-10 flex justify-between items-center h-20">

        {/* Logo — always goes back to homepage */}
        <Link href="/" className="flex items-center gap-2 select-none">
          <Image src="/logo.png" alt="CREDENCE" width={32} height={32} className="rounded-lg" />
          <span className="text-[#022448] text-2xl font-bold tracking-tighter">CREDENCE</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex gap-8 items-center">
          {navLinks.map(({ label, anchor }) => {
            const isActive = isHome && activeId === anchor;
            return (
              <Link
                key={anchor}
                href={href(anchor)}
                className={`text-sm font-medium transition-colors duration-200 pb-0.5 ${
                  isActive
                    ? "text-[#022448] font-semibold border-b-2 border-[#7b5900]"
                    : "text-[#43474e] hover:text-[#7b5900] border-b-2 border-transparent"
                }`}
              >
                {label}
              </Link>
            );
          })}

          <Link
            href="/apply"
            className="text-[#43474e] text-sm font-medium hover:text-[#7b5900] transition-colors"
          >
            Apply
          </Link>

          <Link
            href="/login"
            className="border border-[#022448] text-[#022448] px-5 py-2 rounded-[14px] text-sm font-medium hover:bg-[#022448] hover:text-white transition-all"
          >
            Institution Sign In
          </Link>

          <Link
            href={href("verify")}
            className="bg-[#022448] text-white px-6 py-2.5 rounded-[14px] text-sm font-semibold hover:opacity-90 transition-all active:scale-95"
          >
            Verify Certificate
          </Link>
        </nav>

        {/* Mobile toggle */}
        <button
          className="md:hidden text-[#022448] p-1"
          onClick={() => setOpen(!open)}
          aria-label="Toggle navigation"
        >
          {open ? <X size={28} /> : <Menu size={28} />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-[#f8f9ff] border-t border-[#c4c6cf]/30 px-4 py-6 flex flex-col gap-5">
          {navLinks.map(({ label, anchor }) => (
            <Link
              key={anchor}
              href={href(anchor)}
              className={`text-sm ${isHome && activeId === anchor ? "text-[#022448] font-semibold" : "text-[#43474e]"}`}
              onClick={() => setOpen(false)}
            >
              {label}
            </Link>
          ))}

          <Link href="/apply" className="text-[#43474e] text-sm" onClick={() => setOpen(false)}>
            Apply for Institution
          </Link>

          <Link
            href="/login"
            className="border border-[#022448] text-[#022448] px-5 py-2.5 rounded-[14px] text-sm font-medium text-center"
            onClick={() => setOpen(false)}
          >
            Institution Sign In
          </Link>

          <Link
            href={href("verify")}
            className="bg-[#022448] text-white px-6 py-3 rounded-[14px] text-sm font-semibold text-center"
            onClick={() => setOpen(false)}
          >
            Verify Certificate
          </Link>
        </div>
      )}
    </header>
  );
}
