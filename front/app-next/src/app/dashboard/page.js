"use client";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { jwtPayload } from "@/lib/api";
import { ROLES, isInstitutionHead } from "@/lib/useAuth";
import SuperAdminDashboard from "@/components/dashboard/SuperAdminDashboard";
import RegistrarDashboard  from "@/components/dashboard/RegistrarDashboard";
import OfficerDashboard    from "@/components/dashboard/OfficerDashboard";
import StudentDashboard    from "@/components/dashboard/StudentDashboard";

export default function DashboardPage() {
  const [role,    setRole]    = useState(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const p = jwtPayload();
    if (!p) {
      window.location.href = "/login";
      return;
    }
    setRole(p.role ?? "unknown");
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="text-[#022448] animate-spin" />
      </div>
    );
  }

  if (role === ROLES.SUPER_ADMIN) return <SuperAdminDashboard />;
  if (isInstitutionHead(role))    return <RegistrarDashboard />;
  if (role === ROLES.VC || role === ROLES.CHANCELLOR) return <OfficerDashboard role={role} />;
  if (role === ROLES.STUDENT)     return <StudentDashboard />;

  return (
    <div className="bg-white rounded-[14px] border border-[#c4c6cf]/15 p-8 max-w-lg">
      <h2 className="text-[#022448] font-bold text-lg mb-2">Unknown role</h2>
      <p className="text-[#43474e] text-sm">
        Your account role (<code className="text-[#7b5900]">{role}</code>) is not recognised.
      </p>
    </div>
  );
}
