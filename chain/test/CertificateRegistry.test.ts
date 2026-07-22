import { expect } from "chai";
import { network } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-ethers-chai-matchers/withArgs";
import {
  CERT_ID,
  CERT_ID_2,
  Status,
  deployFixture,
  dualApproveForFinalize,
  fullSetup,
} from "./helpers/fixtures.js";

const { ethers } = await network.create();

describe("CertificateRegistry", function () {
  describe("Deployment", function () {
    it("sets the deployer as owner", async function () {
      const { certRegistry, owner, issuerRegistry } = await deployFixture(ethers);
      expect(await certRegistry.owner()).to.equal(await owner.getAddress());
      expect(await certRegistry.issuerRegistry()).to.equal(await issuerRegistry.getAddress());
    });
  });

  describe("submitForApproval", function () {
    it("registrar can submit structured data for dual approval", async function () {
      const ctx = await deployFixture(ethers);
      const { certRegistry, owner, instAdmin, registrar, vc, chancellor, dataHash } = ctx;
      const registrarAddr = await registrar.getAddress();

      await fullSetup(
        ctx.issuerRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor
      );

      await expect(certRegistry.connect(registrar).submitForApproval(CERT_ID, dataHash))
        .to.emit(certRegistry, "CertificateSubmitted")
        .withArgs(CERT_ID, registrarAddr, "CUSL-001", dataHash, anyValue);

      const cert = await certRegistry.getCertificate(CERT_ID);
      expect(cert.status).to.equal(Status.PendingApproval);
      expect(cert.certHash).to.equal(dataHash);
      expect(cert.docHash).to.equal(ethers.ZeroHash);
      expect(cert.issuer).to.equal(registrarAddr);
      expect(cert.institutionId).to.equal("CUSL-001");
      expect(await certRegistry.certificateCount()).to.equal(1n);
    });

    it("active institution admin can submit without a registrar wallet", async function () {
      const ctx = await deployFixture(ethers);
      const { certRegistry, issuerRegistry, owner, instAdmin, dataHash } = ctx;
      const instAdminAddr = await instAdmin.getAddress();

      await issuerRegistry
        .connect(owner)
        .registerIssuer(instAdminAddr, "CUSL-001", "Central University SL");

      await certRegistry.connect(instAdmin).submitForApproval(CERT_ID, dataHash);
      const cert = await certRegistry.getCertificate(CERT_ID);
      expect(cert.issuer).to.equal(instAdminAddr);
      expect(cert.institutionId).to.equal("CUSL-001");
    });

    it("reverts when caller is not an authorized registrar or issuer", async function () {
      const ctx = await deployFixture(ethers);
      const { certRegistry, owner, instAdmin, registrar, vc, chancellor, stranger, dataHash } =
        ctx;

      await fullSetup(
        ctx.issuerRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor
      );

      await expect(
        certRegistry.connect(stranger).submitForApproval(CERT_ID, dataHash)
      ).to.be.revertedWith("CertificateRegistry: caller is not an active registrar/issuer");
    });

    it("reverts on empty certificateId", async function () {
      const ctx = await deployFixture(ethers);
      const { certRegistry, owner, instAdmin, registrar, vc, chancellor, dataHash } = ctx;

      await fullSetup(
        ctx.issuerRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor
      );

      await expect(
        certRegistry.connect(registrar).submitForApproval("", dataHash)
      ).to.be.revertedWith("CertificateRegistry: empty certificateId");
    });

    it("reverts on empty dataHash", async function () {
      const ctx = await deployFixture(ethers);
      const { certRegistry, owner, instAdmin, registrar, vc, chancellor } = ctx;

      await fullSetup(
        ctx.issuerRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor
      );

      await expect(
        certRegistry.connect(registrar).submitForApproval(CERT_ID, ethers.ZeroHash)
      ).to.be.revertedWith("CertificateRegistry: empty dataHash");
    });

    it("reverts when certificate already submitted", async function () {
      const ctx = await deployFixture(ethers);
      const { certRegistry, owner, instAdmin, registrar, vc, chancellor, dataHash } = ctx;

      await fullSetup(
        ctx.issuerRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor
      );

      await certRegistry.connect(registrar).submitForApproval(CERT_ID, dataHash);
      await expect(
        certRegistry.connect(registrar).submitForApproval(CERT_ID, dataHash)
      ).to.be.revertedWith("CertificateRegistry: certificate already submitted");
    });
  });

  describe("approveAsVC", function () {
    it("authorized VC can approve a pending certificate", async function () {
      const ctx = await deployFixture(ethers);
      const { certRegistry, owner, instAdmin, registrar, vc, chancellor, dataHash } = ctx;
      const vcAddr = await vc.getAddress();

      await fullSetup(
        ctx.issuerRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor
      );
      await certRegistry.connect(registrar).submitForApproval(CERT_ID, dataHash);

      await expect(certRegistry.connect(vc).approveAsVC(CERT_ID))
        .to.emit(certRegistry, "VCApproved")
        .withArgs(CERT_ID, vcAddr, anyValue);

      const cert = await certRegistry.getCertificate(CERT_ID);
      expect(cert.vcApprover).to.equal(vcAddr);
      expect(cert.vcApprovedAt).to.be.gt(0n);
    });

    it("reverts when caller is not an authorized VC", async function () {
      const ctx = await deployFixture(ethers);
      const { certRegistry, owner, instAdmin, registrar, vc, chancellor, stranger, dataHash } =
        ctx;

      await fullSetup(
        ctx.issuerRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor
      );
      await certRegistry.connect(registrar).submitForApproval(CERT_ID, dataHash);

      await expect(
        certRegistry.connect(stranger).approveAsVC(CERT_ID)
      ).to.be.revertedWith("CertificateRegistry: not an authorized VC");
    });

    it("reverts when VC already approved", async function () {
      const ctx = await deployFixture(ethers);
      const { certRegistry, owner, instAdmin, registrar, vc, chancellor, dataHash } = ctx;

      await fullSetup(
        ctx.issuerRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor
      );
      await certRegistry.connect(registrar).submitForApproval(CERT_ID, dataHash);
      await certRegistry.connect(vc).approveAsVC(CERT_ID);

      await expect(
        certRegistry.connect(vc).approveAsVC(CERT_ID)
      ).to.be.revertedWith("CertificateRegistry: VC already approved");
    });
  });

  describe("approveAsChancellor", function () {
    it("moves preview-flow certificates to PendingFinalize", async function () {
      const ctx = await deployFixture(ethers);
      const { certRegistry, owner, instAdmin, registrar, vc, chancellor, dataHash } = ctx;
      const chancellorAddr = await chancellor.getAddress();

      await fullSetup(
        ctx.issuerRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor
      );
      await certRegistry.connect(registrar).submitForApproval(CERT_ID, dataHash);
      await certRegistry.connect(vc).approveAsVC(CERT_ID);

      await expect(certRegistry.connect(chancellor).approveAsChancellor(CERT_ID))
        .to.emit(certRegistry, "ChancellorApproved")
        .withArgs(CERT_ID, chancellorAddr, anyValue);

      const cert = await certRegistry.getCertificate(CERT_ID);
      expect(cert.status).to.equal(Status.PendingFinalize);
      expect(cert.chancellorApprover).to.equal(chancellorAddr);
      expect(cert.chancellorApprovedAt).to.be.gt(0n);
      expect(cert.issuedAt).to.equal(0n);
    });

    it("reverts when VC approval is missing", async function () {
      const ctx = await deployFixture(ethers);
      const { certRegistry, owner, instAdmin, registrar, vc, chancellor, dataHash } = ctx;

      await fullSetup(
        ctx.issuerRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor
      );
      await certRegistry.connect(registrar).submitForApproval(CERT_ID, dataHash);

      await expect(
        certRegistry.connect(chancellor).approveAsChancellor(CERT_ID)
      ).to.be.revertedWith("CertificateRegistry: VC approval required first");
    });

    it("reverts when caller is not an authorized Chancellor", async function () {
      const ctx = await deployFixture(ethers);
      const { certRegistry, owner, instAdmin, registrar, vc, chancellor, stranger, dataHash } =
        ctx;

      await fullSetup(
        ctx.issuerRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor
      );
      await certRegistry.connect(registrar).submitForApproval(CERT_ID, dataHash);
      await certRegistry.connect(vc).approveAsVC(CERT_ID);

      await expect(
        certRegistry.connect(stranger).approveAsChancellor(CERT_ID)
      ).to.be.revertedWith("CertificateRegistry: not an authorized Chancellor");
    });
  });

  describe("finalizeCertificate", function () {
    it("registrar can attach the final PDF and issue after dual approval", async function () {
      const ctx = await deployFixture(ethers);
      const {
        certRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor,
        dataHash,
        docHash,
        ipfsJson,
        ipfsPdf,
      } = ctx;

      await fullSetup(
        ctx.issuerRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor
      );
      await dualApproveForFinalize(
        certRegistry,
        registrar,
        vc,
        chancellor,
        CERT_ID,
        dataHash
      );

      await expect(
        certRegistry
          .connect(registrar)
          .finalizeCertificate(CERT_ID, docHash, ipfsJson, ipfsPdf)
      )
        .to.emit(certRegistry, "CertificateFinalized")
        .withArgs(CERT_ID, docHash, ipfsPdf, anyValue)
        .and.to.emit(certRegistry, "CertificateIssued")
        .withArgs(CERT_ID, anyValue);

      const cert = await certRegistry.getCertificate(CERT_ID);
      expect(cert.status).to.equal(Status.Issued);
      expect(cert.docHash).to.equal(docHash);
      expect(cert.ipfsCidJson).to.equal(ipfsJson);
      expect(cert.ipfsCidPdf).to.equal(ipfsPdf);
      expect(cert.issuedAt).to.be.gt(0n);
    });

    it("reverts when certificate is not awaiting finalize", async function () {
      const ctx = await deployFixture(ethers);
      const {
        certRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor,
        dataHash,
        docHash,
        ipfsJson,
        ipfsPdf,
      } = ctx;

      await fullSetup(
        ctx.issuerRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor
      );
      await certRegistry.connect(registrar).submitForApproval(CERT_ID, dataHash);

      await expect(
        certRegistry
          .connect(registrar)
          .finalizeCertificate(CERT_ID, docHash, ipfsJson, ipfsPdf)
      ).to.be.revertedWith("CertificateRegistry: not awaiting finalize");
    });

    it("reverts when a different authorized registrar tries to finalize", async function () {
      const ctx = await deployFixture(ethers);
      const {
        certRegistry,
        issuerRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor,
        stranger,
        dataHash,
        docHash,
        ipfsJson,
        ipfsPdf,
      } = ctx;

      await fullSetup(
        issuerRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor
      );
      await issuerRegistry.connect(instAdmin).authorizeRegistrar(await stranger.getAddress());
      await dualApproveForFinalize(
        certRegistry,
        registrar,
        vc,
        chancellor,
        CERT_ID,
        dataHash
      );

      await expect(
        certRegistry
          .connect(stranger)
          .finalizeCertificate(CERT_ID, docHash, ipfsJson, ipfsPdf)
      ).to.be.revertedWith("CertificateRegistry: only issuer may finalize");
    });
  });

  describe("legacy submitCertificate / registerCertificate", function () {
    it("issues immediately after dual approval when full document data was submitted upfront", async function () {
      const ctx = await deployFixture(ethers);
      const {
        certRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor,
        dataHash,
        docHash,
        ipfsJson,
        ipfsPdf,
      } = ctx;

      await fullSetup(
        ctx.issuerRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor
      );

      await certRegistry
        .connect(registrar)
        .submitCertificate(CERT_ID, dataHash, docHash, ipfsJson, ipfsPdf);
      await certRegistry.connect(vc).approveAsVC(CERT_ID);

      await expect(certRegistry.connect(chancellor).approveAsChancellor(CERT_ID))
        .to.emit(certRegistry, "CertificateIssued")
        .withArgs(CERT_ID, anyValue);

      const cert = await certRegistry.getCertificate(CERT_ID);
      expect(cert.status).to.equal(Status.Issued);
      expect(cert.docHash).to.equal(docHash);
      expect(cert.ipfsCidPdf).to.equal(ipfsPdf);
    });

    it("registerCertificate behaves like submitCertificate", async function () {
      const ctx = await deployFixture(ethers);
      const {
        certRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor,
        dataHash,
        docHash,
        ipfsJson,
        ipfsPdf,
      } = ctx;

      await fullSetup(
        ctx.issuerRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor
      );

      await certRegistry
        .connect(registrar)
        .registerCertificate(CERT_ID_2, dataHash, docHash, ipfsJson, ipfsPdf);
      await certRegistry.connect(vc).approveAsVC(CERT_ID_2);
      await certRegistry.connect(chancellor).approveAsChancellor(CERT_ID_2);

      const cert = await certRegistry.getCertificate(CERT_ID_2);
      expect(cert.status).to.equal(Status.Issued);
    });
  });

  describe("revokeCertificate", function () {
    it("issuer can revoke an issued certificate", async function () {
      const ctx = await deployFixture(ethers);
      const {
        certRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor,
        dataHash,
        docHash,
        ipfsJson,
        ipfsPdf,
      } = ctx;
      const registrarAddr = await registrar.getAddress();

      await fullSetup(
        ctx.issuerRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor
      );
      await dualApproveForFinalize(
        certRegistry,
        registrar,
        vc,
        chancellor,
        CERT_ID,
        dataHash
      );
      await certRegistry
        .connect(registrar)
        .finalizeCertificate(CERT_ID, docHash, ipfsJson, ipfsPdf);

      await expect(
        certRegistry.connect(registrar).revokeCertificate(CERT_ID, "Issued in error")
      )
        .to.emit(certRegistry, "CertificateRevoked")
        .withArgs(CERT_ID, registrarAddr, "Issued in error", anyValue);

      const cert = await certRegistry.getCertificate(CERT_ID);
      expect(cert.status).to.equal(Status.Revoked);
      expect(cert.revocationReason).to.equal("Issued in error");
    });

    it("contract owner can revoke an issued certificate", async function () {
      const ctx = await deployFixture(ethers);
      const {
        certRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor,
        dataHash,
        docHash,
        ipfsJson,
        ipfsPdf,
      } = ctx;

      await fullSetup(
        ctx.issuerRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor
      );
      await dualApproveForFinalize(
        certRegistry,
        registrar,
        vc,
        chancellor,
        CERT_ID,
        dataHash
      );
      await certRegistry
        .connect(registrar)
        .finalizeCertificate(CERT_ID, docHash, ipfsJson, ipfsPdf);

      await certRegistry.connect(owner).revokeCertificate(CERT_ID, "Admin override");
      expect((await certRegistry.getCertificate(CERT_ID)).status).to.equal(Status.Revoked);
    });

    it("reverts when caller is not issuer or owner", async function () {
      const ctx = await deployFixture(ethers);
      const {
        certRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor,
        stranger,
        dataHash,
        docHash,
        ipfsJson,
        ipfsPdf,
      } = ctx;

      await fullSetup(
        ctx.issuerRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor
      );
      await dualApproveForFinalize(
        certRegistry,
        registrar,
        vc,
        chancellor,
        CERT_ID,
        dataHash
      );
      await certRegistry
        .connect(registrar)
        .finalizeCertificate(CERT_ID, docHash, ipfsJson, ipfsPdf);

      await expect(
        certRegistry.connect(stranger).revokeCertificate(CERT_ID, "Nope")
      ).to.be.revertedWith("CertificateRegistry: not authorised to revoke");
    });

    it("reverts when certificate is not issued", async function () {
      const ctx = await deployFixture(ethers);
      const { certRegistry, owner, instAdmin, registrar, vc, chancellor, dataHash } = ctx;

      await fullSetup(
        ctx.issuerRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor
      );
      await certRegistry.connect(registrar).submitForApproval(CERT_ID, dataHash);

      await expect(
        certRegistry.connect(registrar).revokeCertificate(CERT_ID, "Too early")
      ).to.be.revertedWith("CertificateRegistry: not issued");
    });
  });

  describe("verifyCertificate", function () {
    it("returns valid for an issued certificate with matching hash", async function () {
      const ctx = await deployFixture(ethers);
      const {
        certRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor,
        dataHash,
        docHash,
        ipfsJson,
        ipfsPdf,
      } = ctx;

      await fullSetup(
        ctx.issuerRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor
      );
      await dualApproveForFinalize(
        certRegistry,
        registrar,
        vc,
        chancellor,
        CERT_ID,
        dataHash
      );
      await certRegistry
        .connect(registrar)
        .finalizeCertificate(CERT_ID, docHash, ipfsJson, ipfsPdf);

      const [exists, isRevoked, hashMatch, isIssued] =
        await certRegistry.verifyCertificate(CERT_ID, dataHash);

      expect(exists).to.be.true;
      expect(isRevoked).to.be.false;
      expect(hashMatch).to.be.true;
      expect(isIssued).to.be.true;
    });

    it("reports hash mismatch for wrong expected hash", async function () {
      const ctx = await deployFixture(ethers);
      const {
        certRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor,
        dataHash,
        docHash,
        ipfsJson,
        ipfsPdf,
      } = ctx;

      await fullSetup(
        ctx.issuerRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor
      );
      await dualApproveForFinalize(
        certRegistry,
        registrar,
        vc,
        chancellor,
        CERT_ID,
        dataHash
      );
      await certRegistry
        .connect(registrar)
        .finalizeCertificate(CERT_ID, docHash, ipfsJson, ipfsPdf);

      const wrongHash = ethers.toBeHex(99, 32);
      const [, , hashMatch] = await certRegistry.verifyCertificate(CERT_ID, wrongHash);
      expect(hashMatch).to.be.false;
    });

    it("returns all false for unknown certificate", async function () {
      const { certRegistry, dataHash } = await deployFixture(ethers);
      const [exists, isRevoked, hashMatch, isIssued] =
        await certRegistry.verifyCertificate("UNKNOWN", dataHash);

      expect(exists).to.be.false;
      expect(isRevoked).to.be.false;
      expect(hashMatch).to.be.false;
      expect(isIssued).to.be.false;
    });
  });

  describe("enumeration", function () {
    it("tracks certificate ids and issuer lookups", async function () {
      const ctx = await deployFixture(ethers);
      const {
        certRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor,
        dataHash,
        docHash,
        ipfsJson,
        ipfsPdf,
      } = ctx;
      const registrarAddr = await registrar.getAddress();

      await fullSetup(
        ctx.issuerRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor
      );
      await dualApproveForFinalize(
        certRegistry,
        registrar,
        vc,
        chancellor,
        CERT_ID,
        dataHash
      );
      await certRegistry
        .connect(registrar)
        .finalizeCertificate(CERT_ID, docHash, ipfsJson, ipfsPdf);

      expect(await certRegistry.certificateCount()).to.equal(1n);
      expect(await certRegistry.certificateIdAt(0)).to.equal(CERT_ID);

      const byIssuer = await certRegistry.getCertificatesByIssuer(registrarAddr);
      expect(byIssuer).to.deep.equal([CERT_ID]);
    });
  });
});
