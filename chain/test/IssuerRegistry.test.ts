import { expect } from "chai";
import { network } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-ethers-chai-matchers/withArgs";
import { deployFixture } from "./helpers/fixtures.js";

const { ethers } = await network.create();

describe("IssuerRegistry", function () {
  it("requires three separate signer roles and excludes institution admin wallets", async function () {
    const {issuerRegistry, owner, instAdmin, registrar, vc} = await deployFixture(ethers);
    await issuerRegistry.connect(owner).registerIssuer(await instAdmin.getAddress(), "SEPARATE", "Separate University");
    await issuerRegistry.connect(instAdmin).authorizeRegistrar(await registrar.getAddress());
    await expect(issuerRegistry.connect(instAdmin).authorizeVC(await registrar.getAddress())).to.be.revertedWith("IssuerRegistry: signer already has another role");
    await issuerRegistry.connect(instAdmin).authorizeVC(await vc.getAddress());
    await expect(issuerRegistry.connect(instAdmin).authorizeChancellor(await vc.getAddress())).to.be.revertedWith("IssuerRegistry: signer already has another role");
    await expect(issuerRegistry.connect(instAdmin).authorizeVC(await instAdmin.getAddress())).to.be.revertedWith("IssuerRegistry: institution admin is not a signer");
    await expect(issuerRegistry.connect(instAdmin).authorizeChancellor(await instAdmin.getAddress())).to.be.revertedWith("IssuerRegistry: institution admin is not a signer");
  });
  describe("Deployment", function () {
    it("sets the deployer as owner", async function () {
      const { issuerRegistry, owner } = await deployFixture(ethers);
      expect(await issuerRegistry.owner()).to.equal(await owner.getAddress());
    });

    it("starts with zero institutions", async function () {
      const { issuerRegistry } = await deployFixture(ethers);
      expect(await issuerRegistry.institutionCount()).to.equal(0n);
    });
  });

  describe("registerIssuer", function () {
    it("owner can register an institution", async function () {
      const { issuerRegistry, owner, instAdmin } = await deployFixture(ethers);
      const instAdminAddr = await instAdmin.getAddress();

      await expect(
        issuerRegistry
          .connect(owner)
          .registerIssuer(instAdminAddr, "CUSL-001", "Central University SL")
      )
        .to.emit(issuerRegistry, "IssuerRegistered")
        .withArgs(instAdminAddr, "Central University SL", anyValue);

      expect(await issuerRegistry.isActiveIssuer(instAdminAddr)).to.be.true;
      expect(await issuerRegistry.institutionCount()).to.equal(1n);
    });

    it("reverts when non-owner tries to register", async function () {
      const { issuerRegistry, instAdmin, stranger } = await deployFixture(ethers);
      await expect(
        issuerRegistry
          .connect(stranger)
          .registerIssuer(await instAdmin.getAddress(), "X-001", "Bad Actor Uni")
      ).to.be.revertedWith("IssuerRegistry: caller is not the owner");
    });

    it("reverts on zero address", async function () {
      const { issuerRegistry, owner } = await deployFixture(ethers);
      await expect(
        issuerRegistry.connect(owner).registerIssuer(ethers.ZeroAddress, "X-001", "Uni")
      ).to.be.revertedWith("IssuerRegistry: zero address not allowed");
    });

    it("reverts on empty institutionId", async function () {
      const { issuerRegistry, owner, instAdmin } = await deployFixture(ethers);
      await expect(
        issuerRegistry.connect(owner).registerIssuer(await instAdmin.getAddress(), "", "Uni")
      ).to.be.revertedWith("IssuerRegistry: empty institutionId");
    });

    it("reverts on empty name", async function () {
      const { issuerRegistry, owner, instAdmin } = await deployFixture(ethers);
      await expect(
        issuerRegistry.connect(owner).registerIssuer(await instAdmin.getAddress(), "X-001", "")
      ).to.be.revertedWith("IssuerRegistry: empty name");
    });

    it("reverts if institution already active", async function () {
      const { issuerRegistry, owner, instAdmin } = await deployFixture(ethers);
      const addr = await instAdmin.getAddress();
      await issuerRegistry.connect(owner).registerIssuer(addr, "CUSL-001", "Uni");
      await expect(
        issuerRegistry.connect(owner).registerIssuer(addr, "CUSL-001", "Uni")
      ).to.be.revertedWith("IssuerRegistry: already active");
    });
  });

  describe("revokeIssuer", function () {
    it("owner can revoke an active institution", async function () {
      const { issuerRegistry, owner, instAdmin } = await deployFixture(ethers);
      const addr = await instAdmin.getAddress();
      await issuerRegistry.connect(owner).registerIssuer(addr, "CUSL-001", "Uni");

      await expect(issuerRegistry.connect(owner).revokeIssuer(addr))
        .to.emit(issuerRegistry, "IssuerRevoked")
        .withArgs(addr, anyValue);

      expect(await issuerRegistry.isActiveIssuer(addr)).to.be.false;
    });

    it("reverts when revoking a non-active institution", async function () {
      const { issuerRegistry, owner, instAdmin } = await deployFixture(ethers);
      await expect(
        issuerRegistry.connect(owner).revokeIssuer(await instAdmin.getAddress())
      ).to.be.revertedWith("IssuerRegistry: institution not active");
    });

    it("reverts when non-owner tries to revoke", async function () {
      const { issuerRegistry, owner, instAdmin, stranger } = await deployFixture(ethers);
      const addr = await instAdmin.getAddress();
      await issuerRegistry.connect(owner).registerIssuer(addr, "CUSL-001", "Uni");
      await expect(
        issuerRegistry.connect(stranger).revokeIssuer(addr)
      ).to.be.revertedWith("IssuerRegistry: caller is not the owner");
    });
  });

  describe("transferOwnership", function () {
    it("owner can transfer ownership", async function () {
      const { issuerRegistry, owner, stranger } = await deployFixture(ethers);
      const strangerAddr = await stranger.getAddress();
      await issuerRegistry.connect(owner).transferOwnership(strangerAddr);
      expect(await issuerRegistry.owner()).to.equal(strangerAddr);
    });

    it("reverts on zero address", async function () {
      const { issuerRegistry, owner } = await deployFixture(ethers);
      await expect(
        issuerRegistry.connect(owner).transferOwnership(ethers.ZeroAddress)
      ).to.be.revertedWith("IssuerRegistry: zero address not allowed");
    });

    it("reverts when non-owner calls", async function () {
      const { issuerRegistry, stranger } = await deployFixture(ethers);
      await expect(
        issuerRegistry.connect(stranger).transferOwnership(await stranger.getAddress())
      ).to.be.revertedWith("IssuerRegistry: caller is not the owner");
    });
  });

  describe("Registrar management", function () {
    it("active institution can authorize a registrar", async function () {
      const { issuerRegistry, owner, instAdmin, registrar } = await deployFixture(ethers);
      const instAdminAddr = await instAdmin.getAddress();
      const registrarAddr = await registrar.getAddress();
      await issuerRegistry.connect(owner).registerIssuer(instAdminAddr, "CUSL-001", "Uni");

      await expect(issuerRegistry.connect(instAdmin).authorizeRegistrar(registrarAddr))
        .to.emit(issuerRegistry, "RegistrarAuthorized")
        .withArgs(instAdminAddr, registrarAddr, anyValue);

      expect(await issuerRegistry.isAuthorizedRegistrar(registrarAddr)).to.be.true;
      expect(await issuerRegistry.getInstitutionOf(registrarAddr)).to.equal(instAdminAddr);
    });

    it("institution can revoke its own registrar", async function () {
      const { issuerRegistry, owner, instAdmin, registrar } = await deployFixture(ethers);
      const instAdminAddr = await instAdmin.getAddress();
      const registrarAddr = await registrar.getAddress();
      await issuerRegistry.connect(owner).registerIssuer(instAdminAddr, "CUSL-001", "Uni");
      await issuerRegistry.connect(instAdmin).authorizeRegistrar(registrarAddr);

      await expect(issuerRegistry.connect(instAdmin).revokeRegistrar(registrarAddr))
        .to.emit(issuerRegistry, "RegistrarRevoked")
        .withArgs(instAdminAddr, registrarAddr, anyValue);

      expect(await issuerRegistry.isAuthorizedRegistrar(registrarAddr)).to.be.false;
    });

    it("cascade: revoking institution deactivates registrar at read-time", async function () {
      const { issuerRegistry, owner, instAdmin, registrar } = await deployFixture(ethers);
      const instAdminAddr = await instAdmin.getAddress();
      const registrarAddr = await registrar.getAddress();
      await issuerRegistry.connect(owner).registerIssuer(instAdminAddr, "CUSL-001", "Uni");
      await issuerRegistry.connect(instAdmin).authorizeRegistrar(registrarAddr);
      await issuerRegistry.connect(owner).revokeIssuer(instAdminAddr);

      expect(await issuerRegistry.isAuthorizedRegistrar(registrarAddr)).to.be.false;
    });

    it("reverts when inactive institution tries to authorize", async function () {
      const { issuerRegistry, owner, instAdmin, registrar } = await deployFixture(ethers);
      const instAdminAddr = await instAdmin.getAddress();
      await issuerRegistry.connect(owner).registerIssuer(instAdminAddr, "CUSL-001", "Uni");
      await issuerRegistry.connect(owner).revokeIssuer(instAdminAddr);

      await expect(
        issuerRegistry.connect(instAdmin).authorizeRegistrar(await registrar.getAddress())
      ).to.be.revertedWith("IssuerRegistry: caller is not an active institution");
    });

    it("reverts when wrong institution tries to revoke a registrar", async function () {
      const { issuerRegistry, owner, instAdmin, registrar, stranger } =
        await deployFixture(ethers);
      const instAdminAddr = await instAdmin.getAddress();
      const registrarAddr = await registrar.getAddress();
      await issuerRegistry.connect(owner).registerIssuer(instAdminAddr, "CUSL-001", "Uni");
      await issuerRegistry.connect(instAdmin).authorizeRegistrar(registrarAddr);

      await expect(
        issuerRegistry.connect(stranger).revokeRegistrar(registrarAddr)
      ).to.be.revertedWith("IssuerRegistry: not the authorizing institution");
    });
  });

  describe("VC management", function () {
    it("active institution can authorize and revoke a VC", async function () {
      const { issuerRegistry, owner, instAdmin, vc } = await deployFixture(ethers);
      const instAdminAddr = await instAdmin.getAddress();
      const vcAddr = await vc.getAddress();
      await issuerRegistry.connect(owner).registerIssuer(instAdminAddr, "CUSL-001", "Uni");

      await expect(issuerRegistry.connect(instAdmin).authorizeVC(vcAddr))
        .to.emit(issuerRegistry, "VCAuthorized")
        .withArgs(instAdminAddr, vcAddr, anyValue);

      expect(await issuerRegistry.isAuthorizedVC(vcAddr)).to.be.true;
      expect(await issuerRegistry.getInstitutionOfVC(vcAddr)).to.equal(instAdminAddr);

      await expect(issuerRegistry.connect(instAdmin).revokeVC(vcAddr))
        .to.emit(issuerRegistry, "VCRevoked")
        .withArgs(instAdminAddr, vcAddr, anyValue);

      expect(await issuerRegistry.isAuthorizedVC(vcAddr)).to.be.false;
    });

    it("cascade: revoking institution deactivates VC at read-time", async function () {
      const { issuerRegistry, owner, instAdmin, vc } = await deployFixture(ethers);
      const instAdminAddr = await instAdmin.getAddress();
      const vcAddr = await vc.getAddress();
      await issuerRegistry.connect(owner).registerIssuer(instAdminAddr, "CUSL-001", "Uni");
      await issuerRegistry.connect(instAdmin).authorizeVC(vcAddr);
      await issuerRegistry.connect(owner).revokeIssuer(instAdminAddr);

      expect(await issuerRegistry.isAuthorizedVC(vcAddr)).to.be.false;
    });

    it("reverts when wrong institution tries to revoke a VC", async function () {
      const { issuerRegistry, owner, instAdmin, vc, stranger } = await deployFixture(ethers);
      const instAdminAddr = await instAdmin.getAddress();
      const vcAddr = await vc.getAddress();
      await issuerRegistry.connect(owner).registerIssuer(instAdminAddr, "CUSL-001", "Uni");
      await issuerRegistry.connect(instAdmin).authorizeVC(vcAddr);

      await expect(
        issuerRegistry.connect(stranger).revokeVC(vcAddr)
      ).to.be.revertedWith("IssuerRegistry: not the authorizing institution");
    });
  });

  describe("Chancellor management", function () {
    it("active institution can authorize and revoke a Chancellor", async function () {
      const { issuerRegistry, owner, instAdmin, chancellor } = await deployFixture(ethers);
      const instAdminAddr = await instAdmin.getAddress();
      const chancellorAddr = await chancellor.getAddress();
      await issuerRegistry.connect(owner).registerIssuer(instAdminAddr, "CUSL-001", "Uni");

      await expect(issuerRegistry.connect(instAdmin).authorizeChancellor(chancellorAddr))
        .to.emit(issuerRegistry, "ChancellorAuthorized")
        .withArgs(instAdminAddr, chancellorAddr, anyValue);

      expect(await issuerRegistry.isAuthorizedChancellor(chancellorAddr)).to.be.true;

      await expect(issuerRegistry.connect(instAdmin).revokeChancellor(chancellorAddr))
        .to.emit(issuerRegistry, "ChancellorRevoked")
        .withArgs(instAdminAddr, chancellorAddr, anyValue);

      expect(await issuerRegistry.isAuthorizedChancellor(chancellorAddr)).to.be.false;
    });

    it("cascade: revoking institution deactivates Chancellor at read-time", async function () {
      const { issuerRegistry, owner, instAdmin, chancellor } = await deployFixture(ethers);
      const instAdminAddr = await instAdmin.getAddress();
      const chancellorAddr = await chancellor.getAddress();
      await issuerRegistry.connect(owner).registerIssuer(instAdminAddr, "CUSL-001", "Uni");
      await issuerRegistry.connect(instAdmin).authorizeChancellor(chancellorAddr);
      await issuerRegistry.connect(owner).revokeIssuer(instAdminAddr);

      expect(await issuerRegistry.isAuthorizedChancellor(chancellorAddr)).to.be.false;
    });
  });
});
