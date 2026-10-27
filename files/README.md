# Intelligent Academic Credentialing

Intelligent Academic Credentialing is a monorepo for a blockchain-backed academic certificate issuance and verification platform.

## Documentation — look up in this order

1. [`CREDENTIAL_ISSUANCE_PIPELINE_DESIGN.md`](CREDENTIAL_ISSUANCE_PIPELINE_DESIGN.md) — the intended certificate and transcript lifecycle across the three Registrar workflows, the shared VC → Dean → Registrar pipeline, the load-bearing hashing/privacy rules, and acceptance criteria.
2. [`REMAINING_WORK.md`](REMAINING_WORK.md) — the ordered backlog for closing the gap between that design and the current code. Read this second, then work top to bottom.

Supporting notes, not part of the spec:

- [`TRANSCRIPT_IMPLEMENTATION_REVIEW.md`](TRANSCRIPT_IMPLEMENTATION_REVIEW.md) — review of the transcript upload work.
- [`IMPLEMENTATION_SUMMARY.md`](IMPLEMENTATION_SUMMARY.md) — CRUD, flows, and officer limits as built.
- [`NOTIFICATION_IMPLEMENTATION.md`](NOTIFICATION_IMPLEMENTATION.md) — browser push notifications.
- `research/` — supporting notes and prompts.

## Repository structure

- `back/cred/` — Django REST API
- `chain/` — Hardhat smart contracts
- `front/app-next/` — Next.js frontend
- `mobile-app/` — mobile app workspace
- `research/` — supporting notes and prompts

## One repo-level `.gitignore`

Use the root `.gitignore` only. It already covers nested local secrets such as:

- `back/cred/.env`
- `front/app-next/.env.local`
- `chain/.env`

The rule is intentionally broad so you do not need a separate ignore file per app.

## Environment setup

Keep real secrets local and commit only templates.

1. Copy the backend example into its local environment file:
   Run from the repository root in CMD only if the destination does not exist:
   ```cmd
   if not exist back\cred\.env copy back\cred\.env.example back\cred\.env
   ```

2. Create the frontend local environment file:
   ```cmd
   if not exist front\app-next\.env.local copy front\app-next\.env.example front\app-next\.env.local
   ```

3. For chain-local settings, create a local `chain/.env` if needed.

## Local development

- [Normal startup commands](NORMAL_START_CMD.md) — daily startup after setup/reset.
- [Clean start commands](CLEAN_START_CMD.md) — full reset and fresh deployment.

### Document reading

See [local reading flow and review findings](LOCAL_READING_REVIEW.md) for the text/image libraries, fixes, and remaining limits.

Choose a reading method before reading or re-reading an uploaded document:

- **Local reading:** the existing PDF text extraction and Tesseract OCR system. No external AI calls.
- **Deep reading:** external AI model reading through Groq. The server reads the PDF text (using OCR for scans), then Groq extracts fields with citations to that text. Logo/seal comparison images may also be sent to Groq. Registrar review is still required.

Deep reading uses `GROQ_API_KEY`, `GROQ_MODEL`, and `GROQ_VISION_MODEL` from the backend environment. Restart Django after changing them. Ollama is not used. If Groq fails, retry or select Local reading; the app reports the failure. Scanned documents still require local OCR, so total reading time depends on document size and scan quality.

### Pinata storage synchronization

After updating this checkout, stop Django and apply the new snapshot migration
from `back\cred`:

```cmd
python manage.py migrate
```

Restart Django, then open a separate CMD terminal for the storage worker:

```cmd
cd /d "C:\Users\Sam Jr\Documents\GitHub\blockchain-academic-certificate-verification-sl\back\cred"
python manage.py sync_pinata_usage
```

Keep this worker running to synchronize account storage usage. For a scheduled
task, use `python manage.py sync_pinata_usage --once` instead. A database lease
and retry schedule prevent duplicate workers from fetching simultaneously.
Dashboard requests read the saved snapshot and never contact Pinata. Credential
counts come from application database records, not Pinata file listings.

Successful syncs are at least 60 seconds apart. Failures back off from 60 seconds
up to one hour; HTTP 429 also respects a longer `Retry-After`. Last successful
totals survive failures and backend restarts. The dashboard marks stale values
as temporarily unavailable. Without the worker, saved values remain visible but
become stale. Storage failures never change a credential's stored/issued status.
PDF previews load when their viewer opens, not during dashboard statistics
refreshes. Gateway cooldowns and saved-copy integrity checks remain in effect.

Use four separate CMD terminals and keep each running. The commands below use
this checkout's absolute paths, so they work regardless of the current folder.
Install dependencies once with `npm install` in each JavaScript workspace and
`python -m pip install -r requirements.txt` in `back\cred`; repeat installation
when dependencies change, rather than on every startup.

### 1) Chain terminal: persistent Anvil

```cmd
cd /d "C:\Users\Sam Jr\Documents\GitHub\blockchain-academic-certificate-verification-sl\chain"
npm run node:persistent
```

Wait for `Listening on 127.0.0.1:8545`. RPC: `http://127.0.0.1:8545`;
chain ID: `31337`; MetaMask currency symbol: `ETH`.
If port 8545 is occupied, identify the existing node; do not start a second one.
Hardhat and Anvil cannot share that port.  

