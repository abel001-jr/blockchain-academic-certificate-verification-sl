import CertificateDraftEditor from "@/components/dashboard/CertificateDraftEditor";

export default async function CertificateDraftEditorPage({ params }) {
  const { id } = await params;
  return <CertificateDraftEditor revisionId={id} />;
}
