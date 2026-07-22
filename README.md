# Credence

Credence is a monorepo for a blockchain-backed academic certificate issuance and verification platform.

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

### 3) Frontend

```bash
cd front/app-next
npm install
npm run dev
```

## Notes for GitHub

- Commit the template files.
- Do not commit any real `.env`, `.env.local`, or secret-bearing files.
- Keep deployment addresses and private credentials in your local environment only.
