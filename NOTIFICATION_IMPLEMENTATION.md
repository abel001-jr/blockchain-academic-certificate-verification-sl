# Notifications — Current Implementation

**Update:** The system inbox and server Web Push pipeline are now implemented. See [notification setup and verification](back/cred/notifications/README.md) for the current configuration, event routing and worker instructions. The notes below describe the earlier browser-only implementation and its email/WhatsApp channels.

**Status: rewritten.** The previous version of this file was titled "Browser Push
Notifications — Implementation Summary" and claimed the feature was "fully integrated"
and "follows best practices". Neither is accurate. There is no push infrastructure in this
project: no service worker, no `PushManager`, no web-push server, anywhere in
`front/app-next/src`. What exists is the in-page browser `Notification` API, WhatsApp via
Twilio, and SMTP email used for one thing only.

This document now records what the system actually sends, and what it does not.

For the ordered backlog see [`REMAINING_WORK.md`](REMAINING_WORK.md).

---

## 1. The channels that exist

| Channel | Transport | Reach | Live today |
|---|---|---|---|
| **Browser notification** | In-page `new Notification(...)` via the Web Notifications API | The browser tab the user is already looking at, only while it is open | Yes — 3 call sites, all confirmed against their signatures |
| **Officer email** | SMTP (Brevo) | The VC or Dean whose turn it is, anywhere, including when they are not signed in | Yes — every hand-off in the credential lifecycle |
| **WhatsApp** | Twilio, `notifications/whatsapp.py` | The student, anywhere, after issuance or a consent request | Yes — issuance invites and consent requests |
| **Email** | SMTP (Brevo), `accounts/email_utils.py` | Officers, by inbox | Officer invite temporary passwords, and attestation notices (§4) |

**Why officer notices are email and not browser notifications.** The `Notification` API
renders in the browser of whoever is looking at the page. The officer who has to act next
is a different person, in a different browser, who may not be signed in at all — so
pointing the existing approval notification at them is not possible, however it is aimed.
The "a state changed and somebody must act" signal is therefore split by reach: in-page
to the actor, email to the next actor. They are the same need; only one of them can cross
a user boundary. See §3.4.

WhatsApp was considered and rejected for officers: `User.phone_number` exists, but neither
the officer invite form nor the officer edit form collects it, so in practice every
officer's number is blank and the send would silently no-op. Email is the one channel an
officer is guaranteed to have, because it is how they received their login.

---

## 2. Browser notifications

### 2.1 The library — `front/app-next/src/lib/notifications.js`

- `requestNotificationPermission()` — requests permission, returns `'granted'`,
  `'denied'` or `'default'`, and returns `'denied'` during SSR.
- `canShowNotifications()` — supported **and** granted.
- `showNotification(title, options)` — the single `new Notification(...)` call site.
  Defaults `icon`/`badge` to `/logo.png`, tags on `notification-${Date.now()}` unless a
  tag is given, sets `vibrate: [200, 100, 200]`, focuses the window on click, and
  auto-closes after **10 seconds** unless `requireInteraction` is set. Returns `null` —
  never throws — when unsupported, unpermitted, or on a construction failure.
- `NotificationTypes` — `SUCCESS` / `INFO` / `WARNING` / `ERROR` presets. Only `ERROR`
  sets `requireInteraction: true`.
- `notifySuccess` / `notifyInfo` / `notifyWarning` / `notifyError` — thin wrappers.
- `roleLabel(role)` — `"chancellor"` → `"Dean"`, `"vc"` → `"VC"`, matching what every
  other user-facing surface shows. Exported because the raw role key is what the API
  returns and `"chancellor"` must never reach a person's inbox.
- `notifyApprovalRecorded(certificateId, studentName, role)` — confirms to the *actor*
  that their own transaction was recorded, and that the next officer has been told. Tag
  `approval-${id}`, navigates to `/dashboard/approvals`. This used to be
  `notifyCertificateApproval` and read "is awaiting your approval", fired at the officer
  who had just approved it — see §3.4.
- `notifyCertificateIssued(certificateId, studentName)` — `:200`, tag `issued-${id}`,
  navigates to `/dashboard/certificates`. A confirmation to the Registrar who anchored
  it, which is accurate.
