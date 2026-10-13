"use client";
import { useEffect, useState } from "react";
import { api, jwtPayload } from "./api";

/**
 * Returns { user, role, loading }
 * - role is read from the JWT as soon as the client mounts
 * - loading is true only until that JWT read finishes
 * - user is filled from /auth/me/ in the background
 */
export function useAuth() {
  const [user,    setUser]    = useState(null);
  const [role,    setRole]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    let updated = false;
    const onProfileUpdated = event => {
      updated = true;
      setUser(event.detail);
      setRole(event.detail.role);
    };
    window.addEventListener("credence:profile-updated", onProfileUpdated);
    Promise.resolve().then(async () => {
      if (!alive) return;
      const payload = jwtPayload();
      setRole(payload?.role ?? null);
      setLoading(false);
      if (!payload) return;
      try {
        const data = await api.get("/auth/me/");
        if (alive && !updated) { setUser(data); setRole(data.role); }
      } catch { /* Session handling belongs to the API and dashboard guard. */ }
    });
    return () => {
      alive = false;
      window.removeEventListener("credence:profile-updated", onProfileUpdated);
    };
  }, []);

  return { user, role, loading };
}

export const ROLES = {
  SUPER_ADMIN:         "super_admin",
  INSTITUTIONAL_ADMIN: "institutional_admin",
  REGISTRAR:           "registrar",
  VC:                  "vc",
  CHANCELLOR:          "chancellor",
  STUDENT:             "student",
};

/** Registrar prepares and manages credential documentation. */
export function isInstitutionHead(role) {
  return role === ROLES.REGISTRAR;
}

export function isInstitutionSetupAdmin(role) {
  return role === ROLES.INSTITUTIONAL_ADMIN || role === ROLES.SUPER_ADMIN;
}
