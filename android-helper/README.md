# THEESKAPOOO Android print helper — supervised test build

This is a separate native Android app (Android 8.0/API 26 or later). It sends authorised prepared PDFs directly to a private-network IPP printer. It does **not** automate or fill the KYOCERA Print / Canon PRINT user interfaces. Those apps remain manual fallbacks.

## Setup at the shop

1. Install `build/THEESKAPOOO-Print-test.apk` on the operator phone. It is locally signed, not Play Store reviewed. Share only the APK, never the signing key or credentials. Allow installation for the file-sharing/browser app temporarily, then turn that installation permission off again. Do not disable Play Protect.
2. Connect the phone to the same shop network as the printers. Internet access is also needed to retrieve the authorised order.
3. Open THEESKAPOOO Print. Enter each printer's IPP URI and use **Save & test connection**. This performs read-only capability discovery, not a print.
4. From the visit, the MZ3200i address was `192.168.1.15` and the 3212i address was `192.168.1.50`. A common IPP endpoint to test is `ipp://ADDRESS:631/ipp/print`; the path/port must be confirmed by the printer. These addresses may change if DHCP changes. The Canon address was not visible in the supplied photos. Never expose IPP/9100 to the public Internet.
5. Sign in as operator in the normal website. Each document has a printer selector: MZ3200i for 20+ printed sides by default, 3212i below 20; colour uses Canon. Change the threshold under Printer setup & printing guide, or override per document.
6. Choose **Print with Android helper**, then **Open helper & print**. Two taps separate authenticated ticket creation from Android's user-gesture app launch. The chosen device and trusted server settings go to the helper; no settings need to be re-entered per job when supported.
7. The helper validates all device settings before fetching/sending the PDF. If the printer does not advertise direct PDF, or rejects an attribute, it stops before sending the document. Check its message. Use manual options until the printer configuration/integration is verified.
8. After acceptance, inspect actual paper output, then mark printing/ready in the website. The helper checks job state once but never marks a student order ready automatically.

## Settings and routing

The shop confirmed that Canon double-sided colour requires manual paper turning. Automatic colour-duplex submission is therefore blocked in the website and server. Use the Canon manual workflow for those jobs; single-sided colour can still be capability-tested.

Page range, copies, collating/grouping, orientation and 1/2/4-up are embedded in the prepared A4 PDF. IPP carries A4 media, one copy, one-up, single/duplex with the appropriate physical turning edge, monochrome/colour and High quality. `ipp-attribute-fidelity=true` requests rejection of unsupported settings. A Validate-Job request occurs before submission. A non-exact success or ambiguous connection is treated as a warning, never as permission to retry.

Canon G3770 compatibility is **not proven**. Supporting Canon PRINT/AirPrint does not establish native PDF-over-IPP support. A PDF-only helper cannot print to a raster-only endpoint. The app detects this and refuses instead of guessing or sending unreadable data. A raster/vendor adapter may be needed after capability results are obtained. Kyocera support also requires on-site verification of enabled IPP, URI and accepted attributes.


## Safety design and limitations

- Only Android INTERNET permission. No contacts, location, microphone, camera, storage or root permission. No ads, analytics or background service.
- The website origin is fixed in native source. HTTPS to the backend; default certificate checking remains enabled. Printer destinations are restricted to literal private IPv4 addresses and ports 631/443. No redirects, DNS destinations or broad LAN scanning.
- Plain `ipp://` traffic is unencrypted on the local network. Use only the trusted shop Wi-Fi; prefer `ipps://` with a valid trusted certificate when configured. TLS validation is never bypassed.
- Verified operator issues a five-minute, hashed, scoped ticket for another student's active paid order. Offline presence is checked. Printer choice is colour-compatible and bound to the ticket. The server atomically claims once, rechecks order state, and blocks repeat submissions. Changing an unclaimed request invalidates its old ticket.
- Only a scoped ticket crosses the Android intent; Firebase/Admin/Supabase credentials do not. The browser intent explicitly targets this package. Do not share print links/tickets. A compromised operator session/device is outside these controls.
- PDF stays in app memory and is overwritten after submission; no student documents are saved to shared storage. Android/runtime copies cannot be guaranteed erased instantly.
- App-private preferences store printer addresses and submission references to guard against duplicates; backup is disabled. There is no automated retry after a claim, timeout or crash. Inspect the printer queue before a supervised manual reprint.
- A job accepted by IPP may still jam, run out of paper or fail later. One status query is not a physical-output guarantee. Do not mark ready without checking.
- Bounded responses (1 MB printer metadata; 50 MB PDF), timeouts and one job per activity. Server tickets also prevent resubmitting the same file. Very large jobs use the manual fallback.

## Build and verification

Current validation: 114 web/server tests passed; IPP JVM tests passed; APK compiled and verified with v2/v3 signatures. Packaged manifest requests only INTERNET permission, API 26 minimum. No Android device or physical printer was attached here, so installation, app handoff and real paper output remain unverified. This is a supervised test APK, not a production-certification claim.

`build.ps1` compiles Java against the official Android 35 SDK, packages DEX with official Build Tools 35, creates an ignored local signing key, signs and verifies the APK. No Gradle plugins or third-party APK-builder service are used. SDK packages were fetched from `dl.google.com` and checked against Google's repository metadata. SDK use is subject to Google's licence.

Keep `private/` outside Git and back it up securely if you plan to update this installed package. Losing the signing key means the next differently signed APK cannot update in place. Do not publish the keystore/password. Build output is ignored.

`tests/IppTest.java` exercises private endpoint restrictions, setting encoding, duplex mapping, malformed responses and one HTTP submission using a local fake IPP endpoint. Server tests cover operator/payment/order checks, printer binding, old-ticket invalidation and one redemption. These do not replace an Android-device and printer test.

References: [IPP semantics, RFC 8011](https://www.rfc-editor.org/rfc/rfc8011.html), [Kyocera MZ3200i specifications](https://www.kyoceradocumentsolutions.com/in/en/products/mfp/taskalfa-mz4000i/spec-sheet.html), [Android tools](https://developer.android.com/studio).
