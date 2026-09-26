"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function CredentialFlowSelection() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the certificate creation flow
    // Credentials = Certificates + Transcripts as unified records
    router.push("/dashboard/certificates/new");
  }, [router]);

  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="text-center">
        <Loader2 size={32} className="mx-auto animate-spin text-[#C59A3A]" />
        <p className="mt-4 text-sm text-[#687B8E]">Redirecting to credential issuance...</p>
      </div>
    </div>
  );
}
