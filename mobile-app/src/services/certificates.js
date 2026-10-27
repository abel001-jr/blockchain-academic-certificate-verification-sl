/**
 * Certificate service — fetch, verify, and apply for certificates.
 * Mirrors the Django certify/certificates and verification endpoints.
 */
import api from "./api";
import { parseVerificationInput } from "../utils/parseCertificateScan";

/**
 * Get the logged-in student's issued/revoked certificates.
 * Hits GET /my-certificates/ (StudentCertificatesView).
 * Returns list of CertificateListSerializer objects with fields:
 *   id, certificate_id, student_name, degree_title, graduation_year,
 *   status, institution_name, issued_by_name, chain_issued_at, created_at
 */
export async function getMyCertificates() {
  const records = [];
  let page = 1;
  let data;
  do {
    const res = await api.get("/my-certificates/", { params: { page: page++ } });
    data = res.data;
    records.push(...(Array.isArray(data) ? data : data.results ?? []));
  } while (data.next);
  return records;
}

/**
 * Verify a certificate by its certificate_id string.
 * Uses the saved session when available; signed-out verification stays public.
 * Endpoint: GET /api/verify/<certificate_id>/   (AllowAny)
 */
export async function verifyCertificate(certificateId) {
  const input = parseVerificationInput(certificateId);
  if (!/^[A-Za-z0-9_-]+$/.test(input.certificateId)) throw new Error("Enter a valid credential ID or a credential verification link.");
  const path = `/verify/${encodeURIComponent(input.certificateId)}/`;
  const options = { timeout: 300000, params: input.code ? { code: input.code } : undefined };
  let res;
  try { res = await api.get(path, options); }
  catch (error) {
    if (error?.response?.status !== 401) throw error;
    res = await api.get(path, { ...options, publicAuth: true });
  }
  if (!["valid", "revoked", "not_found", "not_verified", "tampered", "unavailable"].includes(res.data?.verification_outcome)) {
    throw new Error("The server returned an incomplete verification result. Please try again.");
  }
  return res.data;
}

/** Get full detail for one certificate by UUID (authenticated, registrar/admin). */
export async function getCertificateDetail(id) {
  const res = await api.get(`/certificates/${id}/`);
  return res.data;
}

/**
 * Download the graduate's own copy of a credential: the certificate and its
 * transcript as one zip.
 *
 * Endpoint: GET /api/my-certificates/<certificate_id>/documents/  (IsFullSession)
 *
 * Public verification deliberately serves no documents (REMAINING_WORK item 1),
 * so this owner-scoped route is the only way a student gets the PDFs. It returns
 * the *pair* because the design doc treats the two as one credential — making a
 * graduate assemble their own award from two downloads would be handing back a
 * worse version of the same record.
 *
 * `responseType: "arraybuffer"` because the body is a zip, not JSON. The
 * interceptor on `api` still attaches the JWT, which is what authorises it.
 */
export async function downloadMyDocuments(certificateId) {
  const res = await api.get(
    `/my-certificates/${encodeURIComponent(certificateId)}/documents/`,
    { responseType: "arraybuffer", timeout: 90000 },
  );
  return res.data; // Uint8Array / ArrayBuffer
}

export async function createVerificationShare(certificateId, expiresMinutes = 15) {
  const response = await api.post(`/my-certificates/${encodeURIComponent(certificateId)}/share-codes/`, {expires_minutes: expiresMinutes, single_use: true});
  return response.data;
}

/** Preflight never consumes student access. */
export async function validateEmployerAccess(raw) {
  const input = parseVerificationInput(raw);
  if (!input.code || !/^[A-Za-z0-9_-]+$/.test(input.certificateId)) throw new Error("Paste the full student share link, including its access code.");
  const response = await api.post(`/verify/${encodeURIComponent(input.certificateId)}/access/`, {code: input.code}, {publicAuth: true});
  return {...response.data, ...input};
}

export async function verifyEmployerDocuments(access, files) {
  if (!access?.code || !files.certificate) throw new Error("Validate the student link and choose the certificate PDF first.");
  const body = new FormData();
  for (const kind of ["certificate", "transcript"]) {
    const file = files[kind];
    if (!file) continue;
    if (file.file) body.append(kind, file.file, file.name);
    else body.append(kind, {uri: file.uri, name: file.name, type: file.mimeType || "application/pdf"});
  }
  const response = await api.post(`/verify/${encodeURIComponent(access.certificateId)}/verify-documents/?code=${encodeURIComponent(access.code)}`, body,
    {publicAuth: true, headers: {"Content-Type": "multipart/form-data"}, timeout: 300000});
  return response.data;
}

export async function getMyDocumentPreview(certificateId, document = "certificate", page = 1) {
  const response = await api.get(`/my-certificates/${encodeURIComponent(certificateId)}/documents/`,
    {params: {document, preview: "true", page}, responseType: "arraybuffer", timeout: 90000});
  return {bytes: response.data, pages: Number(response.headers["x-document-pages"] || 1), source: response.headers["x-document-source"] || "unknown"};
}
