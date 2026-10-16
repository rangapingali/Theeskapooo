# Shop equipment and printing — 14 October 2026

## What the photos establish

| Item | Observed detail |
| --- | --- |
| B&W printers | KYOCERA TASKalfa MZ3200i selected; TASKalfa 3212i also discovered and starred. |
| Connection | Private LAN IPv4 addresses shown for both printers; phone shows Wi-Fi. This establishes network discovery, not Bluetooth document transport. Addresses are not hard-coded into public assets. |
| Colour printer | Physical badge Canon PIXMA G3770. Canon PRINT shows the G3070-series family and Online status. |
| Apps | KYOCERA Print **3.7.2.251001**; Canon PRINT **4.0.0**; Brother iPrint&Scan **6.14.2**. |
| Brother device | Selected name is blurred. It cannot be identified as the home-test HL-L2321D from these photos. |
| Paper | Only A4 stocked (owner confirmation). **Letter is selected in the photographed Kyocera preferences: change to A4.** A paper-size menu is not evidence of stock. |
| Phone | Android interface. Exact phone model and Android OS version are not shown; app versions are not OS versions. |
| Touchscreen | Photocopy controls, confirmed by the user. Not used to configure uploaded jobs. A cassette maintenance warning is visible, not an app error. |
| Video | Sampled frames across the 10.97-second clip show Kyocera home, document preview and Print button, then another document view. No automatic setting transfer or physical print completion is established. Audio not transcribed. |

The settings photos show copies, portrait/landscape, duplex off/left-right/top-bottom, collate, paper size, media/source Auto, 1/2/4 pages per sheet, High quality and page range. Workflow is None; staple/punch Off, with availability unconfirmed. Authentication appears but its use is not established.

App info reports about 30.91 GB used by KYOCERA Print and 1.97 GB by Canon PRINT. These are app usage figures, not free phone capacity. Cloud deletion cannot delete another phone app's saved documents. Keep authorised trending masters; remove ordinary student copies after collection. Do not blindly clear app data.

## Implemented settings

A4 only; PDF/PNG B&W and PDF colour; copies, page range, orientation, 1/2/4-up, single/double-sided, left/right or top/bottom turning, complete sets or grouped sheets. Turning is shown only for duplex; copy order only for multiple PDF copies. Existing orders default to complete sets and left/right turning. Binding/finishing controls are hidden; no unsupported stapling, punching, trays or workflows were added.

Rates remain ₹5 per B&W printed side, ₹10 per colour side and ₹8/order priority. ₹2 photocopying is a separate physical-original service.

## Prepared PDF workflow

For an active paid/declared-paid order, another authorised operator can generate an A4 PDF. Offline orders require student-presence confirmation and Mark printing first. Generation uses authenticated private storage, runs in memory and does not create extra stored documents.

The PDF contains the chosen range (deduplicated, ascending), orientation, proportional fit, 1/2/4-up, copies and copy ordering. Odd duplex sets have blank backs between copies; blank backs are not charged. Image copies are packed according to the existing pricing. Images fit within margins without cropping; no filename/header/footer is painted on the page. Existing source text is retained.

1. Choose **Prepared PDF (settings applied)**, or **Prepare phone printing** then **Open in print / PDF app**.
2. Use KYOCERA Print for B&W, Canon PRINT for colour.
3. In that app select **A4, 1 copy, All pages, 1 page per side**. Match orientation, colour and duplex turning shown on the order card. Leave source/media Auto, staple/punch Off; use High quality. **Do not apply copies or n-up again.**
4. Inspect the preview, submit from the printer app and check paper output before marking ready.

Colour duplex needs a shop check/manual sheet-turning workflow; do not assume automatic duplex on the Canon. Left/right and top/bottom describe physical turning; driver long/short-edge names depend on orientation.

The original download is the manual fallback. PDFs with annotations/forms are refused rather than losing their appearance: flatten first or print the original. Encrypted/damaged files also need manual handling. Prepared-PDF limits are 25 MB, 1,000 source pages and 2,000 printed sides, with one generation request per server process at a time. No automatic print retries occur.

## What remains for one-tap printing

Update: a supervised native Android IPP helper has now been built; see [android-helper/README.md](android-helper/README.md). It transfers supported settings directly to the printer, not into the vendor app UI. Device testing remains required. Canon duplex is confirmed manual and is excluded from automatic submission.

This is **not silent Android printing**. File sharing passes a PDF, not a documented vendor settings command. Device-level colour, duplex and printer selection remain in the receiving app. The cloud cannot reach the shop's private LAN. No guessed intents, exposed printer ports or embedded printer/admin credentials are used.

A native/local integration needs capability discovery and job-status handling tested on the shop network. Photos do not establish an enabled print protocol or its acceptance of these settings. No claim of spooler completion, duplex correctness or physical quality can be made without a supervised print.

The home-printer test integration has been retired. Only the shop Android helper and manual printing options are available.

## On-site acceptance

Test a tall PNG with visible top/bottom borders; a five-page PDF selecting pages 2–4; two copies of odd duplex pages; landscape with both turning edges; 2-up/4-up; and colour PDF. Check A4, full borders, no filename, page order, blank backs and price. Check that the phone app has not retained Letter, extra copies or n-up. Sharing success never marks ready automatically.

## Official references

Validation for this update: 112 automated tests passed, production build passed, and generated PDFs were rendered and visually inspected for full image borders, page rotation and copy/layout order. Hardware printing and real Android handoff remain untested.

- [KYOCERA FAQ](https://www.kyoceradocumentsolutions.com/support/mobileprint/index.html): local-network printing and duplex/orientation limitations.
- [Canon G3770](https://in.canon/en/consumer/pixma-g3770/black/product): model, network printing and margins.
- [Android printing framework](https://developer.android.com/training/printing/custom-docs).
- [Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share).
