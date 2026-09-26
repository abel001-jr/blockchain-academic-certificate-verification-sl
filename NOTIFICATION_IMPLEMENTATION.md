# Browser Push Notifications - Implementation Summary

## Overview
Browser native push notifications have been fully integrated into the Credence application. Users are prompted to enable notifications upon first use, and notifications are sent for key events: officer authorizations, certificate approvals, and certificate issuance.

## Implementation Details

### 1. Notification Library (`lib/notifications.js`)
Created comprehensive notification utility module with the following functions:

#### Permission Management
- `requestNotificationPermission()` - Requests browser permission
- `canShowNotifications()` - Checks if notifications are allowed
- `getNotificationPreference()` - Retrieves saved preference
- `saveNotificationPreference(enabled)` - Persists user choice

#### Notification Functions
- `notifyOfficerAuthorized(firstName, lastName, role)` - Officer on-chain authorization
- `notifyCertificateIssued(studentName, certificateId)` - Certificate finalization
- `notifyCertificateApproval(studentName, certificateId, approver)` - VC/Chancellor approval

**Features:**
- Automatic permission checking before display
- Fallback to console logging when unavailable
- Customized icons, badges, and actions
- Auto-close after 10 seconds
- Click-to-focus tab behavior

---

### 2. NotificationProvider Component
**Location:** `components/NotificationProvider.js`

React context provider that:
- Wraps the entire application (integrated in `app/layout.js`)
- Shows animated permission request banner on first visit
- Tracks permission status (granted/denied/default/unsupported)
- Dismissible banner with localStorage persistence
- Beautiful gradient design matching Credence branding

