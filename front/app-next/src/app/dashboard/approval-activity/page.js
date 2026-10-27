"use client";
import AuditRecords from "@/components/dashboard/AuditRecords";
import { useAuth, ROLES } from "@/lib/useAuth";

export default function ApprovalActivityPage() {
  const { role, loading } = useAuth();
  if (loading) return <p role="status">Loading approval activity...</p>;
  if (![ROLES.VC, ROLES.CHANCELLOR].includes(role)) return <p>Approval activity is available to Vice-Chancellors and Chancellors.</p>;
  return <AuditRecords approvalOnly />;
}