- `notifyOfficerAuthorized(officerName, role)` — the officer's full name and their role
  label.
- `saveNotificationPreference(enabled)` / `getNotificationPreference()` — persist to
  `localStorage` under the key **`notifications_enabled`**.
- `initializeNotifications()` — does not prompt; it only records an existing
  decision and returns `'default'` when the user has not yet chosen.

The "actions" feature claimed in the previous version (`Customized icons, badges, and
actions`) is not present: the `Notification` constructor is called with no `actions`, and
there is no `ServiceWorkerRegistration` and no `notificationclick` handler, so the OS
action buttons the old document described would not function.

### 2.2 The provider — `front/app-next/src/components/NotificationProvider.js`

Mounted in `app/layout.js:41`, wrapping the whole tree, exposing
`{ permissionStatus, canNotify, requestPermission }` through `useNotifications()`.

On mount it reads `Notification.permission` and, if it is `'default'` and the user has not
dismissed before, slides the banner up after a 2-second delay. Dismissal persists to
`localStorage` under `notification_banner_dismissed` and is permanent. Styling matches
the brand: `#08283F` → `#0D3C5C` gradient, `#B98A28` accent, `animate-slide-up` from
`globals.css`. When the API is missing entirely it sets `permissionStatus` to
`'unsupported'`.

Note there are two localStorage keys, not one: `notifications_enabled` (preference) and
`notification_banner_dismissed` (banner). The previous document listed the preference key
as `notification_preference`, which is wrong.

### 2.3 The three call sites

All three were passing arguments in a different order from the function signatures. Fixed;
the table records what each one actually rendered, because none of it was caught by a test
and it would have been caught only by watching a browser.

| Call site | Was passing | Rendered | Now |
|---|---|---|---|
| `approvals/page.js:80` | `(studentName, certificateId, approver)` | `"CR-2026-CUSL-0042 - Jane Doe is awaiting your approval"` | `notifyApprovalRecorded(certificateId, studentName, role)` |
| `certificates/[id]/page.js:189` | `(studentName, certificate_id)` | `"Certificate for CR-2026-CUSL-0042 (Jane Doe) has been issued"` | `(certificate_id, student_name)` |
| `officers/page.js:154` | `(first_name, last_name, role)` against a 1-arg signature | `"Jane has been authorized on-chain"` — surname and role dropped | `(fullName, role)` |

The approval one had a second defect beyond ordering, which is the interesting one. It
fired in `handleApprove`, immediately after the **approver's own** transaction confirmed,
so it told an officer that a certificate "is awaiting your approval" at the moment they
had just approved it, and navigated them back to the queue they had just left an item in.

Redirecting it was considered and is not possible: a browser notification is bound to the
session that raised it, and the next officer is a different user. So the function was
repurposed rather than duplicated — it is now `notifyApprovalRecorded`, confirming to the
actor that their transaction was accepted, and the cross-user half of the problem is
solved server-side in §4. That is the honest resolution of "these are really the same
mechanism": one need, two mechanisms, split by reach.

A fourth defect was in `certificates/[id]/page.js:17`, which imported
`notifyCertificateApproval` without ever calling it. Removed.

---

## 3. WhatsApp — issuance invites and consent requests

`notifications/whatsapp.py` is a thin, defensive Twilio wrapper: it no-ops and logs when
unconfigured (`whatsapp_is_configured()`), rejects non-E..164 numbers, prefixes both
ends with `whatsapp:`, masks the number in logs, and returns `False` rather than raising
on failure. Config lives at `cred/settings.py:216-224`, defaulting to the Twilio sandbox
sender `whatsapp:+14155238886`.

### 3.1 Issuance invite — `certify/views.py:110` `notify_student_issued(cert, force=False)`

This is the **only** call site that creates a `StudentInviteToken`, so it is the single
source of both the token and the notification. The flow:

1. Returns early if an unexpired, unused token already exists — unless `force=True`.
2. Creates a `StudentInviteToken` with a **24-hour** TTL from the single source
   `STUDENT_INVITE_TTL_HOURS` (`cred/settings.py:227`).
