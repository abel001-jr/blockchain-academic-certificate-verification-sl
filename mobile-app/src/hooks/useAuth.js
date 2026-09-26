/**
 * useAuth hook — manages auth state across the app.
 * Call at the top level (App.js) and pass user/setUser via context or props.
 */
import { useState, useEffect } from "react";
import { getMe, logout as doLogout, getAccessToken } from "../services/auth";

export function useAuth() {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  // On app launch — check if we have a stored token and fetch profile
  useEffect(() => {
    (async () => {
      try {
        const token = await getAccessToken();
        if (token) {
          const me = await getMe();
          setUser(me);
        }
      } catch {
        // Token expired or invalid — stay logged out
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function logout() {
    await doLogout();
    setUser(null);
  }

  return { user, setUser, loading, logout };
}
