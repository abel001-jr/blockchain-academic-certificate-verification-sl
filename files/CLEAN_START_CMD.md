# Clean start — Windows CMD

Full reset: erases database records, uploads, and local blockchain history.
For daily use, follow [normal startup](NORMAL_START_CMD.md).

1. Stop all running services with `Ctrl+C`.
2. Open **Command Prompt (CMD)** terminals, not PowerShell.
3. Activate your existing Python environment in each backend/worker terminal.
4. Run the numbered steps below in order. Stop if a command fails.

## 1. Reset terminal — clear database and uploads

```cmd
cd /d "C:\Users\Sam Jr\Documents\GitHub\blockchain-academic-certificate-verification-sl\back\cred"
python manage.py shell -c "from django.conf import settings; d=settings.DATABASES['default']; print(d['ENGINE'], d['NAME'], d.get('HOST', ''))"
```

Check that the printed database is your development database. Then run:

```cmd
python manage.py migrate
python manage.py flush
```

Enter `yes` at the flush prompt. Then run:

```cmd
python manage.py shell -c "from django.core.cache import caches; [caches[name].clear() for name in caches]"
if exist "media" rmdir /s /q "media"
mkdir "media"
python manage.py createsuperuser
```

Follow the prompts to create your administrator. Keep migrations and `.env` files.

## 2. Chain terminal — erase old chain and start Anvil

```cmd
cd /d "C:\Users\Sam Jr\Documents\GitHub\blockchain-academic-certificate-verification-sl\chain"
if exist ".local-chain" rmdir /s /q ".local-chain"
if exist "ignition\deployments\anvil-persistent-31337" rmdir /s /q "ignition\deployments\anvil-persistent-31337"
npm run node:persistent
```

Leave running. Wait for `Listening on 127.0.0.1:8545`.

## 3. Deployment terminal — deploy new contracts

```cmd
cd /d "C:\Users\Sam Jr\Documents\GitHub\blockchain-academic-certificate-verification-sl\chain"
npm run deploy:anvil
type "ignition\deployments\anvil-persistent-31337\deployed_addresses.json"
```

## 4. Reset terminal — update contract addresses

```cmd
cd /d "C:\Users\Sam Jr\Documents\GitHub\blockchain-academic-certificate-verification-sl"
notepad "back\cred\.env"
notepad "front\app-next\.env.local"
```

Match `IssuerRegistry` and `CertificateRegistry` in the printed JSON to the
corresponding settings below. Replace their values, save both files, and close Notepad.

| File | Settings |
| --- | --- |
| Backend `.env` | `ISSUER_REGISTRY_ADDRESS`, `CERTIFICATE_REGISTRY_ADDRESS`, `ETH_RPC_URL=http://127.0.0.1:8545`, `ETH_CHAIN_ID=31337` |
| Frontend `.env.local` | `NEXT_PUBLIC_ISSUER_REGISTRY_ADDRESS`, `NEXT_PUBLIC_CERTIFICATE_REGISTRY_ADDRESS`, `NEXT_PUBLIC_ETH_RPC_URL=http://127.0.0.1:8545`, `NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000/api` |

## 5. Pinata dashboard — clear remote storage

Open Pinata, select this project's old files, and delete/unpin them. Keep unrelated files.

## 6. Backend terminal — start API

```cmd
cd /d "C:\Users\Sam Jr\Documents\GitHub\blockchain-academic-certificate-verification-sl\back\cred"
python manage.py check
python manage.py runserver
```

Leave running.

## 7. Storage worker terminal — synchronize Pinata usage

```cmd
cd /d "C:\Users\Sam Jr\Documents\GitHub\blockchain-academic-certificate-verification-sl\back\cred"
python manage.py sync_pinata_usage
```

Leave running.

## 8. Frontend terminal — clear cache and start website

```cmd
cd /d "C:\Users\Sam Jr\Documents\GitHub\blockchain-academic-certificate-verification-sl\front\app-next"
if exist ".next" rmdir /s /q ".next"
if exist "node_modules\.cache" rmdir /s /q "node_modules\.cache"
npm run dev
```

Leave running. Open `http://localhost:3000`.

## 9. Browser — initialize fresh app

1. Clear old localhost site data and reload.
2. Clear MetaMask activity/nonce data for the local network; use chain ID `31337`.
3. Sign in with the new administrator and verify Settings > Blockchain.
4. Recreate institutions/users, register institutions, and authorize officer wallets.

## 10. Optional mobile terminal — start mobile app

1. Clear the mobile app's saved login/storage on the device.
2. Follow [normal startup, step 5](NORMAL_START_CMD.md#5-optional-terminal-5--mobile), using `npx expo start --clear` for this first launch.

Next time, use [normal startup](NORMAL_START_CMD.md).
