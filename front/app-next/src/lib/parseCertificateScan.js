/**
 * Extract a certificate ID from a QR payload.
 * PDFs encode `{origin}/verify/{certificate_id}`; scanners may also
 * return a raw ID, hash, or a query-string URL.
 */
export function parseCertificateIdFromScan(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return "";

  const fromPath = value.match(/\/verify\/([^/?#]+)/i);
  if (fromPath?.[1]) {
    try {
      return decodeURIComponent(fromPath[1]).trim();
    } catch {
      return fromPath[1].trim();
    }
  }

  try {
    const url = new URL(value);
    const id =
      url.searchParams.get("certificate_id") ||
      url.searchParams.get("id") ||
      url.searchParams.get("cert");
    if (id) return id.trim();
  } catch {
    // not a URL
  }

  return value;
}

/**
 * Extract the employer share code from a QR payload.
 *
 * Share links look like `{origin}/verify/{certificate_id}?code={raw}`.
 * `parseCertificateIdFromScan` intentionally keeps only the ID, so the code
 * has to be pulled out separately or it is silently dropped.
 */
export function parseShareCodeFromScan(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return "";

  try {
    const url = new URL(value);
    return (url.searchParams.get("code") || "").trim();
  } catch {
    return "";
  }
}

export function verificationPath(certificateId) {
  return `/verify/${encodeURIComponent(certificateId)}`;
}

export function verificationSharePath(certificateId, rawCode) {
  const base = verificationPath(certificateId);
  return rawCode ? `${base}?code=${encodeURIComponent(rawCode)}` : base;
}
