"use client";
import { ROLES, isInstitutionHead, useAuth } from "@/lib/useAuth";
import SuperAdminDashboard from "@/components/dashboard/SuperAdminDashboard";
import RegistrarDashboard  from "@/components/dashboard/RegistrarDashboard";
import InstAdminDashboard from "@/components/dashboard/InstAdminDashboard";
import OfficerDashboard    from "@/components/dashboard/OfficerDashboard";
import StudentDashboard    from "@/components/dashboard/StudentDashboard";
import DashboardLoader     from "@/components/dashboard/DashboardLoader";
import WelcomeCard from "@/components/dashboard/WelcomeCard";

export default function DashboardPage() {
  const { role, loading } = useAuth();

  if (loading || !role) {
    return <DashboardLoader label="Loading dashboard workspace" />;
  }

  let dashboard;
  if (role === ROLES.SUPER_ADMIN) dashboard = <SuperAdminDashboard />;
  else if (role === ROLES.INSTITUTIONAL_ADMIN) dashboard = <InstAdminDashboard />;
  else if (isInstitutionHead(role)) dashboard = <RegistrarDashboard />;
  else if (role === ROLES.VC || role === ROLES.CHANCELLOR) dashboard = <OfficerDashboard role={role} />;
  else if (role === ROLES.STUDENT) dashboard = <StudentDashboard />;
  if (dashboard) return role === ROLES.STUDENT ? <><WelcomeCard />{dashboard}</> : dashboard;

  return (
    <div className="bg-white rounded-[14px] border border-[#c4c6cf]/15 p-8 max-w-lg">
      <h2 className="text-[#022448] font-bold text-lg mb-2">Unknown role</h2>
      <p className="text-[#43474e] text-sm">
        Your account role (<code className="text-[#7b5900]">{role}</code>) is not recognised.
      </p>
    </div>
  );
}
