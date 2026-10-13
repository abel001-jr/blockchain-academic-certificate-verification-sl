/**
 * Hardhat Ignition deploy module for INTELLIGENT ACADEMIC CREDENTIALING.
 *
 * Deploys two contracts in dependency order:
 *   1. IssuerRegistry  — no constructor args
 *   2. CertificateRegistry(issuerRegistryAddress)
 *
 * Usage:
 *   npm run deploy:local    → localhost (hardhat node)
 *   npm run deploy:sepolia  → Sepolia testnet
 *
 * After a local deploy the addresses are written to:
 *   ignition/deployments/chain-31337/deployed_addresses.json
 */

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const CredenceModule = buildModule("Credence", (m) => {
  // ── 1. IssuerRegistry ────────────────────────────────────────────────────
  // No constructor arguments — deployer becomes `owner`.
  const issuerRegistry = m.contract("IssuerRegistry");

  // ── 2. CertificateRegistry ───────────────────────────────────────────────
  // Requires the IssuerRegistry address at construction time.
  const certificateRegistry = m.contract("CertificateRegistry", [
    issuerRegistry,
  ]);

  return { issuerRegistry, certificateRegistry };
});

export default CredenceModule;
