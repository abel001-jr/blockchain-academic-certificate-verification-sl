/**
 * INTELLIGENT ACADEMIC CREDENTIALING wallet / chain actions
 *
 * Matrix (what needs MetaMask):
 *
 * | Action                                      | Kind            | MetaMask?        |
 * |---------------------------------------------|-----------------|------------------|
 * | Officer form / set password                 | Off-chain       | No               |
 * | Officer setup: connect + prove wallet       | Signature       | Yes (free sign)  |
 * | Session login (wallet roles)                | Signature       | Yes (free sign)  |
 * | Registrar authorize VC / Chancellor               | On-chain tx     | Yes (gas)        |
 * | Registrar revoke VC / Chancellor                  | On-chain tx     | Yes (gas)        |
 * | Prepare cert (dataHash) / branding preview  | Off-chain       | No               |
 * | Submit for approval (dataHash)              | On-chain tx     | Yes (gas)        |
 * | Submit uploaded doc (+ transcript) hashes   | On-chain tx     | Yes (gas)        |
 * | VC / Chancellor review (preview)                  | Off-chain       | No               |
 * | VC approve / Chancellor approve                   | On-chain tx     | Yes (gas)        |
 * | Finalize PDF + IPFS                         | Off-chain       | No               |
 * | Finalize certificate on-chain               | On-chain tx     | Yes (gas)        |
 * | Employer verify                             | Public read     | Never            |
 * | Revoke issued certificate                   | On-chain tx     | Yes (gas)        |
 *
 * Officer authorize/revoke use authorizeVC / authorizeChancellor /
 * revokeVC / revokeChancellor (not authorizeRegistrar).
 *
 * Document locations are never sent to the chain. finalizeCertificate anchors
 * the PDF hash only, and submitCredentialForApproval / finalizeCredential carry
 * the certificate and transcript hashes without any CID, so the encrypted
 * blobs stay retrievable only through an unexpired graduate share.
 *
 * Every path commits its document hashes before officer review, because an
 * approval of a record whose docHash is still zero is an approval of no
 * document:
 *   - uploaded certificate + transcript → submitCredentialForApproval
 *   - uploaded certificate only          → submitDocumentForApproval
 *   - submitForApproval (data hash only) → the legacy preview flow, whose
 *     document is produced afterwards and committed at finalize
 *
 * The system-designed flow uses submitForSealedReview / finalizeWithSealedDocument
 * instead. Its document is generated, so a review rendering is committed before
 * approval and the issued rendering — which adds the signature block — is
 * committed after. Only hashes cross the chain in either case.
 *
 * A system-designed credential that carries a transcript is still two documents,
 * so it is sealed rather than submitted plainly, but it goes through
 * submitCredentialForSealedReview so the transcript hash is committed in the
 * same transaction. submitForSealedReview writes bytes32(0) to transcriptDocHash,
 * which on-chain is indistinguishable from having no transcript.
 *
 * Prefer submitUploadedCredentialForApprovalOnChain / finalizeUploadedCredentialOnChain
 * in the upload flows: they pick the right function from the hashes on record.
 */

