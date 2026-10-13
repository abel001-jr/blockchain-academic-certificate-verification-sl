import CertificateDetailPage from "@/app/dashboard/certificates/[id]/page";
import CertificateDetailDialog from "@/components/dashboard/CertificateDetailDialog";

export default function FloatingCertificateDetails() {
  return <CertificateDetailDialog intercepted><CertificateDetailPage /></CertificateDetailDialog>;
}
