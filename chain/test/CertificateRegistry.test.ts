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
          .finalizeCertificate(CERT_ID, docHash)
      )
        .to.emit(certRegistry, "CertificateFinalized")
        .withArgs(CERT_ID, docHash, anyValue)
        .and.to.emit(certRegistry, "CertificateIssued")
        .withArgs(CERT_ID, anyValue);

      const cert = await certRegistry.getCertificate(CERT_ID);
      expect(cert.status).to.equal(Status.Issued);
      expect(cert.docHash).to.equal(docHash);
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
          .finalizeCertificate(CERT_ID, docHash)
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
          .finalizeCertificate(CERT_ID, docHash)
      ).to.be.revertedWith("CertificateRegistry: only issuer may finalize");
    });
  });

  describe("paired credential path", function () {
    it("records both document hashes without publishing a document location", async function () {
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
        transcriptHash,
      } = ctx;

      await fullSetup(
        ctx.issuerRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor
      );

      await expect(
        certRegistry
          .connect(registrar)
          .submitCredentialForApproval(CERT_ID, dataHash, docHash, transcriptHash)
      )
        .to.emit(certRegistry, "CredentialSubmitted")
        .withArgs(
          CERT_ID,
          await registrar.getAddress(),
          dataHash,
          docHash,
          transcriptHash,
          anyValue
        );

      const cert = await certRegistry.getCertificate(CERT_ID);
      expect(cert.status).to.equal(Status.PendingApproval);
      expect(cert.docHash).to.equal(docHash);
      expect(cert.transcriptDocHash).to.equal(transcriptHash);
    });

    it("rejects a submission that is missing the transcript hash", async function () {
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
      } = ctx;

      await fullSetup(
        ctx.issuerRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor
      );

      await expect(
        certRegistry
          .connect(registrar)
          .submitCredentialForApproval(CERT_ID, dataHash, docHash, ethers.ZeroHash)
      ).to.be.revertedWith("CertificateRegistry: empty transcript hash");
    });

    // Regression guard: the paired path must NOT auto-issue on Chancellor
    // approval, even though both hashes are already present. The registrar's
    // final anchoring transaction is part of the design.
    it("waits for the registrar's final transaction after Chancellor approval", async function () {
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
        transcriptHash,
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
        .submitCredentialForApproval(CERT_ID, dataHash, docHash, transcriptHash);
      await certRegistry.connect(vc).approveAsVC(CERT_ID);
      await certRegistry.connect(chancellor).approveAsChancellor(CERT_ID);

      const cert = await certRegistry.getCertificate(CERT_ID);
      expect(cert.status).to.equal(Status.PendingFinalize);
      expect(cert.issuedAt).to.equal(0n);
    });

    it("issues with both hashes unchanged once the registrar finalizes", async function () {
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
        transcriptHash,
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
        .submitCredentialForApproval(CERT_ID, dataHash, docHash, transcriptHash);
      await certRegistry.connect(vc).approveAsVC(CERT_ID);
      await certRegistry.connect(chancellor).approveAsChancellor(CERT_ID);

      await expect(
        certRegistry.connect(registrar).finalizeCredential(CERT_ID)
      )
        .to.emit(certRegistry, "CredentialAnchored")
        .withArgs(CERT_ID, docHash, transcriptHash, anyValue)
        .and.to.emit(certRegistry, "CertificateIssued")
        .withArgs(CERT_ID, anyValue);

      const cert = await certRegistry.getCertificate(CERT_ID);
      expect(cert.status).to.equal(Status.Issued);
      expect(cert.docHash).to.equal(docHash);
      expect(cert.transcriptDocHash).to.equal(transcriptHash);
      expect(cert.issuedAt).to.be.gt(0n);
    });

    it("rejects finalizeCredential when only one document hash is present", async function () {
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
      } = ctx;

      await fullSetup(
        ctx.issuerRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor
      );
      // Preview path: no document hashes are committed up front.
      await dualApproveForFinalize(
        certRegistry,
        registrar,
        vc,
        chancellor,
        CERT_ID,
        dataHash
      );

      await expect(
        certRegistry.connect(registrar).finalizeCredential(CERT_ID)
      ).to.be.revertedWith("CertificateRegistry: document pair missing");
      expect(docHash).to.not.equal(ethers.ZeroHash);
    });
  });

  describe("review-then-seal path", function () {
    /** Submit for sealed review and carry the credential through dual approval. */
    async function approveForSeal(ctx: Awaited<ReturnType<typeof deployFixture>>) {
      const {
        certRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor,
        dataHash,
        docHash,
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
        .submitForSealedReview(CERT_ID, dataHash, docHash);
      await certRegistry.connect(vc).approveAsVC(CERT_ID);
      await certRegistry.connect(chancellor).approveAsChancellor(CERT_ID);
    }

    it("commits the review document hash and marks the credential as needing a seal", async function () {
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
        .submitForSealedReview(CERT_ID, dataHash, docHash);

      const cert = await certRegistry.getCertificate(CERT_ID);
      expect(cert.certHash).to.equal(dataHash);
      expect(cert.docHash).to.equal(docHash);
      expect(cert.transcriptDocHash).to.equal(ethers.ZeroHash);
      expect(cert.sealedDocHash).to.equal(ethers.ZeroHash);
      expect(cert.sealRequired).to.equal(true);
      expect(cert.status).to.equal(Status.PendingApproval);
    });

    it("rejects a submission with an empty review document hash", async function () {
      const ctx = await deployFixture(ethers);
      const { certRegistry, owner, instAdmin, registrar, vc, chancellor, dataHash } = ctx;
      await fullSetup(ctx.issuerRegistry, owner, instAdmin, registrar, vc, chancellor);

      await expect(
        certRegistry.connect(registrar).submitForSealedReview(CERT_ID, dataHash, ethers.ZeroHash)
      ).to.be.revertedWith("CertificateRegistry: empty review document hash");
    });

    it("does not auto-issue on Chancellor approval, unlike the legacy path", async function () {
      const ctx = await deployFixture(ethers);
      await approveForSeal(ctx);

      const cert = await ctx.certRegistry.getCertificate(CERT_ID);
      expect(cert.status).to.equal(Status.PendingFinalize);
      expect(cert.issuedAt).to.equal(0n);
    });

    it("records the sealed hash and issues without mutating the reviewed hash", async function () {
      const ctx = await deployFixture(ethers);
      const { certRegistry, registrar, docHash, sealedHash } = ctx;
      await approveForSeal(ctx);

      await expect(
        certRegistry.connect(registrar).finalizeWithSealedDocument(CERT_ID, sealedHash)
      )
        .to.emit(certRegistry, "CredentialSealed")
        .withArgs(CERT_ID, docHash, sealedHash, anyValue)
        .and.to.emit(certRegistry, "CertificateIssued")
        .withArgs(CERT_ID, anyValue);

      const cert = await certRegistry.getCertificate(CERT_ID);
      expect(cert.status).to.equal(Status.Issued);
      expect(cert.sealedDocHash).to.equal(sealedHash);
      // The hash the officers approved must survive sealing untouched.
      expect(cert.docHash).to.equal(docHash);
    });

    it("reports the sealed hash as authoritative once issued", async function () {
      const ctx = await deployFixture(ethers);
      const { certRegistry, registrar, docHash, sealedHash } = ctx;
      await approveForSeal(ctx);

      const before = await certRegistry.getAuthoritativeDocHash(CERT_ID);
      expect(before.docHash).to.equal(docHash);
      expect(before.sealedDocHash).to.equal(ethers.ZeroHash);
      expect(before.isSealed).to.equal(false);

      await certRegistry.connect(registrar).finalizeWithSealedDocument(CERT_ID, sealedHash);

      const after = await certRegistry.getAuthoritativeDocHash(CERT_ID);
      expect(after.sealedDocHash).to.equal(sealedHash);
      expect(after.isSealed).to.equal(true);
    });

    it("rejects a sealed hash identical to the reviewed document", async function () {
      const ctx = await deployFixture(ethers);
      const { certRegistry, registrar, docHash } = ctx;
      await approveForSeal(ctx);

      await expect(
        certRegistry.connect(registrar).finalizeWithSealedDocument(CERT_ID, docHash)
      ).to.be.revertedWith(
        "CertificateRegistry: sealed document must differ from review document"
      );
    });

    it("rejects an empty sealed hash", async function () {
      const ctx = await deployFixture(ethers);
      const { certRegistry, registrar } = ctx;
      await approveForSeal(ctx);

      await expect(
        certRegistry.connect(registrar).finalizeWithSealedDocument(CERT_ID, ethers.ZeroHash)
      ).to.be.revertedWith("CertificateRegistry: empty sealed document hash");
    });

    it("rejects sealing twice", async function () {
      const ctx = await deployFixture(ethers);
      const { certRegistry, registrar, sealedHash } = ctx;
      await approveForSeal(ctx);
      await certRegistry.connect(registrar).finalizeWithSealedDocument(CERT_ID, sealedHash);

      await expect(
        certRegistry.connect(registrar).finalizeWithSealedDocument(CERT_ID, sealedHash)
      ).to.be.revertedWith("CertificateRegistry: not awaiting finalize");
    });

    it("rejects sealing before dual approval", async function () {
      const ctx = await deployFixture(ethers);
      const {
        certRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        dataHash,
        docHash,
        sealedHash,
      } = ctx;
      await fullSetup(ctx.issuerRegistry, owner, instAdmin, registrar, vc, ctx.chancellor);
      await certRegistry.connect(registrar).submitForSealedReview(CERT_ID, dataHash, docHash);

      await expect(
        certRegistry.connect(registrar).finalizeWithSealedDocument(CERT_ID, sealedHash)
      ).to.be.revertedWith("CertificateRegistry: not awaiting finalize");
    });

    it("rejects sealing by an authorized registrar who is not the issuer", async function () {
      const ctx = await deployFixture(ethers);
      const { certRegistry, instAdmin, registrar, stranger, sealedHash } = ctx;
      await approveForSeal(ctx);
      await ctx.issuerRegistry
        .connect(instAdmin)
        .authorizeRegistrar(await stranger.getAddress());

      await expect(
        certRegistry.connect(stranger).finalizeWithSealedDocument(CERT_ID, sealedHash)
      ).to.be.revertedWith("CertificateRegistry: only issuer may seal");
    });

    it("cannot be finalized through finalizeCertificate, so sealing cannot be skipped", async function () {
      const ctx = await deployFixture(ethers);
      const { certRegistry, registrar, sealedHash } = ctx;
      await approveForSeal(ctx);

      await expect(
        certRegistry.connect(registrar).finalizeCertificate(CERT_ID, sealedHash)
      ).to.be.revertedWith(
        "CertificateRegistry: sealed path must use finalizeWithSealedDocument"
      );
    });

    it("cannot be finalized through finalizeCredential, so sealing cannot be skipped", async function () {
      const ctx = await deployFixture(ethers);
      const { certRegistry, registrar } = ctx;
      await approveForSeal(ctx);

      await expect(
        certRegistry.connect(registrar).finalizeCredential(CERT_ID)
      ).to.be.revertedWith(
        "CertificateRegistry: sealed path must use finalizeWithSealedDocument"
      );
    });

    it("rejects sealing a credential that was not submitted for sealed review", async function () {
      const ctx = await deployFixture(ethers);
      const {
        certRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor,
        sealedHash,
      } = ctx;
      await fullSetup(ctx.issuerRegistry, owner, instAdmin, registrar, vc, chancellor);
      await dualApproveForFinalize(
        certRegistry,
        registrar,
        vc,
        chancellor,
        CERT_ID,
        ctx.dataHash
      );

      await expect(
        certRegistry.connect(registrar).finalizeWithSealedDocument(CERT_ID, sealedHash)
      ).to.be.revertedWith(
        "CertificateRegistry: credential was not submitted for sealed review"
      );
    });
  });

  describe("single uploaded document path", function () {
    /** Commit an uploaded document and carry the credential through dual approval. */
    async function approveUploadedDocument(
      ctx: Awaited<ReturnType<typeof deployFixture>>
    ) {
      const {
        certRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        chancellor,
        dataHash,
        docHash,
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
        .submitDocumentForApproval(CERT_ID, dataHash, docHash);
      await certRegistry.connect(vc).approveAsVC(CERT_ID);
      await certRegistry.connect(chancellor).approveAsChancellor(CERT_ID);
    }

    it("commits the document hash before any approval", async function () {
      const ctx = await deployFixture(ethers);
      const {
        certRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        dataHash,
        docHash,
      } = ctx;
      await fullSetup(
        ctx.issuerRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        ctx.chancellor
      );
      await certRegistry
        .connect(registrar)
        .submitDocumentForApproval(CERT_ID, dataHash, docHash);

      const cert = await certRegistry.getCertificate(CERT_ID);
      expect(cert.certHash).to.equal(dataHash);
      expect(cert.docHash).to.equal(docHash);
      expect(cert.transcriptDocHash).to.equal(ethers.ZeroHash);
      expect(cert.sealedDocHash).to.equal(ethers.ZeroHash);
      expect(cert.sealRequired).to.equal(false);
      expect(cert.finalizeRequired).to.equal(true);
      expect(cert.status).to.equal(Status.PendingApproval);
    });

    it("emits DocumentCommitted so an indexer can see the approved bytes", async function () {
      const ctx = await deployFixture(ethers);
      const {
        certRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        dataHash,
        docHash,
      } = ctx;
      await fullSetup(
        ctx.issuerRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        ctx.chancellor
      );

      await expect(
        certRegistry
          .connect(registrar)
          .submitDocumentForApproval(CERT_ID, dataHash, docHash)
      )
        .to.emit(certRegistry, "DocumentCommitted")
        .withArgs(CERT_ID, docHash, anyValue);
    });

    it("rejects a submission with an empty document hash", async function () {
      const ctx = await deployFixture(ethers);
      const { certRegistry, owner, instAdmin, registrar, vc, dataHash } = ctx;
      await fullSetup(
        ctx.issuerRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        ctx.chancellor
      );

      await expect(
        certRegistry
          .connect(registrar)
          .submitDocumentForApproval(CERT_ID, dataHash, ethers.ZeroHash)
      ).to.be.revertedWith("CertificateRegistry: empty docHash");
    });

    it("does not auto-issue on Chancellor approval, unlike the legacy path", async function () {
      const ctx = await deployFixture(ethers);
      await approveUploadedDocument(ctx);

      // This path holds a document hash with no transcript hash, exactly like
      // the legacy submit. Without finalizeRequired it would auto-issue here and
      // the registrar's final anchoring transaction would be skipped.
      const cert = await ctx.certRegistry.getCertificate(CERT_ID);
      expect(cert.status).to.equal(Status.PendingFinalize);
      expect(cert.issuedAt).to.equal(0n);
    });

    it("leaves the officers approving a record that already carries the hash", async function () {
      const ctx = await deployFixture(ethers);
      const { certRegistry, owner, instAdmin, registrar, vc, dataHash, docHash } = ctx;
      await fullSetup(
        ctx.issuerRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        ctx.chancellor
      );
      await certRegistry
        .connect(registrar)
        .submitDocumentForApproval(CERT_ID, dataHash, docHash);

      const beforeApproval = await certRegistry.getCertificate(CERT_ID);
      expect(beforeApproval.docHash).to.equal(docHash);

      await certRegistry.connect(vc).approveAsVC(CERT_ID);

      const afterApproval = await certRegistry.getCertificate(CERT_ID);
      expect(afterApproval.vcApprover).to.equal(await vc.getAddress());
      expect(afterApproval.docHash).to.equal(docHash);
    });

    it("issues on finalize when the same hash is re-sent", async function () {
      const ctx = await deployFixture(ethers);
      const { certRegistry, registrar, docHash } = ctx;
      await approveUploadedDocument(ctx);

      await expect(
        certRegistry.connect(registrar).finalizeCertificate(CERT_ID, docHash)
      )
        .to.emit(certRegistry, "CertificateFinalized")
        .withArgs(CERT_ID, docHash, anyValue)
        .and.to.emit(certRegistry, "CertificateIssued")
        .withArgs(CERT_ID, anyValue);

      const cert = await certRegistry.getCertificate(CERT_ID);
      expect(cert.status).to.equal(Status.Issued);
      expect(cert.docHash).to.equal(docHash);
      expect(cert.issuedAt).to.be.gt(0n);
    });

    it("rejects a finalize that substitutes a different document", async function () {
      const ctx = await deployFixture(ethers);
      const { certRegistry, registrar, docHash, sealedHash } = ctx;
      await approveUploadedDocument(ctx);

      // The whole point of committing the hash at submit: a swap between review
      // and issuance has to be impossible, not merely discouraged.
      await expect(
        certRegistry.connect(registrar).finalizeCertificate(CERT_ID, sealedHash)
      ).to.be.revertedWith(
        "CertificateRegistry: document hash was committed before review and cannot be changed"
      );

      const cert = await certRegistry.getCertificate(CERT_ID);
      expect(cert.docHash).to.equal(docHash);
      expect(cert.status).to.equal(Status.PendingFinalize);
    });

    it("reports the committed document hash as authoritative", async function () {
      const ctx = await deployFixture(ethers);
      const { certRegistry, registrar, docHash } = ctx;
      await approveUploadedDocument(ctx);
      await certRegistry.connect(registrar).finalizeCertificate(CERT_ID, docHash);

      const authoritative = await certRegistry.getAuthoritativeDocHash(CERT_ID);
      expect(authoritative.docHash).to.equal(docHash);
      expect(authoritative.sealedDocHash).to.equal(ethers.ZeroHash);
      expect(authoritative.isSealed).to.equal(false);
    });

    it("cannot be issued through finalizeCredential, which needs a transcript", async function () {
      const ctx = await deployFixture(ethers);
      const { certRegistry, registrar } = ctx;
      await approveUploadedDocument(ctx);

      await expect(
        certRegistry.connect(registrar).finalizeCredential(CERT_ID)
      ).to.be.revertedWith("CertificateRegistry: document pair missing");
    });

    it("cannot be sealed, because no document is produced after review", async function () {
      const ctx = await deployFixture(ethers);
      const { certRegistry, registrar, sealedHash } = ctx;
      await approveUploadedDocument(ctx);

      await expect(
        certRegistry.connect(registrar).finalizeWithSealedDocument(CERT_ID, sealedHash)
      ).to.be.revertedWith(
        "CertificateRegistry: credential was not submitted for sealed review"
      );
    });

    it("rejects a submission from an account that is not a registrar", async function () {
      const ctx = await deployFixture(ethers);
      const { certRegistry, owner, instAdmin, registrar, vc, stranger, dataHash, docHash } = ctx;
      await fullSetup(ctx.issuerRegistry, owner, instAdmin, registrar, vc, ctx.chancellor);

      await expect(
        certRegistry
          .connect(stranger)
          .submitDocumentForApproval(CERT_ID, dataHash, docHash)
      ).to.be.revertedWith(
        "CertificateRegistry: caller is not an active registrar/issuer"
      );
    });

    it("cannot reuse a certificate id that is already submitted", async function () {
      const ctx = await deployFixture(ethers);
      const {
        certRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        dataHash,
        docHash,
        transcriptHash,
      } = ctx;
      await fullSetup(
        ctx.issuerRegistry,
        owner,
        instAdmin,
        registrar,
        vc,
        ctx.chancellor
      );
      await certRegistry
        .connect(registrar)
        .submitDocumentForApproval(CERT_ID, dataHash, docHash);

      await expect(
        certRegistry
          .connect(registrar)
          .submitDocumentForApproval(CERT_ID, dataHash, transcriptHash)
      ).to.be.revertedWith("CertificateRegistry: certificate already submitted");
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
        .submitCertificate(CERT_ID, dataHash, docHash);
      await certRegistry.connect(vc).approveAsVC(CERT_ID);

      await expect(certRegistry.connect(chancellor).approveAsChancellor(CERT_ID))
        .to.emit(certRegistry, "CertificateIssued")
        .withArgs(CERT_ID, anyValue);

      const cert = await certRegistry.getCertificate(CERT_ID);
      expect(cert.status).to.equal(Status.Issued);
      expect(cert.docHash).to.equal(docHash);
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
        .registerCertificate(CERT_ID_2, dataHash, docHash);
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
        .finalizeCertificate(CERT_ID, docHash);

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
        .finalizeCertificate(CERT_ID, docHash);

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
        .finalizeCertificate(CERT_ID, docHash);

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
        .finalizeCertificate(CERT_ID, docHash);

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
        .finalizeCertificate(CERT_ID, docHash);

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
        .finalizeCertificate(CERT_ID, docHash);

      expect(await certRegistry.certificateCount()).to.equal(1n);
      expect(await certRegistry.certificateIdAt(0)).to.equal(CERT_ID);

      const byIssuer = await certRegistry.getCertificatesByIssuer(registrarAddr);
      expect(byIssuer).to.deep.equal([CERT_ID]);
    });
  });
});
