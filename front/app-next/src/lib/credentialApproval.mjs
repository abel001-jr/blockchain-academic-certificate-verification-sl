export async function recordCredentialApproval({ cert, role, transaction, api, approveOnChain, onTransaction }) {
  if (!["vc", "chancellor"].includes(role)) throw new Error("Only a Vice-Chancellor or Chancellor may approve this credential.");
  let approval = transaction;
  if (!approval) {
    const chain = await api.get(`/certificates/${cert.id}/chain-status/`);
    if (!chain.exists) {
      throw new Error("This credential is missing from its blockchain registry. The saved submission may belong to a Hardhat chain that was reset. Ask the Registrar to open this credential and use Submit to blockchain again, then repeat officer approval. The saved documents remain available; Pinata is not blocking this step.");
    }
    const latest = await api.get(`/certificates/${cert.id}/`);
    const expectedStatus = role === "vc" ? "pending_vc" : "pending_chancellor";
    if (latest.status !== expectedStatus || latest.doc_hash !== cert.doc_hash || latest.transcript_hash !== cert.transcript_hash || latest.cert_hash !== cert.cert_hash) {
      throw new Error("This credential has changed or is no longer awaiting your approval. Reopen its details before continuing.");
    }
    approval = await approveOnChain(cert.certificate_id, role);
    onTransaction(approval);
  }
  const path = role === "vc" ? "confirm-vc" : "confirm-chancellor";
  await api.post(`/certificates/${cert.id}/${path}/`, { tx_hash: approval.hash });
  return approval;
}
