# Credence

Credence is a monorepo for a blockchain-backed academic certificate issuance and verification platform.

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
   ```bash
   cp back/cred/.env.example back/cred/.env
   ```

2. Create the frontend local environment file:
   ```bash
   cp front/app-next/.env.example front/app-next/.env.local
   ```

3. For chain-local settings, create a local `chain/.env` if needed.

## Local development

### 1) Smart contracts

```bash
cd chain
npm install
npm run node
npm run deploy:local
```

### 2) Backend

```bash
cd back/cred
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

**Clear Django cache:**
```bash
cd back/cred
python manage.py shell
>>> from django.core.cache import cache
>>> cache.clear()
>>> exit()
```

**Or delete cache files manually:**
```bash
# Windows
del /s /q back\cred\__pycache__
for /d /r back\cred %d in (__pycache__) do @if exist "%d" rd /s /q "%d"

# Linux/Mac
find back/cred -type d -name __pycache__ -exec rm -rf {} +
```

### 3) Frontend

```bash
cd front/app-next
npm install
npm run dev
```

**Clear Next.js cache and rebuild:**
```bash
cd front/app-next

# Delete cache directories
rm -rf .next
rm -rf node_modules/.cache

# Windows
rmdir /s /q .next
rmdir /s /q node_modules\.cache

# Reinstall and restart
npm install
npm run dev
```

**Hard refresh in browser:**
- Chrome/Edge: `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac)
- Firefox: `Ctrl + F5` (Windows) or `Cmd + Shift + R` (Mac)

### 4) Mobile app

```bash
cd mobile-app
npm install
npx expo start
npm run android   # Android emulator
# npm run ios     # iOS (macOS only)
```

**Clear Expo cache:**
```bash
cd mobile-app
npx expo start -c
```

## Notes for GitHub

- Commit the template files.
- Do not commit any real `.env`, `.env.local`, or secret-bearing files.
- Keep deployment addresses and private credentials in your local environment only.

//////////////////////////////////////////////////////////////////
Do these review checks as I am adding Transcripts upload to the system:

 

1). Three flow: firstly registrar, upload both the transcript and certificate, upload the trasncript and then design the cert with credence, tie together as a single student record.

2). registrar can only add two more signers as officers, so therefore limit it to only two officers

3). Signature are config once electronically, except in extreme cases where officers are change after their term in offices

4). When the registrar choose any of the credential flow at the start, the approval comes with attestments from all the signers even though it might be an upload but hence they are using the system they nedd  to confirm that their signature are theirs
///////////////////////////////////////////////////////////////////////////