const ISSUER_ABI = [
  {
    inputs: [{ name: "registrarAddr", type: "address" }],
    name: "isAuthorizedRegistrar",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "institutionAdmin", type: "address" }],
    name: "isActiveIssuer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
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
      { name: "certificateDocHash", type: "bytes32" },
      { name: "transcriptDocHash", type: "bytes32" },
    ],
    name: "submitCredentialForApproval",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "certificateId", type: "string" }],
    name: "finalizeCredential",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "certificateId", type: "string" },
      { name: "dataHash", type: "bytes32" },
      { name: "reviewDocHash", type: "bytes32" },
    ],
    name: "submitForSealedReview",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    // Sealed review for a credential that is two documents: the rendered review
    // copy and the transcript committed with it in one transaction.
    inputs: [
      { name: "certificateId", type: "string" },
      { name: "dataHash", type: "bytes32" },
      { name: "reviewDocHash", type: "bytes32" },
      { name: "transcriptDocHash", type: "bytes32" },
    ],
    name: "submitCredentialForSealedReview",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "certificateId", type: "string" },
      { name: "sealedDocHash", type: "bytes32" },
    ],
    name: "finalizeWithSealedDocument",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
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
      { name: "dataHash", type: "bytes32" },
      { name: "docHash", type: "bytes32" },
    ],
    name: "submitDocumentForApproval",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },

  {
    inputs: [
      { name: "certificateId", type: "string" },
      { name: "certHash", type: "bytes32" },
      { name: "docHash", type: "bytes32" },
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

import { api } from "./api";

const walletProviders = new WeakMap();

export function isWalletCancellation(error) {
  return [error, error?.cause, error?.error, error?.info?.error, error?.data?.originalError].some(item => item?.code === 4001 || item?.code === "4001" || item?.code === "ACTION_REJECTED");
}

export function requireEthereum() {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("MetaMask is not installed.");
  }

  // Chrome extensions can each inject an EIP-1193 provider. Prefer MetaMask
  // rather than whichever extension last assigned window.ethereum; this avoids
  // non-wallet extensions intercepting a transaction request.
  const providers = Array.isArray(window.ethereum.providers)
    ? window.ethereum.providers
    : [window.ethereum];
  const metaMask = providers.find(provider => provider?.isMetaMask);
  if (!metaMask) throw new Error("MetaMask provider not detected. Enable the MetaMask extension and reload.");
  if (!walletProviders.has(metaMask)) {
    const request = async (...args) => {
      try { return await metaMask.request(...args); }
      catch (error) {
        if (isWalletCancellation(error)) window.dispatchEvent(new CustomEvent("credence:wallet-cancelled"));
        throw error;
      }
    };
    walletProviders.set(metaMask, new Proxy(metaMask, { get(target, key) {
      if (key === "request") return request;
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    } }));
  }
  return walletProviders.get(metaMask);
}

/** 
 * Connect MetaMask and return the CURRENTLY SELECTED account address.
 * Uses eth_requestAccounts which always returns the active account first.
 * If the wrong account is shown, the user should switch in MetaMask first
 * then retry — or call wallet_requestPermissions to force the account picker.
 */
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

async function getSignerContract(registryAddress, abi, registrarOnly = false, certificateId = null) {
  const ethereum = requireEthereum();
  const config = await api.get(certificateId ? `/certificate-chain-config/?certificate_id=${encodeURIComponent(certificateId)}` : "/chain-config/");
  registryAddress = abi === CERT_ABI ? config.certificate_registry_address : config.issuer_registry_address;
  if (!registryAddress) throw new Error("Registry contract address is not configured.");
  const { ethers } = await import("ethers");

  // Request the account directly from MetaMask so issuance and approvals always
  // use the wallet's current authenticated account, even with other extensions installed.
  let accounts = await ethereum.request({ method: "eth_requestAccounts" });
  if (!accounts?.[0]) throw new Error("No MetaMask account selected.");
  if (registrarOnly) {
    const user = await api.get("/auth/me/");
    const expected = user.wallet_address;
    if (!expected) throw new Error("Your Registrar account has no bound wallet. Contact the system admin to configure it.");
    if (accounts[0].toLowerCase() !== expected.toLowerCase()) {
      await ethereum.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] });
      accounts = await ethereum.request({ method: "eth_accounts" });
      if (accounts?.[0]?.toLowerCase() !== expected.toLowerCase()) {
        throw new Error(`Select your Registrar wallet ${expected} in MetaMask. The connected wallet ${accounts?.[0] || "(none)"} does not match your profile.`);
      }
    }
  }

  const provider = new ethers.BrowserProvider(ethereum);
  const network = await provider.getNetwork();
  if (config.chain_id && network.chainId !== BigInt(config.chain_id)) throw new Error(`Switch your wallet to chain ${config.chain_id} before signing.`);
  const signer = await provider.getSigner(accounts[0]);
  if (registrarOnly) {
    const registry = new ethers.Contract(config.issuer_registry_address, ISSUER_ABI, provider);
    const address = await signer.getAddress();
    const [authorized, admin] = await Promise.all([registry.isAuthorizedRegistrar(address), registry.isActiveIssuer(address)]);
    if (admin) throw new Error(`Wallet ${address} is registered as an institution admin. Contact the system admin to bind a separate Registrar wallet.`);
    if (!authorized) throw new Error(`Registrar wallet ${address} is not authorized on chain ${config.chain_id}. The institution admin must authorize this wallet in Officers before you can sign.`);
  }

  // Guard: verify the contract exists at the given address before sending gas.
  // After a Hardhat node restart the chain is empty — contracts need redeploying.
  const code = await provider.getCode(registryAddress);
  if (!code || code === "0x") {
    throw new Error(
      `No contract found at ${registryAddress}.\n\n` +
      `The Hardhat node was likely restarted without redeploying.\n\n` +
      `Fix:\n` +
      `  1. Keep the Hardhat node running (npm run node)\n` +
      `  2. In the chain/ directory run:  bash scripts/redeploy-local.sh\n` +
      `     (or: npm run deploy:local  after deleting ignition/deployments/chain-31337/)\n` +
      `  3. Refresh this page — the contract addresses stay the same.`
    );
  }

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

