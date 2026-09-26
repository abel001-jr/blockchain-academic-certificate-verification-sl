"use client";
import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function CredentialDetailRedirect() {
  const router = useRouter();
  const params = useParams();
  const id = params.id;

  useEffect(() => {
    // Redirect to certificate detail page
    // Credentials = Certificates + Transcripts as unified records
    if (id) {
      router.push(`/dashboard/certificates/${id}`);
    }
  }, [id, router]);

  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="text-center">
        <Loader2 size={32} className="mx-auto animate-spin text-[#C59A3A]" />
        <p className="mt-4 text-sm text-[#687B8E]">Loading credential details...</p>
      </div>
    </div>
  );
}
