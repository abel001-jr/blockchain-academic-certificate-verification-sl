/**
 * CREDENCE wallet / chain actions
 *
 * Matrix (what needs MetaMask):
 *
 * | Action                                      | Kind            | MetaMask?        |
 * |---------------------------------------------|-----------------|------------------|
 * | Officer form / set password                 | Off-chain       | No               |
 * | Officer setup: connect + prove wallet       | Signature       | Yes (free sign)  |
 * | Session login (wallet roles)                | Signature       | Yes (free sign)  |
 * | Registrar authorize VC / Chancellor         | On-chain tx     | Yes (gas)        |
 * | Registrar revoke VC / Chancellor            | On-chain tx     | Yes (gas)        |
 * | Prepare cert (dataHash) / branding preview  | Off-chain       | No               |
 * | Submit for approval (dataHash)              | On-chain tx     | Yes (gas)        |
 * | VC / Chancellor review (preview)            | Off-chain       | No               |
 * | VC approve / Chancellor approve             | On-chain tx     | Yes (gas)        |
 * | Finalize PDF + IPFS                         | Off-chain       | No               |
 * | Finalize certificate on-chain               | On-chain tx     | Yes (gas)        |
 * | Employer verify                             | Public read     | Never            |
 * | Revoke issued certificate                   | On-chain tx     | Yes (gas)        |
 *
 * Officer authorize/revoke use authorizeVC / authorizeChancellor /
 * revokeVC / revokeChancellor (not authorizeRegistrar).
 */

const ISSUER_ABI = [
  {
    inputs: [{ name: "vcAddr", type: "address" }],
    name: "authorizeVC",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "vcAddr", type: "address" }],
    name: "revokeVC",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "chancellorAddr", type: "address" }],
    name: "authorizeChancellor",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "chancellorAddr", type: "address" }],
    name: "revokeChancellor",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

const CERT_ABI = [
  {
    inputs: [
      { name: "certificateId", type: "string" },
      { name: "dataHash", type: "bytes32" },
    ],
    name: "submitForApproval",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "certificateId", type: "string" },
      { name: "certHash", type: "bytes32" },
      { name: "docHash", type: "bytes32" },
      { name: "ipfsCidJson", type: "string" },
      { name: "ipfsCidPdf", type: "string" },
    ],
    name: "submitCertificate",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "certificateId", type: "string" },
      { name: "certHash", type: "bytes32" },
      { name: "docHash", type: "bytes32" },
      { name: "ipfsCidJson", type: "string" },
      { name: "ipfsCidPdf", type: "string" },
    ],
    name: "registerCertificate",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "certificateId", type: "string" }],
    name: "approveAsVC",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "certificateId", type: "string" }],
    name: "approveAsChancellor",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "certificateId", type: "string" },
      { name: "docHash", type: "bytes32" },
      { name: "ipfsCidJson", type: "string" },
      { name: "ipfsCidPdf", type: "string" },
    ],
    name: "finalizeCertificate",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "certificateId", type: "string" },
      { name: "reason", type: "string" },
    ],
    name: "revokeCertificate",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

function requireEthereum() {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("MetaMask is not installed.");
  }
  return window.ethereum;
}

/** Connect MetaMask and return lowercase address (no signature). */
export async function connectWallet() {
  const eth = requireEthereum();
  const accounts = await eth.request({ method: "eth_requestAccounts" });
  if (!accounts?.[0]) throw new Error("No MetaMask account selected.");
  return accounts[0].toLowerCase();
}

/**
 * Free identity proof — personal_sign (no gas).
 * Used for: officer setup, wallet login, apply-time ownership.
 */
export async function signMessage(message, address) {
  const eth = requireEthereum();
  const addr = (address || (await connectWallet())).toLowerCase();
  const signature = await eth.request({
    method: "personal_sign",
    params: [message, addr],
  });
  return { address: addr, signature };
}

