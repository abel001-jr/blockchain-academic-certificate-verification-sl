/**
 * useCaptcha — lightweight hCaptcha integration hook.
 *
 * Loads the hCaptcha JS API once (via a <script> tag appended to <head>),
 * renders an invisible widget, and returns an `execute()` function that
 * resolves with a one-time token.
 *
 * When NEXT_PUBLIC_HCAPTCHA_ENABLED is not "true" (the default),
 * `execute()` immediately resolves with null so callers work unchanged in
 * development without any hCaptcha account or site key.
 *
 * Usage:
 *   const { captchaNode, execute } = useCaptcha();
 *   // render {captchaNode} somewhere in JSX (invisible widget mount point)
 *   const token = await execute();          // null when disabled
 *   // include token in X-Captcha-Token header if non-null
 *
 * hCaptcha docs: https://docs.hcaptcha.com/
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SITE_KEY   = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY  || "";
const ENABLED    = process.env.NEXT_PUBLIC_HCAPTCHA_ENABLED   === "true";
const SCRIPT_SRC = "https://js.hcaptcha.com/1/api.js?render=explicit&recaptchacompat=off";
const SCRIPT_ID  = "__hcaptcha_script__";

/** Append the hCaptcha script to <head> exactly once. */
function loadScript() {
  if (typeof window === "undefined") return;
  if (document.getElementById(SCRIPT_ID)) return;
  const s = document.createElement("script");
  s.id    = SCRIPT_ID;
  s.src   = SCRIPT_SRC;
  s.async = true;
  s.defer = true;
  document.head.appendChild(s);
}

export function useCaptcha() {
  const containerRef = useRef(null);
  const widgetIdRef  = useRef(null);
  const resolveRef   = useRef(null);
  const [ready, setReady] = useState(false);

  // Load script + wait for hcaptcha global to become available
  useEffect(() => {
    if (!ENABLED || !SITE_KEY) return;

    loadScript();

    let raf;
    function poll() {
      if (window.hcaptcha && containerRef.current && widgetIdRef.current === null) {
        widgetIdRef.current = window.hcaptcha.render(containerRef.current, {
          sitekey:  SITE_KEY,
          size:     "invisible",
          callback: (token) => {
            if (resolveRef.current) {
              resolveRef.current(token);
              resolveRef.current = null;
            }
            // Reset so the widget can be reused
            window.hcaptcha.reset(widgetIdRef.current);
          },
          "error-callback": () => {
            if (resolveRef.current) {
              resolveRef.current(null);
              resolveRef.current = null;
            }
          },
          "expired-callback": () => {
            if (resolveRef.current) {
              resolveRef.current(null);
              resolveRef.current = null;
            }
          },
        });
        setReady(true);
        return;
      }
      raf = requestAnimationFrame(poll);
    }
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, []);

  /**
   * Trigger the invisible captcha challenge and return a token string,
   * or null if captcha is disabled / the challenge failed.
   */
  const execute = useCallback(() => {
    if (!ENABLED || !SITE_KEY) return Promise.resolve(null);
    if (!ready || widgetIdRef.current === null) return Promise.resolve(null);

    return new Promise((resolve) => {
      resolveRef.current = resolve;
      window.hcaptcha.execute(widgetIdRef.current);
    });
  }, [ready]);

  // A zero-size invisible mount point — must be rendered in the component tree
  const captchaNode = ENABLED && SITE_KEY
    ? <div ref={containerRef} aria-hidden="true" style={{ display: "none" }} />
    : null;

  return { captchaNode, execute, ready: !ENABLED || ready };
}
