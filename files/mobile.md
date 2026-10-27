# Credence mobile screens and user flows

Mobile screens should help users start the app, grant permissions, and complete tasks. Some appear once; others appear only when needed. The flows below describe the intended behaviour, not a claim that every feature is implemented.

## Screens and states

| Screen or state | When it applies | How Credence should use it |
| --- | --- | --- |
| Splash screen | Every cold launch while the app starts | Show the logo briefly while restoring the saved session. Continue to the landing page or student dashboard. Handle startup failures instead of loading indefinitely. |
| Onboarding | First launch, or introduction of a significant feature | Explain credential access, sharing, and QR verification. Make it skippable and remember completion. Do not show it on every launch. |
| Landing page | Signed-out visitors | Offer **Student access** and **Verify a credential**. Public verification requires no login. |
| Sign-in / claim screen | When a student needs private access | Returning students sign in. First-time students open or paste their institution invitation. Explain expired and already-used invitations clearly. |
| Camera permission explanation | First use of **Scan QR** | Explain the camera's purpose before requesting device permission. If denied, provide manual ID entry and access to device settings. |
| QR scanner | When verifying a credential | Scan the code, pause after a valid result, and open verification results. Include a torch control and manual ID entry. |
| Loading state | During sign-in, verification, or downloads | Keep the current screen visible, show progress, and prevent repeated submissions. Use a full-screen loader only when there is no useful content to display. |
| Success confirmation | After claiming a credential or completing an action | Explain what succeeded and offer a next action, such as **View my credentials**. Use an inline confirmation when a separate screen adds no value. |
| Empty state | No credentials are available, or a search has no results | Distinguish **No credentials available** from **No matching results**. Explain what the user can do next. |
| Connection / error state | When a request fails | Preserve entered information and previously loaded credentials. Offer **Try again**. Do not present a connection failure as an empty dashboard. |
| Session expired | When authentication is no longer valid | Ask the student to sign in again, then return to the interrupted task where practical. |
| Native share sheet | When sharing a verification link or downloaded documents | Open the phone's sharing menu. A separate app screen is usually unnecessary. |

## Returning student

Launch → Splash → Restore session → Dashboard → Credential details → Download or share

If the session has expired:

Splash → Sign in → Dashboard

Restoring a valid session should not require the student to sign in on every launch.

## First-time student

Invitation link → Splash → Validate invitation → Claim confirmation → Dashboard

Opening an invitation takes priority over onboarding. Preserve the invitation while startup or authentication completes.

If linking a Google account is required, explain it during claiming so the student knows how to sign in next time. If the invitation has expired or was already used, show the appropriate recovery action rather than a generic failure.

## Public verifier

Launch → Splash → Landing → Scan QR → Camera permission, if needed → Verification result

Public verification remains accessible without a student account. Users who cannot grant camera permission can enter the credential ID manually.

Verification results must distinguish:

- **Verified:** the verification checks succeeded.
- **Revoked:** the credential has been revoked.
- **Not found:** no matching credential was found.
- **Verification unavailable:** a network or service failure prevented verification.

A network failure must never be presented as an invalid credential.

## Signed-in student verifying another credential

Dashboard → Scan QR → Verification result → Back to dashboard

Keep verification accessible from the dashboard without requiring logout.

## Navigation and interaction rules

- Keep splash and onboarding brief. Do not add artificial startup delays.
- Request permissions when the corresponding feature is used, rather than requesting everything at launch.
- Use inline messages or small dialogs for routine errors and confirmations.
- Preserve form input, selected documents, and loaded records when requests fail.
- Prevent repeated actions while a request is running and restore controls after failure.
- Provide a clear back action from scanners, credential details, and verification results.
- Use the native share sheet for supported sharing actions.
- Treat a verification result as a current check; previously loaded credentials alone do not establish current validity.


## Implemented mobile splash and onboarding

The native startup design follows `research/template/splash/CREDENCE_Restored_Entrance_Transitions.html`: a transparent maroon logo, cream background, soft layers, subtle particles and entrance motion. The full splash now follows the reference timeline: 8 seconds of entrance animation, then a 500 ms fade once startup is ready. Reduced-motion mode skips the timed sequence.

First-time signed-out visitors see three onboarding pages: Receive your credentials, Keep and share, and QR verification. Next, Back, Skip and Get started are supported. Completion is stored using SecureStore on native devices and localStorage on web. If saving fails, the user can retry or continue for the current visit.

Returning authenticated students go to the dashboard. Invitation links take priority over onboarding, and failed claims open Student access for recovery. Students can reopen onboarding from Profile ? View the welcome guide.

Reduced-motion preferences are respected. The native app does not include the template's simulated sessions, failure checkbox, or demo controls. Camera permission is requested by the scanner, not onboarding.


### Full reference splash update

The mobile splash now includes three moving particle tracks, three cream depth layers staggered by 360 ms, a logo entrance beginning at 3.4 seconds, copy beginning at 4.15 seconds, and a handoff after the 8-second entrance and startup checks have both completed. Particle styling continues into onboarding. The transparent logo remains maroon on cream, with no card, hard contour lines, or extra loading spinner. The reference's fake status bar, phone frame and demo controls are excluded because the native device supplies its own system UI.


## Landing-page quick tour

The mobile landing page provides Sign in, Verify a credential, and Claim credential cards with visible descriptions. Take a quick tour explains and highlights each action, with Back, Next, Finish and Skip tour. It never starts automatically or blocks an invitation. Dismissal is remembered, and Show guide again reopens it. Claim credential opens the invitation section in Student access. View the welcome guide reopens the separate onboarding pages.

The public web landing page also includes an optional quick tour and action descriptions. Its claim guidance directs students to open or paste their institution invitation in the mobile app; the web staff sign-in is not presented as student claiming. Storage failures do not prevent dismissal or navigation.

## Web-aligned mobile design

The mobile interface now shares the web default theme: navy `#08283F`, cream
`#F8F7F2`, maroon `#780110`, white bordered cards, blue-tinted form fields and
semantic green/amber/red status colors. Inter is bundled for interface text and
Newsreader for editorial headings, matching the web layout. Only the five used
font files are bundled, so startup does not download fonts from the network.

Design references read during implementation:
- `front/app-next/src/app/globals.css`, including the later `.lp-page` overrides.
- `HeroSection`, `Navbar`, `VerifySection` and `AnimatedControls`.
- `LoginSwitch.module.css` and `AuthField.module.css` for authentication/forms.
- `DashboardThemeProvider`, `TopHeader`, `RecordPageHero` and `ProfilePanel`.

`mobile-app/src/theme.js` centralizes native colors and typography. BrandHeader,
PageIntro, FormField and CredentialPreview adapt the corresponding web patterns.
Home, student access, dashboard, profile/setup, verification, credential details
and onboarding use this system. Phone layouts retain scrollable content, labelled
inputs, accessible controls, reduced-motion support and the existing API flows.
Profile uses a compact header rather than repeating the credential statistics.
The splash retains its established entrance animation.

Visual QA uses the Expo web build at phone widths with preview-only API responses;
it does not claim invitations or authenticate a real student. Android export also
checks native font and SVG bundling. Physical-device visual validation remains a
separate check. New development builds should be rebuilt after native dependency
changes; restart Metro with `npx.cmd expo start --clear` when previewing updates.