3. Sends the WhatsApp claim link and records `whatsapp_sent` on the token.
4. Returns `invite_created` and `invite_expires_at`.

Because it returns early without re-sending, a retried finalize cannot spam the student
with a second link. The raw token exists only at creation, so on the early-return path the
Registrar is deliberately *not* handed a fresh `claim_url` — a new link would invalidate
the one the student already holds.

Rotation is the explicit path: `CertificateResendInviteView` (`views.py:1231`) passes
`force=True`. That is the "student missed it / link did not arrive / window expired" case,
and it is now the only way a live link is replaced.

`certify/tests.py` `StudentInviteTokenTests` (13 tests) covers the TTL, the
no-replacement guarantee, and that keeping an active link does not re-send WhatsApp.

### 3.2 Consent requests — `verification/consent_views.py:81`

A separate `_notify_student` sends a WhatsApp message when a verification consent request
is raised, and sets `ConsentRequest.whatsapp_sent`. Skipped and logged when the student
has no phone number on file.

### 3.3 Graduate delivery

A claimed student gets both documents from
`GET /api/my-certificates/<certificate_id>/documents/` (`certify/student_document_views.py`),
which returns a zip, is owner-scoped, requires `ISSUED`, and re-verifies both hashes
against the anchored values. The mobile app writes it to cache and opens the native share
sheet (`mobile-app/src/services/certificates.js`,
`mobile-app/src/screens/CertificateDetailScreen.js`).

**No WhatsApp or email announces that the claim succeeded or that documents are ready.**
The invite tells the student a link exists; nothing follows up.

---

## 4. Email — officer invites and attestation notices

`accounts/email_utils.py` sends two kinds of message.

### 4.1 Officer invite — `send_officer_temp_password`

The temporary login password and MetaMask setup instructions for a newly invited VC or Dean.

- Gated on `email_is_configured()` — `EMAIL_ENABLED` plus both SMTP credentials — so it is
  inert unless configured, and it never raises into the request path.
- `_from_address()` warns specifically when `DEFAULT_FROM_EMAIL` is an
  `@smtp-brevo.com` login, because Brevo accepts SMTP from it and then silently drops
  delivery. That is a real, hard-to-debug failure mode and the warning is the mitigation.
- `should_return_temp_password()` decides whether the API response also carries the
  one-time password, so a demo with no SMTP still works.

`EMAIL_HOST` defaults to `smtp-relay.brevo.com` on port 587 with TLS.

### 4.2 Attestation notices — `send_officer_attestation_notice`

Tells the officer whose turn it is that a credential is waiting on them. This is the
feature that makes the pipeline self-propelling instead of poll-based.

- `certify/attestation_notices.py` `notify_officer_pending_attestation(institution=,
  role=, credential_id=, credential_kind=, student_name=, detail=)` resolves the seat and
  sends. It is aimed at a **role**, never at a person, which is what stops a notice
  landing on the officer who just acted. A role that cannot hold an officer seat raises
  `ValueError`, so a notice to a student or registrar is a loud bug rather than a silent
  one.
- The subject carries the credential ID, not just the kind, because an officer with a
  queue has several of these and has to tell them apart.
- The role label is mapped for humans: `CHANCELLOR` is sent as **Dean**, matching every
  other user-facing surface. Nobody should read "chancellor" in their inbox.
- It skips officers with no email on file, skips deactivated officers, and treats "this
  institution has no officer yet" as normal rather than an error — half-built
  institutions are the common case during rollout.
- **A notice can never block a credential.** The transport error is caught, a
  backstop catches anything the transport raises, and the endpoint continues. An
  undelivered notice is an inconvenience; a credential that cannot be approved because
  SMTP is down is an outage. Both are covered by tests.

Wired at every hand-off:

| When | Notifies | Where |
|---|---|---|
| Registrar submits a credential on-chain | VC | `certify/views.py` `CertificateConfirmChainView` |
| VC approval is recorded | Dean | `certify/views.py` `CertificateConfirmVCView` |

The transcript hooks that used to be listed here were part of a standalone transcript
approval chain that has since been deleted; a transcript now goes through the same
`confirm-chain` / `confirm-vc` hand-offs as the certificate it belongs to.