/** On-chain: Registrar authorizes VC or Chancellor wallet (gas).
 *
 * @param officer              Officer user object with wallet_address and role.
 * @param expectedSignerAddress Optional — if provided, verifies MetaMask is on
 *                             this account (the institution admin wallet) before
 *                             sending the tx. Pass institution.wallet_address.
 */
export async function authorizeOfficerOnChain(officer, expectedSignerAddress) {
  const { signer, contract } = await getSignerContract(issuerAddress(), ISSUER_ABI);
  if (!officer?.wallet_address) throw new Error("Officer has no verified wallet.");

  // Verify the connected account is the institution admin wallet
  if (expectedSignerAddress) {
    const connected = (await signer.getAddress()).toLowerCase();
    const expected  = expectedSignerAddress.toLowerCase();
    if (connected !== expected) {
      throw new Error(
        `Wrong MetaMask account.\n\n` +
        `IssuerRegistry.authorizeVC/authorizeChancellor can only be called ` +
        `by the institution admin wallet.\n\n` +
        `Expected: ${expected}\n` +
        `Connected: ${connected}\n\n` +
        `Switch to the correct account in MetaMask and try again.`
      );
    }
  }

  const tx =
    officer.role === "registrar"
      ? await contract.authorizeRegistrar(officer.wallet_address)
      : officer.role === "vc"
      ? await contract.authorizeVC(officer.wallet_address)
      : await contract.authorizeChancellor(officer.wallet_address);
  return waitTx(tx);
}

/** On-chain: Registrar revokes VC or Chancellor (gas).
 *
 * @param officer              Officer user object.
 * @param expectedSignerAddress Optional — institution admin wallet address check.
 */
export async function revokeOfficerOnChain(officer, expectedSignerAddress) {
  const { signer, contract } = await getSignerContract(issuerAddress(), ISSUER_ABI);
  if (!officer?.wallet_address) throw new Error("Officer has no wallet to revoke.");

  if (expectedSignerAddress) {
    const connected = (await signer.getAddress()).toLowerCase();
    const expected  = expectedSignerAddress.toLowerCase();
    if (connected !== expected) {
      throw new Error(
        `Wrong MetaMask account.\n\n` +
        `Expected institution admin wallet: ${expected}\n` +
        `Connected: ${connected}\n\n` +
        `Switch to the correct account in MetaMask and try again.`
      );
    }
  }

  const tx =
    officer.role === "registrar"
      ? await contract.revokeRegistrar(officer.wallet_address)
      : officer.role === "vc"
      ? await contract.revokeVC(officer.wallet_address)
      : await contract.revokeChancellor(officer.wallet_address);
  return waitTx(tx);
}

