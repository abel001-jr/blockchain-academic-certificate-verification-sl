/**
 * Certificate service — fetch, verify, and apply for certificates.
 * Mirrors the Django certify/certificates and verification endpoints.
 */
import api from "./api";
import axios from "axios";
import config from "../config";

/**
 * Get the logged-in student's issued/revoked certificates.
 * Hits GET /certify/my-certificates/ (StudentCertificatesView).
 * Returns list of CertificateListSerializer objects with fields:
 *   id, certificate_id, student_name, degree_title, graduation_year,
 *   status, institution_name, issued_by_name, chain_issued_at, created_at
 */
export async function getMyCertificates() {
  const res = await api.get("/certify/my-certificates/");
  return Array.isArray(res.data) ? res.data : res.data.results ?? [];
}

/**
 * Verify a certificate by its certificate_id string.
 * Uses a plain axios call (no auth header) so it mirrors the web flow exactly.
 * Endpoint: GET /api/verify/<certificate_id>/   (AllowAny)
 */
export async function verifyCertificate(certificateId) {
  const res = await axios.get(
    `${config.API_BASE}/verify/${encodeURIComponent(certificateId)}/`,
    { timeout: 15000 },
  );
  return res.data;
}

/** Get full detail for one certificate by UUID (authenticated, registrar/admin). */
export async function getCertificateDetail(id) {
  const res = await api.get(`/certify/certificates/${id}/`);
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
    { responseType: "arraybuffer", timeout: 30000 },
  );
  return res.data; // Uint8Array / ArrayBuffer
}