**Not** wired at `CertificateUploadAndAnchorView`. The credential is not on-chain yet at
that point and `confirm-vc` refuses without a `tx_hash`, so a notice there would page an
officer who cannot act. The upload flow reaches the VC through `confirm-chain` like every
other path.

**Still no email for issuance, expiry or revocation to the student.** Those go over
WhatsApp, or nowhere.

---

## 5. What does not exist

Each of these was listed in the previous document as either implemented or as a future
enhancement. Status as of now:

| Item | Status |
|---|---|
| Web push server / service worker / `PushManager` | **Does not exist.** Needs a push service (FCM/VAPID) and a server endpoint; nothing in the repo is close. |
| Notification action buttons | **Does not exist**, and would not work without a service worker. |
| Notification history / in-app feed | **Does not exist.** `audit` exists for the chain and document actions, but nothing for user-facing notifications. |
| Per-event-type user preferences | **Does not exist.** There is a single boolean (`notifications_enabled`) that no UI writes and no notification reads. |
| Custom sounds per event type | **Does not exist.** `silent: false` for everything. |
| Email fallback for a *blocked browser* notification | **Not applicable and not planned.** The browser notification is a nicety on a page the user is already looking at; the officer notice that matters is email regardless (§1). |
| Notifying officers that work is queued | **Exists** (§4.2), as email. |
| Email for issuance, expiry, revocation to the student | **Does not exist.** WhatsApp covers issuance; nothing covers expiry or revocation. |

---

## 6. Outstanding work

Items 1 and 2 are now done. The remainder:

1. **Stop calling the browser notifications "push"** in code, UI and documentation. The
   name is what makes the gap look closed when it is not.
2. **Decide whether to build real push or drop it.** A push server is a new external
   dependency (VAPID keys, a push service, a subscription store) and is not a small
   increment. The current in-page approach is defensible if documented as such.
3. **Verify in a browser.** The browser-notification path — banner, permission prompt,
   click-to-focus, auto-close — is still untested, and the §2.3 argument bugs are exactly
   what that would have caught. The *server-side* officer notice is covered by 16 tests,
   but no test proves an officer receives and can act on one in a real inbox.
4. **Confirm SMTP deliverability** in a configured environment. `email_is_configured()`
   returning `True` means credentials are present, not that mail arrives. Everything in
   §4.2 is written to degrade quietly, so a silent delivery failure will not announce
   itself in the logs unless someone reads them.
5. **Notify the Registrar after Dean approval.** The chain stops at the Dean: once the
   Chancellor approves, the credential is waiting for the Registrar to finalise, and
   nothing says so. The same helper would cover it — it is a role, and the Registrar's
   seat already exists. Left undone deliberately, because the request was specifically
   about the VC and Dean.
6. **Decide the fate of the `notifications_enabled` preference** (§2.1). It is read by
   nothing and written by nothing.

---

## 7. Superseded claims from the previous version

| Previous claim | Reality |
|---|---|
| "Browser native push notifications have been fully integrated" | No push infrastructure exists (§5). Only the in-page `Notification` API. |
| "The implementation follows best practices" | Overstated, and demonstrably so: all three call sites passed arguments in the wrong order and one fired at the wrong actor (§2.3). Both are fixed. |
| "User preference: `localStorage.notification_preference`" | The key is `notifications_enabled`. |
| "Pins transcript to IPFS when provided for full_upload flow" | Superseded by encrypt-before-pin; the blob pinned is now ciphertext (`views.py:993`). |
| Response returns `ipfs_cid_transcript` / `ipfs_url_transcript` | Removed. CIDs are off-chain only, and absent from public payloads (`REMAINING_WORK.md` item 1). |
| "Customized icons, badges, and actions" | Icons and badges yes; actions no (§2.1). |
| 19-item testing checklist, unticked | Still unticked for the browser path (§6.3). The server-side officer notice added in §4.2 is covered by 16 tests in `AttestationNoticeTests`. |
| "Migration required before testing" | Current head is `0013_documentreview`; see `REMAINING_WORK.md`. |
