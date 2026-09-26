"use client";

import { getPreset } from "@/lib/certPresets";
import { awardParts } from "@/lib/qualificationWording";
import { formatVerifiedDate, shortTxHash } from "@/lib/signatureCanvas";

function SignerBlock({
  name,
  title,
  signedAt,
  signatureUrl,
  txHash,
  theme,
}) {
  const verified = signedAt ? formatVerifiedDate(signedAt) : "";
  const showTx = txHash && signedAt;

  return (
    <div className="text-left min-w-0">
      <div className="pt-1" style={{ borderColor: theme.primary }}>
        {signatureUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={signatureUrl}
            alt=""
            className="h-10 max-w-full object-contain object-left mb-1"
          />
        ) : null}
        <div className="border-t pt-2" style={{ borderColor: theme.primary }}>
          <p className="text-xs font-semibold truncate" style={{ color: theme.primary }}>
            {name && name !== title ? name : title}
          </p>
          <p className="text-[10px]" style={{ color: theme.muted }}>{title}</p>
          {verified ? (
            <>
              <p className="text-[10px] mt-0.5" style={{ color: theme.muted }}>
                Digitally Verified — {verified}
              </p>
              {showTx && (
                <p className="text-[9px] mt-0.5 font-mono break-all" style={{ color: theme.muted }}>
                  Tx: {shortTxHash(txHash)}
                </p>
              )}
            </>
          ) : (
            <p className="text-[10px] mt-0.5 italic" style={{ color: theme.muted }}>
              Awaiting signature
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Live certificate preview — formal conferral language by qualification_type.
 */
export default function CertificatePreview({
  certificate,
  presetId,
  logoUrl = "",
  institutionName,
  className = "",
}) {
  const theme = getPreset(presetId || certificate?.branding_preset || "classic_navy");
  const name = institutionName || certificate?.institution_name || "Institution";
  const student = certificate?.student_name || "—";
  const dept = certificate?.department || "";
  const grade = certificate?.grade || "";
  const year = certificate?.graduation_year || "";
  const certId = certificate?.certificate_id || "";

  const award = awardParts(
    certificate?.qualification_type,
    certificate?.degree_title,
  );

  const regName =
    certificate?.registrar_signer_name ||
    certificate?.issued_by_name ||
    "";
  const vcName = certificate?.vc_approver_name || "";
  const chName = certificate?.chancellor_approver_name || "";

  const details = [grade, year].filter(Boolean).join(" · ");

  return (
    <div
      className={`w-full overflow-hidden rounded-[4px] shadow-sm ${className}`}
      style={{
        background: theme.bg,
        border: `3px solid ${theme.primary}`,
        boxShadow: `inset 0 0 0 1px ${theme.accent}`,
      }}
    >
      <div className="px-6 py-8 sm:px-10 sm:py-10 flex flex-col items-center text-center min-h-[320px]">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            className="h-14 w-14 object-contain mb-3"
          />
        ) : null}

        <p
          className="font-serif text-lg sm:text-xl font-bold tracking-wide uppercase leading-tight"
          style={{ color: theme.primary, fontFamily: "Georgia, 'Times New Roman', serif" }}
        >
          {name}
        </p>
        <p
          className="text-[10px] sm:text-xs uppercase tracking-[0.2em] mt-1.5 mb-6"
          style={{ color: theme.accent }}
        >
          Academic Certificate
        </p>

        <p className="text-xs sm:text-sm" style={{ color: theme.muted }}>
          This is to certify that
        </p>
        <p
          className="font-serif text-2xl sm:text-3xl font-bold mt-2 mb-3"
          style={{ color: theme.primary, fontFamily: "Georgia, 'Times New Roman', serif" }}
        >
          {student}
        </p>

        <p className="text-xs sm:text-sm max-w-md leading-relaxed" style={{ color: theme.muted }}>
          {award.studyLine}
        </p>
        <p className="text-xs sm:text-sm mt-1" style={{ color: theme.muted }}>
          {award.awardIntro}
        </p>
        <p
          className="font-serif text-base sm:text-lg font-bold mt-2 max-w-lg leading-snug px-2"
          style={{ color: theme.primary, fontFamily: "Georgia, 'Times New Roman', serif" }}
        >
          {award.awardPhrase}
        </p>

        {dept ? (
          <p className="text-xs mt-2" style={{ color: theme.muted }}>{dept}</p>
        ) : null}
        {details ? (
          <p className="text-xs sm:text-sm font-semibold mt-3" style={{ color: theme.accent }}>
            {details}
          </p>
        ) : null}

        <div className="w-full grid grid-cols-3 gap-3 sm:gap-6 mt-10 px-1 sm:px-4">
          <SignerBlock
            name={regName}
            title="Registrar"
            signedAt={certificate?.registrar_signed_at}
            signatureUrl={certificate?.registrar_signature_url}
            theme={theme}
          />
          <SignerBlock
            name={vcName}
            title="Vice Chancellor"
            signedAt={certificate?.vc_approved_at}
            signatureUrl={certificate?.vc_signature_url}
            txHash={certificate?.vc_approval_tx_hash}
            theme={theme}
          />
          <SignerBlock
            name={chName}
            title="Dean"
            signedAt={certificate?.chancellor_approved_at}
            signatureUrl={certificate?.chancellor_signature_url}
            txHash={certificate?.chancellor_approval_tx_hash}
            theme={theme}
          />
        </div>

        {certId ? (
          <p className="text-[10px] mt-8 font-mono" style={{ color: theme.muted }}>
            Certificate ID: {certId}
          </p>
        ) : null}
      </div>
    </div>
  );
}
