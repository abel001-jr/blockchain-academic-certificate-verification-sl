"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { verificationPath } from "@/lib/parseCertificateScan";

export default function CertificateQrCard({ certificateId, compact = false }) {
  const [src, setSrc] = useState("");
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!certificateId) return;
    const origin = window.location.origin;
    const full = `${origin}${verificationPath(certificateId)}`;
    setUrl(full);
    QRCode.toDataURL(full, {
      width: compact ? 140 : 200,
      margin: 1,
      color: { dark: "#08283F", light: "#FFFFFF" },
    }).then(setSrc);
  }, [certificateId, compact]);

  if (!certificateId) return null;

  return (
    <div className={`flex ${compact ? "flex-row items-center gap-4" : "flex-col items-center gap-3"} bg-[#F8F7F2] border border-[#E4E1D6] rounded-xl ${compact ? "px-4 py-3" : "px-6 py-5"}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`QR code for ${certificateId}`} width={compact ? 88 : 160} height={compact ? 88 : 160} />
      ) : (
        <div className={compact ? "w-[88px] h-[88px] bg-[#E4E1D6] rounded" : "w-40 h-40 bg-[#E4E1D6] rounded"} />
      )}
      <div className={compact ? "min-w-0 text-left" : "text-center"}>
        <p className="text-[#08283F] text-sm font-semibold">Verification QR</p>
        <p className="text-[#4A5A68] text-xs mt-1 leading-relaxed">
          Scan to open the public verify page. Same URL for both issuance flows.
        </p>
        <p className="font-mono text-[#08283F] text-[11px] mt-2 break-all">{certificateId}</p>
        {url && (
          <a href={url} className="text-[#B98A28] text-xs font-semibold hover:underline mt-1 inline-block break-all">
            {url.replace(/^https?:\/\//, "")}
          </a>
        )}
      </div>
    </div>
  );
}
