export default function CredentialSignerIndicator() {
  return <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#CFE1F2] bg-[#EAF2FB] px-4 py-3 text-sm text-[#08283F]" aria-label="Three credential signers">
    <strong>3 required signers</strong><span>Registrar</span><span aria-hidden="true">→</span><span>Vice-Chancellor</span><span aria-hidden="true">→</span><span>Chancellor</span>
  </div>;
}
