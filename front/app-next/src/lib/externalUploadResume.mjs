export function externalUploadResume(record, flowType) {
  if (record.flow_type !== flowType) throw new Error("This credential belongs to a different upload workflow.");
  if (record.status === "draft") return { kind: "draft", step: 1 };
  if (record.status === "pending_vc" && !record.tx_hash && record.cert_hash && record.doc_hash) {
    return { kind: "prepared_review", step: 1 };
  }
  return { kind: "detail" };
}
