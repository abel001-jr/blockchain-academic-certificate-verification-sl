"use client";
import { useRouter } from "next/navigation";
import FloatingDetailDialog from "./FloatingDetailDialog";

export default function CertificateDetailDialog({ children, intercepted = false }) {
  const router = useRouter();
  const close = () => intercepted ? router.back() : router.replace("/dashboard/certificates");
  return <FloatingDetailDialog title="Credential details" onClose={close}>{children}</FloatingDetailDialog>;
}
