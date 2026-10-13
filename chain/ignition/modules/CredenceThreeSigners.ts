import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// A new module ID creates new deployments without deleting the original journal
// or replacing the contracts holding historical credentials.
export default buildModule("CredenceThreeSigners", (m) => {
  const issuerRegistry = m.contract("IssuerRegistry");
  const certificateRegistry = m.contract("CertificateRegistry", [issuerRegistry]);
  return { issuerRegistry, certificateRegistry };
});
