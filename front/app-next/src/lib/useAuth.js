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
    const payload = jwtPayload();
    if (!payload) {
      setLoading(false);
      return;
    }
    setRole(payload.role ?? null);
    setLoading(false);

    api.get("/auth/me/")
      .then(data => { setUser(data); })
      .catch(() => {});
  }, []);

  return { user, role, loading };
}

export const ROLES = {
  SUPER_ADMIN:         "super_admin",
  INSTITUTIONAL_ADMIN: "institutional_admin", // legacy → treat as registrar
  REGISTRAR:           "registrar",
  VC:                  "vc",
  CHANCELLOR:          "chancellor",
  STUDENT:             "student",
};

/** Institution head (anchored issuer) — prepares certs, manages VC/Chancellor */
export function isInstitutionHead(role) {
  return role === ROLES.REGISTRAR || role === ROLES.INSTITUTIONAL_ADMIN;
}
