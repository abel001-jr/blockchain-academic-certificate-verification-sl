import DashboardShell from "@/components/dashboard/DashboardShell";

export const metadata = {
  title: "INTELLIGENT ACADEMIC CREDENTIALING | Dashboard",
};

export default function DashboardLayout({ children, details }) {
  return <DashboardShell><div data-dashboard-page>{children}</div>{details}</DashboardShell>;
}
