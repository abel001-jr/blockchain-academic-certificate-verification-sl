# Persistent local Anvil node

From the `chain` directory, run `npm run node:persistent`.
This uses port 8545, chain ID 31337 and 20 development accounts. It restores
`.local-chain/anvil-state.json` and checkpoints state every five seconds.
Keep this file: deleting it creates a new blockchain. An abrupt shutdown may
lose changes made since the last checkpoint. Keep a backup after stopping the node.

Anvil writes to `anvil-state.json.pending`. The launcher validates each completed
snapshot before replacing `anvil-state.json` and keeps the previous valid snapshot
as `anvil-state.json.bak`. If the main checkpoint is invalid, startup recovers from
a valid pending snapshot or backup and archives the damaged file. If neither is
available, startup stops without resetting the chain. A truncated file cannot
reliably recreate missing contracts or history.

After an intentional fresh-chain reset, archive the old
`ignition/deployments/anvil-persistent-31337` directory before deploying again;
its journal describes the previous chain. Then deploy and register institutions
and officers again. Archived deployment directories are not state backups.

For the first start only, use another terminal in `chain`:

```powershell
npm run deploy:anvil
```

Deployment addresses are recorded in
`ignition/deployments/anvil-persistent-31337/deployed_addresses.json`.
Ensure Settings > Blockchain uses these addresses, RPC `http://127.0.0.1:8545`
and chain ID `31337`. Register institutions and authorize officers on this chain.

For subsequent restarts, use only `npm run node:persistent`. Do not run the
fresh deployment script or delete the state file. Hardhat still compiles and
deploys contracts; Anvil now hosts the running blockchain.

This does not import the stopped Hardhat node's history. Credentials submitted
there need recovery/resubmission before approvals on the new chain. Database
records and IPFS files alone cannot recreate lost blockchain history.
