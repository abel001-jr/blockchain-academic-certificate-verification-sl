import IssueCertificatePage from "@/app/dashboard/certificates/new/page";

// Creation is a full-page workflow, never a certificate detail dialog.
export default function OpenIssuanceWorkflow() {
  return <section data-dashboard-issuance><IssueCertificatePage /></section>;
}
