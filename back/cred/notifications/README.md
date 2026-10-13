# System and browser push notifications

The header bell opens the authenticated user's saved inbox. It supports unread counts, marking one or all messages read, and older-message pagination. Settings → Notifications controls browser push and offers a test message. Inbox messages are always enabled; push is opt-in and requires HTTPS or localhost plus browser permission.

Credential submission notifies the registrar and Vice Chancellor. VC approval notifies the registrar and Chancellor. Chancellor approval notifies the registrar to finalize. Issuance and revocation notify the registrar, institution administrator and matching student. The actor also receives the event. Officer wallet authorization changes notify the affected account. All recipient queries are scoped to the credential's institution. Existing email and WhatsApp delivery remain separate.

## Setup

From `back/cred`:

```powershell
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py configure_push
python manage.py dispatch_notifications --watch
```

`configure_push` writes the VAPID key pair and contact to the ignored `.env`, using the configured sender email or `--contact admin@example.edu`. It preserves existing keys: rotating keys breaks subscriptions. Restart the API after configuring `.env`. Run one persistent push worker alongside the API in deployment, with supervisor restart enabled. A scheduler can alternatively run `dispatch_notifications` every minute.

The push outbox is stored in the database and claimed with a recoverable five-minute lease. Transient failures retry up to five attempts with exponential delay; successful devices are skipped on retries. Gone/expired subscriptions (HTTP 404/410) are removed. No push network I/O occurs in credential requests. No notifications are sent for rolled-back audit events. The inbox deduplicates events per recipient.

Only approved HTTPS push-service hosts are accepted (Google, Mozilla and Apple by default); add verified service hosts to `WEB_PUSH_ALLOWED_HOSTS` if needed. Browser endpoints and encryption keys are private. Push payloads contain a generic alert, with private credential details available only after sign-in. Logout removes the current device subscription; notifications never cache protected dashboard responses.

## Verify

```powershell
python manage.py test notifications --noinput
```

Sign in, open Settings → Notifications, enable push and accept browser permission. Send a test notification, then check the header inbox and browser alert. Test closed-tab delivery with the worker running. Browser permission and actual transport delivery require a real browser subscription; server tests mock the transport.

Web Push transport uses [pywebpush](https://github.com/web-push-libs/pywebpush).
