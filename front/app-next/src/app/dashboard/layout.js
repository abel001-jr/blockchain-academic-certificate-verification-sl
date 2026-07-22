import DashboardShell from "@/components/dashboard/DashboardShell";

export const metadata = {
  title: "CREDENCE | Dashboard",
};

export default function DashboardLayout({ children }) {
  return <DashboardShell>{children}</DashboardShell>;
}
