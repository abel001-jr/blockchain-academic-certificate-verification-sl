# Local reset - Windows CMD

Deletes local application data, uploaded files, and blockchain state.
Keep migrations, source code, `.env` files, and dependencies.
Run each step in order. Stop if a command fails or `cd` does not reach the stated folder.

## 1. Stop services

Press `Ctrl+C` in Django, Next.js, Expo, and Hardhat terminals.
Activate your Python environment.

## 2. Reset Django

```bat
cd /d "C:\Users\Sam Jr\Documents\GitHub\blockchain-academic-certificate-verification-sl\back\cred"
python manage.py shell -c "from django.conf import settings; d=settings.DATABASES['default']; print(d['ENGINE'], d['NAME'], d.get('HOST', ''))"
```

Confirm the printed database is the local database to erase. Then run:

```bat
python manage.py flush --noinput
python manage.py shell -c "from django.core.cache import caches; [caches[name].clear() for name in caches]"
python manage.py migrate
```

## 3. Delete saved files

Stay in `back\cred`:

```bat
if exist "media" rmdir /s /q "media"
if exist "staticfiles" rmdir /s /q "staticfiles"
if not exist "media" mkdir "media"
```

## 4. Clear frontend and mobile caches

```bat
cd /d "C:\Users\Sam Jr\Documents\GitHub\blockchain-academic-certificate-verification-sl\front\app-next"
if exist ".next" rmdir /s /q ".next"
if exist "out" rmdir /s /q "out"
if exist "node_modules\.cache" rmdir /s /q "node_modules\.cache"
```

```bat
cd /d "C:\Users\Sam Jr\Documents\GitHub\blockchain-academic-certificate-verification-sl\mobile-app"
if exist ".expo" rmdir /s /q ".expo"
if exist "dist" rmdir /s /q "dist"
if exist "web-build" rmdir /s /q "web-build"
```

## 5. Recompile and start Hardhat

The old Hardhat node must be stopped.

```bat
cd /d "C:\Users\Sam Jr\Documents\GitHub\blockchain-academic-certificate-verification-sl\chain"
if exist "ignition\deployments\chain-31337" rmdir /s /q "ignition\deployments\chain-31337"
npx hardhat clean
npx hardhat compile
npx hardhat test


```

Continue only if compilation and tests pass. Leave the node running.

## 6. Redeploy - new CMD terminal

```bat
cd /d "C:\Users\Sam Jr\Documents\GitHub\blockchain-academic-certificate-verification-sl\chain"
npm run deploy:local
type ignition\deployments\chain-31337\deployed_addresses.json
```

Copy the printed contract addresses into these files:

| File | Variables |
| --- | --- |
| `back\cred\.env` | `ISSUER_REGISTRY_ADDRESS`, `CERTIFICATE_REGISTRY_ADDRESS` |
| `front\app-next\.env.local` | `NEXT_PUBLIC_ISSUER_REGISTRY_ADDRESS`, `NEXT_PUBLIC_CERTIFICATE_REGISTRY_ADDRESS` |

Use RPC `http://127.0.0.1:8545` and backend `ETH_CHAIN_ID=31337`.
Skip role seeding for an empty start. Recreate institutions and officer authorisations in the app.

## 7. Clear remaining saved state

- Browser: Developer Tools > Application > Storage > Clear site data. Unregister service workers. Repeat for each localhost/127.0.0.1 origin used.
- MetaMask: clear activity/nonce data for the local network. Keep your wallet.
- Mobile: log out or clear app storage to remove saved tokens.
- Pinata: delete saved files manually.
- Delete downloaded credential PDFs/ZIPs separately.

This clears local state and application CID references. Public-chain history and copies held by other IPFS nodes remain outside this reset.

## 8. Start Django - backend CMD terminal

Activate your Python environment, then run:

```bat
cd /d "C:\Users\Sam Jr\Documents\GitHub\blockchain-academic-certificate-verification-sl\back\cred"
python manage.py createsuperuser
python manage.py runserver 0.0.0.0:8000
```

## 9. Start frontend - new CMD terminal

```bat
cd /d "C:\Users\Sam Jr\Documents\GitHub\blockchain-academic-certificate-verification-sl\front\app-next"
npm run dev
```

## 10. Start mobile - new CMD terminal, if needed

```bat
cd /d "C:\Users\Sam Jr\Documents\GitHub\blockchain-academic-certificate-verification-sl\mobile-app"
npm start -- --clear
```

For a phone, set the mobile API URL to your computer's LAN IP and add that IP to Django's `ALLOWED_HOSTS`.

Sign in with the new superuser and restart testing from institution setup.