**Banner Features:**
- Slides up from bottom with smooth animation
- Gold accent border (#B98A28)
- Navy gradient background (#08283F → #0D3C5C)
- Enable/Dismiss actions
- 2-second delay after page load for better UX
- Never shown again after dismissal

---

### 3. CSS Animations (`app/globals.css`)
Added slide-up animation for notification banner:

```css
@keyframes slide-up {
  from {
    transform: translateY(100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.animate-slide-up {
  animation: slide-up 0.3s ease-out;
}
```

---

### 4. Integration Points

#### Officers Page (`app/dashboard/officers/page.js`)
- **When:** Officer authorized on-chain
- **Function:** `authorizeOnChain(officer)`
- **Notification:** "Officer Authorized: {Name} has been authorized on-chain as {Role}"

#### Certificates Detail (`app/dashboard/certificates/[id]/page.js`)
- **When:** Certificate issued/finalized
- **Function:** `handleFinalize()`
- **Notification:** "Certificate Issued: {CertificateID} has been issued for {StudentName}"

#### Approvals Page (`app/dashboard/approvals/page.js`)
- **When:** VC or Chancellor approves certificate
- **Function:** `handleApprove(cert)`
- **Notification:** "Certificate Approved: {CertificateID} for {StudentName} approved by {Approver}"

---

### 5. Backend Updates

#### Serializer (`back/cred/certify/serializers.py`)
**Class:** `CertificateUploadAnchorSerializer`

Added optional `transcript_file` field for full_upload flow:
```python
transcript_file = serializers.FileField(
    required=False,
    help_text="Optional transcript PDF for full_upload flow.",
)
```

Includes validation for PDF format and 20MB size limit.

#### View (`back/cred/certify/views.py`)
**Endpoint:** `POST /api/certificates/<id>/upload-and-anchor/`

Enhanced to handle dual file upload:
- Accepts `document_file` (certificate PDF) - required
- Accepts `transcript_file` (transcript PDF) - optional
- Pins transcript to IPFS when provided for full_upload flow
- Returns transcript CID and URL in response

**Response additions:**
```json
{
  "ipfs_cid_transcript": "Qm...",
  "ipfs_url_transcript": "https://ipfs.io/ipfs/Qm..."
}
```

---

## User Experience Flow

### First Visit
1. User lands on dashboard
2. After 2 seconds, notification banner slides up from bottom
3. Banner explains benefits and shows "Enable" / "Dismiss" buttons
4. If enabled: permission granted, notifications active
5. If dismissed: banner never shown again (localStorage flag)

### Notification Triggers
1. **Officer Authorization** - Registrar authorizes VC/Chancellor on-chain
2. **Certificate Approval** - VC or Chancellor approves a certificate
3. **Certificate Issuance** - Registrar finalizes certificate to blockchain

### Notification Appearance
- Desktop: Native OS notification (Windows/macOS/Linux)
- Mobile: Browser notification with icon and actions
- Icon: Credence logo (gold accent)
- Auto-dismisses after 10 seconds
- Clicking notification focuses the tab

---

## Browser Compatibility

| Browser | Desktop | Mobile |
|---------|---------|--------|
| Chrome  | ✅ | ✅ |
| Firefox | ✅ | ✅ |
| Safari  | ✅ | ✅ (iOS 16.4+) |
| Edge    | ✅ | ✅ |

**Note:** Safari on iOS requires iOS 16.4+ for Web Push API support.

---

## Technical Notes

### Permission States
- **default**: Not yet requested (show banner)
- **granted**: User allowed notifications
- **denied**: User blocked notifications (banner hidden)
- **unsupported**: Browser doesn't support Notifications API

### Storage
- Banner dismissal: `localStorage.notification_banner_dismissed`
- User preference: `localStorage.notification_preference`

### Fallbacks
- If notifications blocked/unsupported: logs to console
- If IPFS pinning fails: error response, no notification
- If MetaMask cancelled: error state, no notification

---

## Testing Checklist

### Frontend
- [ ] Notification banner appears after 2 seconds on first visit
- [ ] "Enable" button requests permission
- [ ] "Dismiss" button hides banner permanently
- [ ] Banner never shown if previously dismissed
- [ ] Notifications fire on officer authorization
- [ ] Notifications fire on certificate approval
- [ ] Notifications fire on certificate issuance
- [ ] Clicking notification focuses the tab

### Backend
- [ ] Upload endpoint accepts transcript_file
- [ ] Transcript pinned to IPFS for full_upload flow
- [ ] Response includes transcript CID and URL
- [ ] Works without transcript_file (optional)
- [ ] Validation rejects non-PDF files
- [ ] Validation rejects files over 20MB

### Browser
- [ ] Chrome desktop notifications work
- [ ] Firefox desktop notifications work
- [ ] Edge desktop notifications work
- [ ] Mobile browser notifications work
- [ ] Graceful degradation when unsupported

---

## Future Enhancements
1. **Push Server**: Implement web push server for offline notifications
2. **Rich Notifications**: Add action buttons (View Certificate, Approve Now)
3. **Notification History**: Dashboard page showing past notifications
4. **Custom Sounds**: Different sounds for different event types
5. **Email Fallback**: Send email if notifications blocked
6. **Notification Preferences**: User settings to toggle event types

---

## Migration Required

⚠️ **IMPORTANT:** The user must run database migrations before testing:

```bash
cd c:\Users\Sam Jr\Documents\GitHub\blockchain-academic-certificate-verification-sl\back\cred
python manage.py migrate
```

This will create the required database columns for the new features.

---

## Files Modified

### Frontend
- `front/app-next/src/lib/notifications.js` (NEW)
- `front/app-next/src/components/NotificationProvider.js` (NEW)
- `front/app-next/src/app/layout.js`
- `front/app-next/src/app/globals.css`
- `front/app-next/src/app/dashboard/officers/page.js`
- `front/app-next/src/app/dashboard/certificates/[id]/page.js`
- `front/app-next/src/app/dashboard/approvals/page.js`

### Backend
- `back/cred/certify/serializers.py`
- `back/cred/certify/views.py`

---

## Summary

Browser push notifications are now fully integrated into Credence. Users will be prompted to enable notifications on their first visit, and will receive timely updates about important events like officer authorizations, certificate approvals, and issuance. The implementation follows best practices with graceful degradation, proper permission handling, and a beautiful user-friendly interface.

The notification system enhances the user experience by keeping stakeholders informed of critical workflow events without requiring them to constantly monitor the dashboard.