/**
 * On-chain: Registrar submits structured dataHash for dual approval (gas).
 * Submit the certificate data hash before VC and Chancellor approvals.
 */
export async function submitForApprovalOnChain(certData) {
  const { ethers, contract } = await getSignerContract(certAddress(), CERT_ABI, true, certData.certificate_id);
  const dataHashBytes = ethers.hexlify(certData.cert_hash);
  const tx = await contract.submitForApproval(
    certData.certificate_id,
    dataHashBytes,
  );
  return waitTx(tx);
}

/** Submit the fixed certificate/transcript hash pair for officer review. */
export async function submitCredentialForApprovalOnChain(credentialData) {
  const { ethers, contract } = await getSignerContract(certAddress(), CERT_ABI, true, credentialData.certificate_id);
  const tx = await contract.submitCredentialForApproval(
    credentialData.certificate_id,
    ethers.hexlify(credentialData.cert_hash),
    ethers.hexlify(credentialData.doc_hash),
    ethers.hexlify(credentialData.transcript_hash),
  );
  return waitTx(tx);
}

/**
 * Commit a single uploaded document before officer review (gas).
 *
 * An uploaded document is already final, so its hash is fixed here and the
 * officers approve exactly these bytes. finalizeRequired on the contract keeps
 * this path off the legacy auto-issue branch, so the registrar still runs the
 * final anchoring transaction.
 */
export async function submitDocumentForApprovalOnChain(certData) {
  const { ethers, contract } = await getSignerContract(certAddress(), CERT_ABI, true, certData.certificate_id);
  const tx = await contract.submitDocumentForApproval(
    certData.certificate_id,
    ethers.hexlify(certData.cert_hash),
    ethers.hexlify(certData.doc_hash),
  );
  return waitTx(tx);
}

/**
 * Submit an uploaded credential for review, committing every document hash the
 * credential already has.
 *
 * The upload flows used to call submitForApproval, which puts only the data hash
 * on-chain. The officers then approved a record whose document hash was still
 * zero, so their approval referred to no document at all, and the hash only
 * appeared on-chain at finalize — after both signatures. Both branches here fix
 * the hashes up front:
 *   - certificate + transcript → submitCredentialForApproval (the paired path)
 *   - certificate only          → submitDocumentForApproval
 *
 * @param credentialData certificate_id, cert_hash, doc_hash and optionally
 *                         transcript_hash.
 */
export async function submitUploadedCredentialForApprovalOnChain(credentialData) {
  if (!credentialData?.doc_hash) {
    throw new Error(
      "No document hash to commit. Upload and hash the certificate before submitting it for review."
    );
  }
  return credentialData.transcript_hash
    ? submitCredentialForApprovalOnChain(credentialData)
    : submitDocumentForApprovalOnChain(credentialData);
}


/** @deprecated Unused alias kept for callers outside this repo. Do not use it for
 *  an upload flow: it commits the data hash alone, which is the defect the
 *  submitDocumentForApproval / submitCredentialForApproval paths exist to fix.
 *  For a generated certificate use submitForSealedReviewOnChain. */
export async function submitCertificateOnChain(certData) {
  return submitForApprovalOnChain(certData);
}

/**
 * On-chain: Registrar finalizes after dual approval (gas).
 * Only the document hash is anchored. Document locations stay off-chain in
 * the backend so a graduate's sharing window can actually revoke access.
 */
export async function finalizeCertificateOnChain(certData) {
  const { ethers, contract } = await getSignerContract(certAddress(), CERT_ABI, true, certData.certificate_id);
  const docHashBytes = ethers.hexlify(certData.doc_hash);
  const tx = await contract.finalizeCertificate(
    certData.certificate_id,
    docHashBytes,
  );
  return waitTx(tx);
}

