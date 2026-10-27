/**
 * Extract a certificate ID from a QR payload.
 * PDFs encode `{origin}/verify/{certificate_id}`.
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

export function parseVerificationInput(raw) {
  const value = String(raw ?? "").trim();
  const certificateId = parseCertificateIdFromScan(value);
  const match = value.match(/[?&]code=([^&#\s]*)/);
  let code = "";
  try { code = match ? decodeURIComponent(match[1]) : ""; } catch { /* Ignore malformed codes. */ }
  return { certificateId, code };
}