async function getSignerContract(registryAddress, abi) {
  requireEthereum();
  if (!registryAddress) throw new Error("Registry contract address is not configured.");
  const { ethers } = await import("ethers");
  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  return {
    ethers,
    signer,
    contract: new ethers.Contract(registryAddress, abi, signer),
  };
}

async function waitTx(tx) {
  const receipt = await tx.wait(1);
  return { hash: tx.hash, receipt, blockNumber: receipt.blockNumber };
}

function issuerAddress() {
  return process.env.NEXT_PUBLIC_ISSUER_REGISTRY_ADDRESS;
}

function certAddress() {
  return process.env.NEXT_PUBLIC_CERTIFICATE_REGISTRY_ADDRESS;
}

/** On-chain: Registrar authorizes VC or Chancellor wallet (gas). */
export async function authorizeOfficerOnChain(officer) {
  const { contract } = await getSignerContract(issuerAddress(), ISSUER_ABI);
  if (!officer?.wallet_address) throw new Error("Officer has no verified wallet.");
  const tx =
    officer.role === "vc"
      ? await contract.authorizeVC(officer.wallet_address)
      : await contract.authorizeChancellor(officer.wallet_address);
  return waitTx(tx);
}

/** On-chain: Registrar revokes VC or Chancellor (gas). */
export async function revokeOfficerOnChain(officer) {
  const { contract } = await getSignerContract(issuerAddress(), ISSUER_ABI);
  if (!officer?.wallet_address) throw new Error("Officer has no wallet to revoke.");
  const tx =
    officer.role === "vc"
      ? await contract.revokeVC(officer.wallet_address)
      : await contract.revokeChancellor(officer.wallet_address);
  return waitTx(tx);
}

/**
 * On-chain: Registrar submits structured dataHash for dual approval (gas).
 * Prefer submitForApproval; falls back to legacy full submit if needed.
 */
export async function submitForApprovalOnChain(certData) {
  const { ethers, contract } = await getSignerContract(certAddress(), CERT_ABI);
  const dataHashBytes = ethers.hexlify(certData.cert_hash);
  try {
    const tx = await contract.submitForApproval(
      certData.certificate_id,
      dataHashBytes,
    );
    return waitTx(tx);
  } catch (err) {
    // Legacy deployments without submitForApproval
    if (!certData.doc_hash) throw err;
    const docHashBytes = ethers.hexlify(certData.doc_hash);
    const tx = await contract.submitCertificate(
      certData.certificate_id,
      dataHashBytes,
      docHashBytes,
      certData.ipfs_cid_json || "",
      certData.ipfs_cid_pdf || "",
    );
    return waitTx(tx);
  }
}

/** @deprecated Prefer submitForApprovalOnChain for the branding flow. */
export async function submitCertificateOnChain(certData) {
  return submitForApprovalOnChain(certData);
}

/** On-chain: Registrar finalizes after dual approval + PDF/IPFS (gas). */
export async function finalizeCertificateOnChain(certData) {
  const { ethers, contract } = await getSignerContract(certAddress(), CERT_ABI);
  const docHashBytes = ethers.hexlify(certData.doc_hash);
  const tx = await contract.finalizeCertificate(
    certData.certificate_id,
    docHashBytes,
    certData.ipfs_cid_json,
    certData.ipfs_cid_pdf,
  );
  return waitTx(tx);
}

/** On-chain: VC or Chancellor approval (gas). Reviewing stays off-chain. */
export async function approveCertificateOnChain(certificateId, asRole) {
  const { contract } = await getSignerContract(certAddress(), CERT_ABI);
  const tx =
    asRole === "vc"
      ? await contract.approveAsVC(certificateId)
      : await contract.approveAsChancellor(certificateId);
  return waitTx(tx);
}

/** On-chain: revoke an Issued certificate (gas). */
export async function revokeCertificateOnChain(certificateId, reason) {
  const { contract } = await getSignerContract(certAddress(), CERT_ABI);
  const tx = await contract.revokeCertificate(certificateId, reason || "");
  return waitTx(tx);
}

export { ISSUER_ABI, CERT_ABI };
