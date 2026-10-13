"use client";

import { Loader2 } from "lucide-react";
import { useAuth, ROLES } from "@/lib/useAuth";
import UploadedTemplatePanel from "./UploadedTemplatePanel";

export default function CertificateDraftEditor({ revisionId }) {
  const { role, loading } = useAuth();
  if (loading) return <p role="status" className="flex items-center gap-2"><Loader2 size={18} className="animate-spin" /> Loading draft editor...</p>;
  if (role !== ROLES.REGISTRAR) return <p role="alert">Certificate draft editing is available to your institution&apos;s registrar.</p>;
  return <div className="cd-certificate-editor min-w-0"><UploadedTemplatePanel editorRevisionId={revisionId} /></div>;
}
