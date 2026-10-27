# Normal startup — Windows CMD

Use after completing [clean start](CLEAN_START_CMD.md) once. Dependencies,
Python environment, `.env` files, and deployed contracts must already be set up.
Keep the database, uploads, and `chain\.local-chain` folder. No reset or deployment is needed.

Open four **Command Prompt (CMD)** terminals. Run these steps in order and leave
each service running. Stop if a command fails.

## 1. Terminal 1 — blockchain

```cmd
cd /d "C:\Users\Sam Jr\Documents\GitHub\blockchain-academic-certificate-verification-sl\chain"
npm run node:persistent
```

Wait for `Listening on 127.0.0.1:8545` before continuing.
If port 8545 is busy, check the existing node before starting another.

## 2. Terminal 2 — backend

Activate your existing Python environment, then run:

```cmd
cd /d "C:\Users\Sam Jr\Documents\GitHub\blockchain-academic-certificate-verification-sl\back\cred"
python manage.py runserver
```

Wait for `http://127.0.0.1:8000/`. If an update added migrations, stop the backend,
run `python manage.py migrate` here, then start it again.

## 3. Terminal 3 — storage worker

Activate the same Python environment in this terminal, then run:

```cmd
cd /d "C:\Users\Sam Jr\Documents\GitHub\blockchain-academic-certificate-verification-sl\back\cred"
python manage.py sync_pinata_usage
```

## 4. Terminal 4 — website

```cmd
cd /d "C:\Users\Sam Jr\Documents\GitHub\blockchain-academic-certificate-verification-sl\front\app-next"
npm run dev
```

Wait for the ready message. Open `http://localhost:3000` and sign in with your
existing account. For wallet actions, select the local network in MetaMask:
RPC `http://127.0.0.1:8545`, chain ID `31337`.

## 5. Optional terminal 5 — mobile

```cmd
cd /d "C:\Users\Sam Jr\Documents\GitHub\blockchain-academic-certificate-verification-sl\mobile-app"
npx expo start
```

Press `a` for an Android emulator, or scan the QR code with Expo Go.
For a physical phone, use your computer's LAN IP in mobile `.env`:
`EXPO_PUBLIC_API_BASE=http://YOUR_LAN_IP:8000/api`.
Add that IP to backend `ALLOWED_HOSTS`, then restart the backend in terminal 2 with:

```cmd
python manage.py runserver 0.0.0.0:8000
```

## Stop services

Stop the frontend, mobile, worker, and backend with `Ctrl+C` in their terminals.
Wait at least five seconds after the last confirmed blockchain transaction,
then press `Ctrl+C` in the chain terminal to preserve its checkpoint.
