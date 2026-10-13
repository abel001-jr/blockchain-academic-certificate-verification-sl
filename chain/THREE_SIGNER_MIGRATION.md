# Three-signer deployment migration

Prepared for Registrar, Vice-Chancellor and Chancellor. Institution-admin wallets
control authorization and cannot sign credentials. Existing contracts are not
upgradeable; this migration uses a new deployment and preserves the old registry.

## Confirmed account mapping

The existing account now has the Institutional Admin role and retains wallet
`0x70997970C51812dc3A010C7d01b50e0d17dc79C8`, its login and all historical references.
The new Registrar account is `resgistrar@central.edu.sl` (spelling supplied by the
user), assigned wallet `0xdD2FD4581271e230360230F9337D5c0430Bf44C0`.
The institution email domain is `central.edu.sl`. The Registrar has an unusable
password until password setup, and wallet ownership and authorization flags remain
false until verification. No credentials, signatures or passwords were copied.

On 2026-10-11 the local node was at block 2 and the configured IssuerRegistry
returned an empty, inactive institution record. Database anchor records therefore
describe the earlier node state. Do not overwrite those transaction hashes or claim
that old credentials exist on the restarted chain. No deployment or authorization
transactions have been sent as part of this account update.

Migration `certify.0018` preserves the configured registry coordinates on existing
certificates. Those coordinates are a routing snapshot, not evidence that a reset
node still retains historical transactions. Recover the earlier node state for
historical chain verification. All four role wallets must be distinct.

## Deployment sequence

1. Export current ChainConfig coordinates and credential IDs, statuses and transaction
   hashes. Keep the existing node/state running; restarting Hardhat destroys the old
   contracts. Preserve the current `Credence` Ignition journal.
2. Record each historical credential's registry coordinates before a switch. Confirm
   existing issued records can still be read from their original registry. Review
   pending approvals separately: never send their remaining transactions to the new
   registry or silently regenerate their document hashes.
3. Deploy the new module from `chain/`:

   `npx.cmd hardhat ignition deploy ignition/modules/CredenceThreeSigners.ts --network localhost`

   Use a separate deployment ID if the module has already been deployed on that
   chain. Do not run `deploy:fresh`, delete journals, or reset the node.
4. Register the institution on the new IssuerRegistry and authorize the distinct
   Registrar, VC and Chancellor addresses using `scripts/seed-local-roles.mjs` with
   explicit environment values. The seed script rejects overlapping roles before
   sending any transaction. Use the new registry address, not its default old one.
5. Confirm all three signer authorizations, the Registrar's proven identity, and
   the new CertificateRegistry's issuer-registry dependency. Test a new credential's
   complete Registrar → VC → Chancellor → Registrar-finalization sequence.
6. Only then switch saved Blockchain settings for new issuance. Runtime wallet
   calls now read these saved addresses and validate the wallet network.

## Activation boundary

This file and module prepare deployment; they do not execute it or switch the
application. Historical registry snapshots/routing must be in place before changing
ChainConfig. Old issued PDFs and anchored hashes must remain unchanged. Complete or
explicitly resolve pending records before reassigning the existing Registrar wallet.
