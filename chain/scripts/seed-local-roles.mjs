/**
 * seed-local-roles.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Restores the on-chain roles a local INTELLIGENT ACADEMIC CREDENTIALING install needs, idempotently.
 *
 * Why this exists
 * ───────────────
 * `hardhat node` keeps all state in memory, so restarting it wipes every role
 * while the Django database keeps saying `is_chain_active=True`. The registrar
 * is then rejected by the contract with "caller is not an active registrar/issuer",
 * and — because the anchor page only listed `?is_chain_active=false` — there was
 * no screen in the app that could re-register the institution. The only recovery
 * was a manual DB edit plus raw contract calls, which is a bad way to discover
 * that you restarted a node.
 *
 * A redeploy could not fix it either: the Ignition module deploys the two
 * registries and stops. It never creates an institution, so every fresh chain
 * was a chain on which nothing could be issued.
 *
 * What it does
 * ───────────
 * Reads current state first and sends only the transactions that are actually
 * missing, so it is safe to run against an already-seeded chain. Run order is
 * forced by the contract: only the IssuerRegistry owner may register an
 * institution, and only an active institution may authorize anybody.
 *
 * Usage (from repo root, with `npx hardhat node` running):
 *   cd chain && node scripts/seed-local-roles.mjs
 *
 * Overrides (all optional) — every value below is the local dev default:
 *   SEED_RPC_URL                    node to seed
 *   SEED_ISSUER_REGISTRY_ADDRESS    contract to seed
 *   SEED_INSTITUTION_ADMIN          wallet to register as the institution admin;
 *                                   must be an account the node holds, because
 *                                   it is the one that authorizes the officers
 *   SEED_INSTITUTION_ID             off-chain id; MUST match the Django row,
 *                                   because the contract stores this string and
 *                                   the indexer matches on it
 *   SEED_INSTITUTION_NAME           human-readable name
 *   SEED_REGISTRAR                  wallet to authorize as registrar; defaults
 *                                   to the institution admin
 *   SEED_VC_ADDRESS                 wallet to authorize as VC
 *   SEED_CHANCELLOR_ADDRESS         wallet to authorize as Chancellor
 *
 * It deliberately does NOT touch any other institution. Seeding is a local
 * development convenience; authority over real deployments is the Super Admin's
 * through the dashboard, and a script that could silently re-anchor whatever it
 * found would be the wrong tool there.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULTS = {
  SEED_ISSUER_REGISTRY_ADDRESS: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  SEED_INSTITUTION_ADMIN: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
  SEED_REGISTRAR: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  SEED_INSTITUTION_ID: "CUSL-SL-01",
  SEED_INSTITUTION_NAME: "Central university Sierra Leone",
  SEED_VC_ADDRESS: "0x2546bcd3c84621e976d8185a91a922ae77ecec30",
  SEED_CHANCELLOR_ADDRESS: "0xcd3b766ccdd6ae721141f452c550ca635964ce71",
};

const cfg = (key) => (process.env[key] || DEFAULTS[key]).trim();
const REGISTRAR = cfg("SEED_REGISTRAR");
const RPC = process.env.SEED_RPC_URL || "http://127.0.0.1:8545";

/**
 * Bring one institution and its officers into the state a local install needs.
 *
 * Split out from the CLI so the decision logic — what is missing, what is
 * already correct, and which mismatch is worth refusing over — is exercised by
 * `test/seed-local-roles.test.ts` against a real contract rather than only by
 * someone remembering to run it by hand.
 *
 * Returns the list of actions actually taken, so a caller can assert that a
 * second run is a no-op. Throws on a mismatch that quietly skipping would hide.
 */
export async function seedRoles({
  registry,
  owner,
  instAdmin,
  institutionAdmin,
  institutionId,
  institutionName,
  registrar,
  vc,
  chancellor,
  log = () => {},
}) {
  const identities = [institutionAdmin, registrar, vc, chancellor];
  if (identities.some(value => !value) || new Set(identities.map(value => value.toLowerCase())).size !== 4) {
    throw new Error("Specify three distinct signer wallets separate from institution admin.");
  }
  const actions = [];

  const send = async (label, fn) => {
    const receipt = await (await fn()).wait(1);
    log(`  + ${label}`);
    log(`      tx ${receipt.hash}`);
    actions.push(label);
    return receipt;
  };

  if (await registry.isActiveIssuer(institutionAdmin)) {
    const inst = await registry.getInstitution(institutionAdmin);
    // The institution id is the join key between chain and database. If it
    // disagrees, the indexer will not match this institution to its Django row,
    // so this is worth failing loudly over rather than quietly skipping.
    if (inst.institutionId !== institutionId) {
      throw new Error(
        `Institution ${institutionAdmin} is already registered on-chain as ` +
          `"${inst.institutionId}" but SEED_INSTITUTION_ID is "${institutionId}". ` +
          `These must match the Django Institution.institution_id or the ` +
          `credentials will not be indexed against it. Fix the env var, or ` +
          `revoke the institution and register it again.`,
      );
    }
    log(`  = institution already active: ${inst.institutionId} (${inst.name})`);
  } else {
    log(`  > registering institution ${institutionId} (admin ${institutionAdmin})`);
    await send(`registerIssuer(${institutionAdmin}, ${institutionId})`, () =>
      registry.connect(owner).registerIssuer(institutionAdmin, institutionId, institutionName),
    );
  }

  // Everything below must be sent by an active institution, so sign as the
  // institution admin rather than the owner.
  const asAdmin = registry.connect(instAdmin);

  const role = async (label, address, isSet, method) => {
    if (await isSet()) {
      log(`  = ${label} already authorized: ${address}`);
      return;
    }
    await send(`authorize${label}(${address})`, () => asAdmin[method](address));
  };

  await role(
    "Registrar",
    registrar,
    () => registry.isAuthorizedRegistrar(registrar),
    "authorizeRegistrar",
  );
  await role("VC", vc, () => registry.isAuthorizedVC(vc), "authorizeVC");
  await role(
    "Chancellor",
    chancellor,
    () => registry.isAuthorizedChancellor(chancellor),
    "authorizeChancellor",
  );

  return actions;
}

