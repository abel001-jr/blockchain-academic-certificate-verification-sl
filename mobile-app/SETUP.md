# Mobile setup

This is an Expo SDK 58 app with React Navigation. Install Expo modules with
`npx.cmd expo install` so their versions match the SDK.

## After upgrading from SDK 57

SDK 58 uses React Native 0.88. Existing SDK 57 development builds must be rebuilt;
a Metro reload alone does not update their native modules.

For a local Android build, run `npx.cmd expo run:android` with the Android SDK
configured. Alternatively, create a new development APK with
`npx.cmd eas-cli build --platform android --profile development`, install it,
then run `npm.cmd run start:dev-client -- --clear`.

## Local development on Windows

1. Copy `.env.example` to `.env` and configure the API address for your target.
2. Run `npm.cmd install` and `npx.cmd expo install --check`.
3. Run `npm.cmd start -- --clear`.

Use `.cmd` commands if PowerShell blocks npm.ps1; no execution-policy change is needed.

| Target | API address |
| --- | --- |
| Android Studio emulator | `http://10.0.2.2:8000/api` (default) |
| iOS simulator on macOS | `http://127.0.0.1:8000/api` (default) |
| Physical phone | Set `EXPO_PUBLIC_API_BASE=http://<computer-LAN-IP>:8000/api` |
| Production | Set `EXPO_PUBLIC_API_BASE` to the deployed HTTPS API |

For a phone, run Django with `python manage.py runserver 0.0.0.0:8000`, add the
computer's LAN IP to backend `ALLOWED_HOSTS`, and permit local development traffic
through the firewall. The phone and computer must be on a network that allows
communication. An Expo tunnel exposes Metro, not the Django API.

For Expo web, add the actual browser origin (normally `http://localhost:8081`)
to backend `CORS_ALLOWED_ORIGINS`. Native requests do not use browser CORS.

## Google authentication and links

### Current Google project

The Web OAuth client from `APIs/CREDENCE WEB.json` is configured in the local
backend and student app environments and the EAS development profile. The JSON
contains a client secret and is ignored by Git. This ID-token sign-in flow uses
the client ID only; do not copy the secret into any `EXPO_PUBLIC_*` variable.

For student sign-in in the Expo browser app, edit this Web client in Google
Cloud Console → Google Auth Platform → Clients:

- Add `http://localhost:8081` to Authorized JavaScript origins.
- Add `http://localhost:8081` to Authorized redirect URIs (the Expo browser
  callback returns to the student app, not Django's `/accounts/google/login/callback/`).
- Keep `http://localhost:3000` if using that origin. If Expo uses a different
  port or hostname, authorize that exact origin and redirect URI as well.
- If the consent screen is in Testing, include the intended Google accounts
  under Audience → Test users.

The supplied export authorizes only the 3000 origin and Django callback;
changing local files cannot update Google's registered URLs. Restart Django
and run `npx.cmd expo start --web --clear` after changing the environment.
Complete one Google login and account-link test in the browser after updating
the Google Console URLs.

Old-project Android/iOS client configuration has been cleared. Create native
OAuth clients in the new project before using native Google sign-in; put their
IDs in the platform environment variables and backend `GOOGLE_CLIENT_IDS`.
For EAS, also set these variables in its development environment before building.

### Android development build (Windows CMD)

`expo-dev-client` and the `development` profile in `eas.json` are prepared.
Run these yourself from `mobile-app`:

```cmd
npx eas-cli login
npx eas-cli init
npx eas-cli credentials -p android
```

Select the development profile and generate a keystore if none exists. Retain
this keystore for subsequent builds. Copy its SHA-1 fingerprint into a Google
Cloud Android OAuth client with package name `com.credence.app`.
Set the resulting Android client ID in `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`
in `.env`. The web client ID is a separate value; never add a client secret.
Check the backend's accepted Google token audiences as part of setup.

Before building, make the necessary `EXPO_PUBLIC_*` values available in the EAS
development environment (local ignored `.env` files may not be uploaded).
Use the computer's reachable LAN IP for a physical phone's development API URL.
Then run:

```cmd
npx eas-cli build --platform android --profile development
```

Install the resulting APK on the phone, then start Metro:

```cmd
npm run start:dev-client
```

Open Credence rather than Expo Go. Building does not publish to Google Play.
Google sign-in still requires a real-device test of client IDs, token audience,
and the provider-approved native redirect; an APK alone does not verify OAuth.

Configure the public Google client IDs in `.env` for the platforms you use.
Register Android package `com.credence.app` with the signing certificate fingerprint,
and iOS bundle ID `com.credence.app`. Confirm provider-approved redirect URIs for
each platform; client IDs alone do not complete the OAuth setup. The backend
must accept the intended token audience; its current `GOOGLE_CLIENT_ID` setting
can be supplemented with comma-separated `GOOGLE_CLIENT_IDS` for the Android and iOS clients.

Use a development build for native OAuth/deep-link testing; Expo Go does not
represent the app's own registered native scheme. Native builds require Android
SDK/JDK tooling locally or a configured cloud build. Local iOS builds require macOS.
No EAS project or cloud deployment has been created by this setup review.

Camera, image picker, secure storage, and browser plugins are configured in
`app.json`. Rebuild a native app after plugin changes; restarting Metro alone
does not update native permissions. The `credence://` scheme supports custom links;
HTTPS universal/app links require separate domain association configuration.

## Known checks still needed

- Test login, invite claim, QR scanning, document download/sharing, and logout on a device.
- Native tokens use SecureStore; Expo web tokens use browser localStorage.
- `WalletSignInScreen.js` is unused and references removed auth exports and `ethers`.
  Do not install wallet libraries unless restoring that feature intentionally.
- Uploaded QR images use jsQR on web and Expo Camera image scanning on native devices.
- Verify production API configuration and OAuth redirects before release.

## Validation

```powershell
npx.cmd expo install --check
npx.cmd expo config --type public
npx.cmd expo export --platform android --output-dir .expo/check-android
```

Export validates bundling, not native device behaviour. See Expo's library guidance:
https://docs.expo.dev/workflow/using-libraries/

## Claim and verification regression checks

### Button and link routing

All API paths below are relative to `EXPO_PUBLIC_API_BASE` (including `/api`).

| Action | Endpoint or destination |
| --- | --- |
| Claim my certificate / invitation link | `POST /auth/student-invite/claim/` with `{ token }` |
| Continue with Google | `POST /auth/google/` with `{ id_token }` |
| Restore profile | `GET /auth/me/` |
| My certificates / refresh / retry | `GET /my-certificates/` |
| Verify / camera scan / QR image / Verify this credential | `GET /verify/<certificate_id>/`, preserving `?code=` |
| Download | `GET /my-certificates/<certificate_id>/documents/` |
| Renew session | `POST /auth/refresh/` with `{ refresh }` |
| Share / Link | Share the public verification URL from `EXPO_PUBLIC_WEB_BASE` |
| Web verification fallback | Open the public website for CAPTCHA-protected verification |

`Verify this credential` opens the native Verify screen and performs a fresh API
request. Links shaped as `credence://verify/<certificate_id>?code=...` also open
that screen. Verification uses the saved session when available and remains
accessible without login. The configured public website origin is recognized
by the app's link parser; OS-level HTTPS app links still require domain association.

Run from the repository root:

```powershell
node mobile-app/scripts/flow-check.js
python back/cred/manage.py test accounts.test_student_claim_flow --noinput
```

Set `EXPO_PUBLIC_WEB_BASE` to the public web origin used for shared verification
links. It defaults to `https://credence.edu.sl`. The web app now provides
`/student-invite?token=...` with an explicit Open in Credence action and a copy
fallback. Opening this page does not consume an invitation.

On a development build, check a fresh invitation while signed out, while signed
in, and after a cold launch. Confirm the dashboard shows the claimed credential,
then test document download and native sharing. Repeat with expired and used
links, an offline API, a denied camera permission, a QR photo, and a QR link
containing a share code. Access tokens refresh automatically; rejected refresh
tokens automatically return the app to signed-out navigation with a toast.
Temporary connection failures and refresh rate limits preserve the saved session.

See [the mobile claim and verification checklist](TESTING_CLAIM_AND_VERIFY.md)
for endpoint contracts, expected toast feedback, and device test scenarios.

Verification reports the registry outcome. The mobile app does not independently
query Ethereum or recompute document hashes. When the backend requires CAPTCHA,
public mobile verification currently reports the requirement as unavailable;
use the web verification flow for CAPTCHA-protected checks.

## Student profile and Google linking

After invitation claiming, students without a linked Google identity open account
setup. They can save their first name, last name and phone number with
`PATCH /api/auth/me/`, then connect Google with authenticated
`POST /api/auth/google/link/` (`{ id_token }`). They can continue to credentials
and reopen setup from Profile at any time. An unlinked-account reminder remains
visible on the credential dashboard.

The verified Google account may use a personal email. The institution account
email and credential ownership stay unchanged. Google subject is unique and is
used for future sign-in; linking another student's Google identity or replacing
an existing link is rejected. Link status, linked email and linking time are
read-only profile fields. No unlink action is provided, avoiding accidental
loss of the student's sign-in method.

Run `python manage.py migrate` from `back/cred` before starting the updated API.
Test with `python manage.py test accounts.test_student_google_link accounts.test_student_claim_flow`.

Google sign-in/linking needs a development build on native devices; Expo Go
can preview profile setup but cannot complete OAuth. Configure public client IDs
in the mobile `.env` and the allowed audiences in the backend, then register the
redirect URI for each target with Google. The installed Expo Google provider uses
its default native `<applicationId>:/oauthredirect` URI and native code exchange.
Google credentials and redirect registration must be supplied before a live
Google-account linking check can pass.