The startup command loads `chain/.local-chain/anvil-state.json` and saves a
checkpoint every five seconds. Keep this file and use the same command after
restarts. Allow at least five seconds after the final confirmed transaction
before stopping the node with `Ctrl+C`. Back up the state file after stopping.

**This checkout's contracts have already been deployed to Anvil. Do not deploy
again for normal startup, backend resets, or frontend/mobile restarts.**
Do not use `npm run node` (Hardhat), `deploy:fresh`, or the old redeploy script
for this persistent workflow.

For an entirely new Anvil chain with no deployed contracts, deploy once from a
separate CMD terminal in `chain`:

```cmd
npm run deploy:anvil
```

Read the deployed addresses from
`chain/ignition/deployments/anvil-persistent-31337/deployed_addresses.json` and
check Settings > Blockchain in the app. Register the institution and authorize
officers once on the new chain. See [persistent chain notes](../chain/PERSISTENT_LOCAL_CHAIN.md).

Resetting Django does not reset Anvil. When rebuilding backend records, reuse
the existing institution ID and wallets if retaining the chain registration.
Old Hardhat history erased by a restart is not recovered by Anvil; affected
credentials need Registrar resubmission and subsequent approvals.

### 2) Backend terminal

```cmd
cd /d "C:\Users\Sam Jr\Documents\GitHub\blockchain-academic-certificate-verification-sl\back\cred"
python manage.py runserver
```

For a fresh database or newly added migrations, run `python manage.py migrate`
before starting the server. Create the initial administrator once with
`python manage.py createsuperuser`. Keep migration files; deleting them can
break the dependency graph and database history. `makemigrations` is for model
changes, not routine startup or cache clearing.

**Clear Django cache:**
Run from `back\cred` in CMD:
```cmd
python manage.py shell -c "from django.core.cache import cache; cache.clear()"
```

**Or delete cache files manually:**
Stop the backend/tests first. From `back\cred` in CMD (interactive terminal):
```cmd
for /d /r %d in (__pycache__) do @if exist "%d" rd /s /q "%d"
```

Python bytecode cleanup does not reset the database or blockchain.

### 3) Frontend

```cmd
cd /d "C:\Users\Sam Jr\Documents\GitHub\blockchain-academic-certificate-verification-sl\front\app-next"
npm run dev
```

**Clear Next.js cache and rebuild:**
Stop the frontend first. In CMD:
```cmd
cd /d "C:\Users\Sam Jr\Documents\GitHub\blockchain-academic-certificate-verification-sl\front\app-next"
if exist .next rmdir /s /q .next
if exist node_modules\.cache rmdir /s /q node_modules\.cache
npm run dev
```

**Hard refresh in browser:**
- Chrome/Edge: `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac)
- Firefox: `Ctrl + F5` (Windows) or `Cmd + Shift + R` (Mac)

### 4) Mobile app

```cmd
cd /d "C:\Users\Sam Jr\Documents\GitHub\blockchain-academic-certificate-verification-sl\mobile-app"
npx expo start
```

Press `a` in Expo for an Android emulator, or scan its QR code on your device.
For a physical phone, configure the mobile API URL with the backend computer's
LAN IP rather than `localhost`, and serve Django on `0.0.0.0:8000` with matching
allowed hosts. See [mobile setup](../mobile-app/SETUP.md).

**Clear Expo cache:**
```cmd
cd /d "C:\Users\Sam Jr\Documents\GitHub\blockchain-academic-certificate-verification-sl\mobile-app"
npx expo start -c
```

**Windows CMD: reset the mobile development cache**

Stop the existing Expo terminal with `Ctrl+C`. From any folder in CMD:

```cmd
cd /d "C:\Users\Sam Jr\Documents\GitHub\blockchain-academic-certificate-verification-sl\mobile-app"
npx expo start --clear
```

This rebuilds the Metro bundle cache. It does not clear saved login tokens,
onboarding completion, backend credentials, or Anvil state.

For a deeper reset of local Expo project settings, stop Expo first, then run
these commands from the `mobile-app` folder:

```cmd
if exist .expo rmdir /s /q .expo
if exist node_modules\.cache rmdir /s /q node_modules\.cache
npx expo start --clear
```

**Reset the student's session or device data**

- Use the app's Sign out action to remove its saved access and refresh tokens.
- For a fresh Android app setup, open Android Settings > Apps > Intelligent
  Academic Credentialing > Storage > Clear storage/data. This clears local login
  and onboarding state for the installed standalone app; it does not delete
  credentials from the backend.
- If testing in Expo Go, clearing Expo Go's storage affects all projects stored
  in Expo Go. Prefer signing out when only a fresh login is needed.
- For Expo web, clear site data for the mobile app's browser origin. Web login
  tokens and onboarding state are stored in localStorage.

Mobile cache or device resets do not undo student claims recorded in the
database. A fresh claiming test needs an unclaimed credential or a separate,
intentional backend data reset. Keep `chain/.local-chain/anvil-state.json` intact
when preserving the blockchain.

## Notes for GitHub

- Commit the template files.
- Do not commit any real `.env`, `.env.local`, or secret-bearing files.
- Keep deployment addresses and private credentials in your local environment only.

 