const line = (s = "") => console.log(s);

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);

  // The compiled artifact is used rather than a hand-written ABI list: these
  // functions return a Solidity struct, and re-typing that signature by hand is
  // exactly the kind of drift this script exists to prevent.
  const artifact = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "artifacts",
    "contracts",
    "IssuerRegistry.sol",
    "IssuerRegistry.json",
  );
  if (!fs.existsSync(artifact)) {
    throw new Error(`Missing ${artifact}. Run \`npx hardhat compile\` first.`);
  }
  const IR_ABI = JSON.parse(fs.readFileSync(artifact, "utf8")).abi;

  const REGISTRY_ADDRESS = cfg("SEED_ISSUER_REGISTRY_ADDRESS");
  const INSTITUTION_ADMIN = cfg("SEED_INSTITUTION_ADMIN");

  line("");
  line("╔══════════════════════════════════════════════════════╗");
  line("║        INTELLIGENT ACADEMIC CREDENTIALING — Local Chain Role Seeding            ║");
  line("╚══════════════════════════════════════════════════════╝");
  line(`  node     ${RPC}`);
  line(`  chain    ${(await provider.getNetwork()).chainId}`);
  line(`  registry ${REGISTRY_ADDRESS}`);
  line("");

  if ((await provider.getCode(REGISTRY_ADDRESS)) === "0x") {
    throw new Error(
      `No contract at ${REGISTRY_ADDRESS}. Run scripts/redeploy-local.sh first, ` +
        `or set SEED_ISSUER_REGISTRY_ADDRESS to the deployed address.`,
    );
  }

  // Signer 0 is the account that ran the Ignition deploy, and therefore the
  // IssuerRegistry owner. Only it can call registerIssuer.
  const owner = await provider.getSigner(0);
  const ownerAddress = (await owner.getAddress()).toString();
  const registry = new ethers.Contract(REGISTRY_ADDRESS, IR_ABI, owner);

  const onChainOwner = (await registry.owner()).toString();
  if (onChainOwner.toLowerCase() !== ownerAddress.toLowerCase()) {
    throw new Error(
      `Signer 0 (${ownerAddress}) is not the IssuerRegistry owner (${onChainOwner}). ` +
        `Point SEED_RPC_URL at the node, or set the deploying wallet to account 0.`,
    );
  }

  // The institution admin authorizes the officers, so it must be an unlocked
  // account on this node. Its index is looked up rather than assumed to be 1, so
  // a node started with custom accounts works. `eth_accounts` is used directly
  // because `listAccounts()` yields signer objects, not addresses, on ethers 6.
  const unlocked = (await provider.send("eth_accounts", [])).map((a) => a.toString());
  const instAdminIndex = unlocked.findIndex(
    (a) => a.toLowerCase() === INSTITUTION_ADMIN.toLowerCase(),
  );
  if (instAdminIndex < 0) {
    throw new Error(
      `${INSTITUTION_ADMIN} is not an unlocked account on ${RPC}, so it cannot ` +
        `authorize the officers. Import its private key into the node, or set ` +
        `SEED_INSTITUTION_ADMIN to an account the node holds.`,
    );
  }

  await seedRoles({
    registry,
    owner,
    instAdmin: await provider.getSigner(instAdminIndex),
    institutionAdmin: INSTITUTION_ADMIN,
    institutionId: cfg("SEED_INSTITUTION_ID"),
    institutionName: cfg("SEED_INSTITUTION_NAME"),
    registrar: REGISTRAR,
    vc: cfg("SEED_VC_ADDRESS"),
    chancellor: cfg("SEED_CHANCELLOR_ADDRESS"),
    log: line,
  });

  line("");
  line("✔  Roles ready:");
  line(`   institution admin  ${INSTITUTION_ADMIN}  (${cfg("SEED_INSTITUTION_ID")})`);
  line(`   registrar          ${REGISTRAR}`);
  line(`   VC                 ${cfg("SEED_VC_ADDRESS")}`);
  line(`   Chancellor         ${cfg("SEED_CHANCELLOR_ADDRESS")}`);
  line("");
  line("   If Django still shows the institution as unanchored, re-anchor it so");
  line("   the tx_hash is recorded:");
  line("     Dashboard → Admin → Anchor");
  line("");
}

// Only run when invoked directly: importing this module (for the tests) must not
// reach out to a chain.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("");
    console.error(`✖  ${err.shortMessage || err.reason || err.message}`);
    console.error("");
    process.exitCode = 1;
  });
}
