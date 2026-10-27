# Mobile verification and credential claiming

## Connect the app to your backend

For a physical phone, set `EXPO_PUBLIC_API_BASE` in the mobile `.env` to
`http://<your-PC-LAN-IP>:8000/api`. The phone and PC must be on the same network.
Start Django with `python manage.py runserver 0.0.0.0:8000` from `back/cred`.
Use the PC's LAN IP rather than localhost on a phone. Configure Django allowed
hosts for that IP. Allow the development connection through the local firewall.

Set `EXPO_PUBLIC_WEB_BASE` to the reachable Next.js origin for public verification
and CAPTCHA fallback. Restart Expo after changing environment variables.
Android emulators default to `http://10.0.2.2:8000/api`; Expo web and iOS
simulators default to `http://127.0.0.1:8000/api`.

Use an issued credential belonging to your test student and a fresh Registrar
invitation. Invitation tokens are single use and normally expire after 24 hours.
Use a development build for native scheme links and Google OAuth; Expo Go
does not represent the application's own OAuth scheme.

## Endpoint contract

| Action | Request | Feedback |
| --- | --- | --- |
| Claim pasted token/link | `POST /auth/student-invite/claim/`, `{token}` | Success toast and student account setup; expired/used links get recovery instructions. |
| Claim a custom deep link | `credence://student-invite?token=...` | Same claim endpoint and token rules. |
| Verify ID or QR | `GET /verify/<ID>/`, retaining `?code=...` | Persistent result card; transport and security failures get warning toasts. |
| Complete public CAPTCHA | Open `<WEB_BASE>/verify/<ID>`, retaining share code | Browser performs the security check; mobile does not bypass CAPTCHA. |
| Restore student profile | `GET /auth/me/` | Saved tokens are loaded securely. |
| Refresh a session | `POST /auth/refresh/`, `{refresh}` | Concurrent requests share one refresh. Invalid refresh signs out; offline refresh preserves tokens. |
| List credentials | `GET /my-certificates/?page=N` | All pages loaded; pull down or retry after a connection error. |
| Save profile | `PATCH /auth/me/` | Success/error toast. |
| Link Google | `POST /auth/google/link/`, `{id_token}` | Success/error toast; requires native OAuth configuration. |
| Download own documents | `GET /my-certificates/<ID>/documents/` | Authenticated ZIP fetch, then native sharing/save; errors remain dismissible. |

## Device checklist

- Claim a fresh invitation while signed out. Confirm success opens account setup,
  then continue to the credential list and find the expected issued credential.
- Save profile details, link Google, sign out, and sign in with that linked account.
- Claim through a pasted full URL, a raw token, and a custom scheme link from a
  cold launch. Reopening a consumed invitation should not claim it again.
- Try a malformed, expired, and already-used invitation. Do not automatically retry
  claims after a timeout: the server may have consumed the token before the response
  was lost. Follow the toast's Google sign-in or new-invitation recovery guidance.
- Verify an issued, revoked, pending, and nonexistent ID. Only an explicit backend
  `not_found` result should say the credential does not exist.
- Test the camera and a QR photo. Deny camera/photos permissions and confirm manual
  ID entry still works. Try an unrelated QR URL; it must not be submitted as an ID.
- Test a verification link with a share code. Confirm the code is retained in the
  API call and browser fallback.
- With CAPTCHA enabled, signed-out verification should offer the website. Signed-in
  verification uses the valid session. CAPTCHA and rate limits must never appear as
  an invalid certificate.
- Stop the API or disconnect the phone: expect a connection error, not a failed
  authenticity verdict. Restore connectivity and retry.
- Test document download with storage available and unavailable. Gateway failures
  must not create or share a fake document archive.
- Confirm toasts remain visible through claim navigation, can be dismissed, and do
  not prevent using the screen. Success/info toasts expire after six seconds.

Verification currently reports the backend registry status; it does not independently
query Ethereum or prove the integrity of a file selected on the phone. Public
verification intentionally exposes fewer fields than the student's own records.

## Automated checks

From `mobile-app`, run `node scripts/flow-check.js`. From `back/cred`, run
`python manage.py test accounts.test_student_claim_flow accounts.test_student_google_link --noinput`.
For Android bundle validation, run `node node_modules/expo/bin/cli export --platform android --output-dir .expo/mobile-review --max-workers 1`.
Bundle validation does not replace native camera, sharing, deep-link, or OAuth testing.