/** Complete issuance after both approvals; document hashes stay unchanged. */
export async function finalizeCredentialOnChain(certificateId) {
  const { contract } = await getSignerContract(certAddress(), CERT_ABI, true, certificateId);
  const tx = await contract.finalizeCredential(certificateId);
  return waitTx(tx);
}

/**
 * Issue an uploaded credential after both officers approved it.
 *
 * Paired credentials anchor through finalizeCredential, which takes no hash
 * because both were committed at submit. Single-document credentials go through
 * finalizeCertificate, which re-sends the hash it committed; the contract now
 * rejects any other value, so a mismatch cannot be issued by accident.
 */
export async function finalizeUploadedCredentialOnChain(credentialData) {
  if (credentialData?.transcript_hash) {
    return finalizeCredentialOnChain(credentialData.certificate_id);
  }
  if (!credentialData?.doc_hash) {
    throw new Error("No document hash on record to anchor.");
  }
  return finalizeCertificateOnChain(credentialData);
}

/**
 * Commit the review document so officers approve fixed bytes.
 * Used by the system-designed flow, whose issued document cannot exist until
 * the approvals are in. The review rendering carries no signature block, so
 * hashing it here is stable.
 */
/**
 * Anchor a generated credential for dual approval.
 *
 * Picks the paired overload when the record carries a transcript, so the
 * transcript hash is committed in the same transaction as the review copy. The
 * three-argument path cannot carry it, and committing only the review copy would
 * leave the chain record claiming no transcript exists while one is sitting in
 * Django — the officers would be approving a half of the student record.
 */
export async function submitForSealedReviewOnChain(certData) {
  const { ethers, contract } = await getSignerContract(certAddress(), CERT_ABI, true, certData.certificate_id);
  const transcriptHash = certData.transcript_hash;
  const tx = transcriptHash
    ? await contract.submitCredentialForSealedReview(
        certData.certificate_id,
        ethers.hexlify(certData.cert_hash),
        ethers.hexlify(certData.doc_hash),
        ethers.hexlify(transcriptHash),
      )
    : await contract.submitForSealedReview(
        certData.certificate_id,
        ethers.hexlify(certData.cert_hash),
        ethers.hexlify(certData.doc_hash),
      );
  return waitTx(tx);
}

/**
 * Anchor the issued document's hash and issue, after both approvals.
 * The reviewed hash is left untouched on-chain, so the two documents stay
 * distinguishable and the relationship between them remains auditable.
 */
export async function finalizeWithSealedDocumentOnChain(certData) {
  const { ethers, contract } = await getSignerContract(certAddress(), CERT_ABI, true, certData.certificate_id);
  const tx = await contract.finalizeWithSealedDocument(
    certData.certificate_id,
    ethers.hexlify(certData.sealed_doc_hash),
  );
  return waitTx(tx);
}


/** On-chain: VC or Chancellor approval (gas). Reviewing stays off-chain. */
export async function approveCertificateOnChain(certificateId, asRole) {
  if (!["vc", "chancellor"].includes(asRole)) throw new Error("Only Vice-Chancellor or Chancellor may approve this step.");
  const { contract } = await getSignerContract(certAddress(), CERT_ABI, false, certificateId);
  const tx =
    asRole === "vc"
      ? await contract.approveAsVC(certificateId)
      : await contract.approveAsChancellor(certificateId);
  return waitTx(tx);
}

/** On-chain: revoke an Issued certificate (gas). */
export async function revokeCertificateOnChain(certificateId, reason) {
  const { contract } = await getSignerContract(certAddress(), CERT_ABI, false, certificateId);
  const tx = await contract.revokeCertificate(certificateId, reason || "");
  return waitTx(tx);
}

export { ISSUER_ABI, CERT_ABI };
