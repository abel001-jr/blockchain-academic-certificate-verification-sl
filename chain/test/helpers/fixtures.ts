import type { ContractFactory, HardhatEthersHelpers, Signer } from "@nomicfoundation/hardhat-ethers/types";
import type { IssuerRegistry } from "../../types/ethers-contracts/IssuerRegistry.js";
import type { CertificateRegistry } from "../../types/ethers-contracts/CertificateRegistry.js";

export const CERT_ID = "CR-2026-CUSL-0001";
export const CERT_ID_2 = "CR-2026-CUSL-0002";

export const Status = {
  PendingApproval: 0n,
  PendingFinalize: 1n,
  Issued: 2n,
  Revoked: 3n,
} as const;

export type DeployedCredence = Awaited<ReturnType<typeof deployFixture>>;

export async function deployFixture(ethers: HardhatEthersHelpers) {
  const [owner, instAdmin, registrar, vc, chancellor, stranger] =
    await ethers.getSigners();

  const IssuerFactory: ContractFactory =
    await ethers.getContractFactory("IssuerRegistry");
  const issuerRegistry = (await IssuerFactory.deploy()) as IssuerRegistry;
  await issuerRegistry.waitForDeployment();

  const CertFactory: ContractFactory =
    await ethers.getContractFactory("CertificateRegistry");
  const certRegistry = (await CertFactory.deploy(
    await issuerRegistry.getAddress()
  )) as CertificateRegistry;
  await certRegistry.waitForDeployment();

  const dataHash = ethers.toBeHex(1, 32);
  const docHash = ethers.toBeHex(2, 32);

  return {
    issuerRegistry,
    certRegistry,
    owner,
    instAdmin,
    registrar,
    vc,
    chancellor,
    stranger,
    dataHash,
    docHash,
    ipfsJson: "QmTestJson",
    ipfsPdf: "QmTestPdf",
  };
}

/** Register institution and authorize registrar, VC, and chancellor. */
export async function fullSetup(
  issuerRegistry: IssuerRegistry,
  owner: Signer,
  instAdmin: Signer,
  registrar: Signer,
  vc: Signer,
  chancellor: Signer
) {
  const instAdminAddr = await instAdmin.getAddress();
  await issuerRegistry
    .connect(owner)
    .registerIssuer(instAdminAddr, "CUSL-001", "Central University SL");
  await issuerRegistry.connect(instAdmin).authorizeRegistrar(await registrar.getAddress());
  await issuerRegistry.connect(instAdmin).authorizeVC(await vc.getAddress());
  await issuerRegistry.connect(instAdmin).authorizeChancellor(await chancellor.getAddress());
  return instAdminAddr;
}

/** Preview flow through dual approval; stops at PendingFinalize. */
export async function dualApproveForFinalize(
  certRegistry: CertificateRegistry,
  registrar: Signer,
  vc: Signer,
  chancellor: Signer,
  certificateId: string,
  dataHash: string
) {
  await certRegistry.connect(registrar).submitForApproval(certificateId, dataHash);
  await certRegistry.connect(vc).approveAsVC(certificateId);
  await certRegistry.connect(chancellor).approveAsChancellor(certificateId);
}
