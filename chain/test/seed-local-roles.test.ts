import { expect } from "chai";
import { network } from "hardhat";

import { deployFixture } from "./helpers/fixtures.js";
// The seeding logic is imported from the script so this test and the CLI can
// never disagree about what "already seeded" means.
import { seedRoles } from "../scripts/seed-local-roles.mjs";

const { ethers } = await network.create();

const INSTITUTION_ID = "CUSL-SL-01";
const INSTITUTION_NAME = "Central university Sierra Leone";

/**
 * `chain/scripts/seed-local-roles.mjs` exists because a local node restart wipes
 * on-chain roles while the Django database keeps reporting the institution as
 * anchored, leaving a registrar who is rejected by the contract and no screen in
 * the app that can repair it. The properties below are what make the script safe
 * to wire into a redeploy:
 *
 *  - a fresh chain ends up able to accept a submission, which is the whole point;
 *  - running it twice sends nothing, so a redeploy cannot fail on `already active`;
 *  - it repairs a partially-seeded chain rather than assuming all-or-nothing;
 *  - an institutionId that disagrees with the database is refused, because the
 *    contract stores that string and the indexer joins on it — seeding anyway
 *    would produce credentials that never resolve to a Django institution.
 */
describe("seed-local-roles", function () {
  async function ctx() {
    const { issuerRegistry, owner, instAdmin, registrar, vc, chancellor, certRegistry } =
      await deployFixture(ethers);

    const seed = async (overrides: Record<string, unknown> = {}) =>
      seedRoles({
        registry: issuerRegistry,
        owner,
        instAdmin,
        institutionAdmin: await instAdmin.getAddress(),
        institutionId: INSTITUTION_ID,
        institutionName: INSTITUTION_NAME,
        registrar: await registrar.getAddress(),
        vc: await vc.getAddress(),
        chancellor: await chancellor.getAddress(),
        ...overrides,
      });

    return { issuerRegistry, certRegistry, owner, instAdmin, registrar, vc, chancellor, seed };
  }

  it("leaves a fresh chain able to accept a submission", async function () {
    const { issuerRegistry, certRegistry, registrar, vc, chancellor, instAdmin, seed } = await ctx();

    expect(await issuerRegistry.isActiveIssuer(await instAdmin.getAddress())).to.equal(false);

    const actions = await seed();

    expect(actions).to.have.length(4); // registerIssuer + 3 authorizations
    expect(await issuerRegistry.isActiveIssuer(await instAdmin.getAddress())).to.equal(true);
    expect(await issuerRegistry.isAuthorizedRegistrar(await registrar.getAddress())).to.equal(true);
    expect(await issuerRegistry.isAuthorizedVC(await vc.getAddress())).to.equal(true);
    expect(await issuerRegistry.isAuthorizedChancellor(await chancellor.getAddress())).to.equal(true);

    // The whole reason for the script: this is the call that was reverting.
    const certId = "CR-2026-CUSL-SEED-1";
    await certRegistry
      .connect(registrar)
      .submitForSealedReview(certId, ethers.toBeHex(11, 32), ethers.toBeHex(22, 32));

    const cert = await certRegistry.getCertificate(certId);
    expect(cert.institutionId).to.equal(INSTITUTION_ID);
    expect(cert.issuer).to.equal(await registrar.getAddress());
  });

  it("sends nothing on a second run", async function () {
    const { seed } = await ctx();

    expect(await seed()).to.have.length(4);
    // A redeploy script that is run twice must not revert on `already active`.
    expect(await seed()).to.deep.equal([]);
    expect(await seed()).to.deep.equal([]);
  });

  it("repairs a chain where the institution is registered but no officer is", async function () {
    const { issuerRegistry, instAdmin, owner, registrar, vc, chancellor, seed } = await ctx();
    const instAdminAddr = await instAdmin.getAddress();

    // The state a node restart followed by a manual re-anchor leaves behind.
    await issuerRegistry
      .connect(owner)
      .registerIssuer(instAdminAddr, INSTITUTION_ID, INSTITUTION_NAME);

    const actions = await seed();

    expect(actions).to.have.length(3);
    expect(actions.every((a) => a.startsWith("authorize"))).to.equal(true);
    expect(await issuerRegistry.isAuthorizedVC(await vc.getAddress())).to.equal(true);
    expect(await issuerRegistry.isAuthorizedChancellor(await chancellor.getAddress())).to.equal(true);
  });

  it("repairs a chain where only some officers were authorized", async function () {
    const { issuerRegistry, instAdmin, vc, seed } = await ctx();

    await seed();
    const partial = { log: () => {} };
    // Re-wind by revoking the VC, as revokeVC would on a role change.
    await issuerRegistry.connect(instAdmin).revokeVC(await vc.getAddress());

    const actions = await seed(partial);

    expect(actions).to.have.length(1);
    expect(actions[0]).to.contain("authorizeVC");
    expect(await issuerRegistry.isAuthorizedVC(await vc.getAddress())).to.equal(true);
  });

  it("refuses to seed an institutionId that disagrees with the database", async function () {
    const { issuerRegistry, owner, instAdmin, registrar, vc, chancellor, seed } = await ctx();

    await seed();
    const mismatched = { institutionId: "SOME-OTHER-ID" };

    // Silently accepting this would register a chain-side id the indexer can
    // never join to, so the credentials would be invisible in Django forever.
    await expect(seed(mismatched)).to.be.rejectedWith(/already registered on-chain/);

    // And it must not have touched the existing registration.
    const inst = await issuerRegistry.getInstitution(await instAdmin.getAddress());
    expect(inst.institutionId).to.equal(INSTITUTION_ID);
    expect(await issuerRegistry.isAuthorizedVC(await vc.getAddress())).to.equal(true);
    expect(await issuerRegistry.isAuthorizedChancellor(await chancellor.getAddress())).to.equal(true);
    void owner;
    void registrar;
  });

  it("refuses an institution-admin signer before sending any transaction", async function () {
    const { issuerRegistry, instAdmin, seed } = await ctx();

    // The local default: one wallet is both the institution admin and the
    // registrar, which is the arrangement the dashboard's own seed uses.
    await expect(seed({
      registrar: await instAdmin.getAddress(),
    })).to.be.rejectedWith("Specify three distinct signer wallets separate from institution admin.");

    expect(await issuerRegistry.isActiveIssuer(await instAdmin.getAddress())).to.equal(false);
  });
});
