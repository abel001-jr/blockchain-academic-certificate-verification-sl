"use client";
import { useParams, useRouter } from "next/navigation";
import OfficerDetailPanel from "@/components/dashboard/OfficerDetailPanel";
import FloatingDetailDialog from "@/components/dashboard/FloatingDetailDialog";
export default function OfficerDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const close = () => router.replace("/dashboard/officers");
  return <FloatingDetailDialog title="Officer details" onClose={close}><OfficerDetailPanel id={id} onClose={close} /></FloatingDetailDialog>;
}
