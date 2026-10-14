# Historical shop printing setup — 12 October 2026

**Superseded by [SHOP_EQUIPMENT.md](SHOP_EQUIPMENT.md), based on the 14 October shop visit. Use that document for current printer models, versions and prepared-PDF instructions.**

## Confirmed shop information and app behaviour

| Shop finding | App decision |
| --- | --- |
| Kyocera TASKalfa MZ3200i for B&W | Label B&W files with this destination. |
| No shop computer; documents opened on Android and printed from their Print menu | Add an authenticated file handoff on browsers supporting file sharing; retain Open & print and Download fallbacks. No Windows agent. |
| B&W accepts PDF/PNG only | Enforce on upload and order APIs as well as the student page. Other formats must be exported to PDF. Existing orders remain accessible. |
| Canon over Wi-Fi for colour; exact model unknown | Label colour files for Canon; do not invent a driver or connection endpoint. |
| Trending documents are already saved on the shop phone | Keep the existing title/price catalog and student quick-order flow. Operator cards say to use the saved shop document. The catalog does not store master files. |
| Roughly 100–150 visitors/day | Treat as a planning estimate, not measured app concurrency or a capacity guarantee. No fabricated wait-time change. |
| A3 availability unknown | Offer A4 only for new orders pending stock/tray confirmation. |
| Physical photocopies ₹2 | Describe as counter-only; do not apply this price to digital uploads. |
| B&W digital prints ₹5; colour ₹10 | Preserve current per-printed-side rates and ₹8 urgent-order fee. Confirm with shop if they meant per sheet for duplex. |
| Canon accepts PDF only | Reject colour PNG orders with an instruction to export PDF or select B&W. |

## Current phone workflow

1. Review the paid order and the indicated printer. For offline orders, receive cash and confirm the student's presence as before.
2. On a supported phone, select **Prepare phone printing**. This fetches the private file using the operator's authenticated session.
3. Tap **Open in print / PDF app**. Select a compatible PDF viewer or print service from Android's share menu, then use its Print command. If no suitable target is offered, use Download and the phone's existing document-print workflow.
4. Match copies, page range, A4, orientation, colour/B&W, duplex and pages-per-side to the order. These settings are displayed prominently in the order but are NOT automatically transferred by Android file sharing. Check them on the phone or machine before submitting. Some settings may not be editable at the machine after submission.
5. **Mark printing** records status only. Verify the physical output before **Mark ready to collect**. Sharing/opening never automatically marks an order printed or ready.

Preparation and sharing use separate gestures because file sharing requires transient user activation. The prepared share action expires after two minutes. No public storage URL, Firebase token, UPI data or student email is passed to the receiving app. The operator deliberately chooses the receiving app. Copies saved by that app/on the phone are outside server retention; delete ordinary student files after collection. Keep only authorised reusable trending masters.

## What is not yet possible to promise

This is a file handoff, not an installed printer driver or silent direct-print integration. Printer discovery, transport, automatic settings, paper-jam feedback, job completion and physical quality have not been tested. There is no automatic retry that could accidentally print duplicates.

Kyocera documents A3 paper support, duplex and PDF Direct Print for this model, plus KYOCERA Mobile Print/MyPanel/Print Service Plugin. Its documented interfaces do not establish the reported Bluetooth connection; the exact working phone/printer connection still needs confirmation. A working Android Print menu can involve a built-in print service without a separately opened app.

Still needed: Canon exact model, Android phone/version, the printer/service name shown in the existing Print screen, connection type, A3 stock/tray availability, and a supervised on-site PDF/PNG test. Confirm Canon duplex capability too. Do not expose printer ports publicly or share Wi-Fi/admin credentials in chat.

For true one-tap printing, first prove the devices support a suitable local printing protocol, then build/test an authenticated native Android bridge or supported vendor integration. A cloud-hosted webpage alone cannot safely assume access to a private printer or set its touch-panel options.

## Sources

- [Kyocera India TASKalfa MZ3200i specifications](https://www.kyoceradocumentsolutions.com/in/en/products/mfp/taskalfa-mz4000i/spec-sheet.html)
- [KYOCERA Mobile Print FAQ](https://www.kyoceradocumentsolutions.com/support/mobileprint/index.html)
- [Android printing framework](https://developer.android.com/training/printing/custom-docs)
- [Web Share API and user activation](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share)

Validation: 104 automated tests passed, including direct-API format/colour/paper rejection and authenticated share preparation. No printer or Android device was available for physical testing.
