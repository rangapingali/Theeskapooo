# Brother Windows bridge (test branch only)

This sends a real uploaded order file and its server-saved settings to the USB Brother HL-L2321D through Windows and SumatraPDF. It is not enabled on main. Physical output has not yet been tested on your friend's laptop.

## 1. Deploy the branch

Push/use `test/brother-hl-l2321d`. In Render, either create a separate web service on that branch with the existing server environment/secret file, or temporarily select this branch on the existing service for your supervised real-order test. Keep the build/start commands unchanged (`npm ci --omit=dev`, `node server/index.cjs`). Set **BROTHER_TEST_BRIDGE=true** and deploy. A separate service needs its hostname added to Firebase Authentication's authorised domains. This uses real orders and existing payment behaviour; no test payment is invented. Do not share service-account or Supabase secrets with the friend.

The main service remains unchanged until you change its branch. This repository change alone cannot configure Render.

## 2. Prepare the friend's Windows laptop

1. Install the official Brother driver, connect USB, load A4 and print a Windows test page. Note the exact printer name from `Get-Printer` (normally `Brother HL-L2321D series`).
2. Install Node.js 22 or 24 and current stable [SumatraPDF](https://www.sumatrapdfreader.org/free-pdf-reader). Both are free. Sumatra is installed separately, not bundled with this code.
3. Download/clone this branch. In its project folder run `npm ci --omit=dev`.
4. Run the following in PowerShell, replacing the URL and executable path with your actual deployment and installation:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\bridge\start.ps1 -Site "https://YOUR-TEST-SERVICE.onrender.com" -SumatraExe "C:\Program Files\SumatraPDF\SumatraPDF.exe" -Printer "Brother HL-L2321D series"
```

The execution-policy setting applies only to this process; it does not change the machine's policy. Keep this terminal open. The bridge checks that the configured printer exists and listens only on `127.0.0.1:4179`. There is no firewall/public-port setup. It displays a fresh pairing code each launch. Treat it as a temporary local secret; enter it only in your operator page, never in chat or Git.

## 3. Print a real order

1. Upload a small B&W A4 PDF/PNG from a student account and place the order. Use a different authorised operator account on the friend's laptop. Payments keep their existing flow.
2. In the operator page click **Print on Brother (test)** on the document. Enter the bridge pairing code once per page session. Allow browser local-network access if prompted. For an offline order, confirm that the student is present.
3. The saved range, copies, orientation and 1/2/4 pages-per-side are prepared into an A4 PDF with printable margins. PNG copies are tiled according to the same image pricing layout; PDF copies are collated, with blank duplex backs between copies where needed. Sumatra receives one copy of that prepared document, monochrome, A4, fit, and simplex or long-edge duplex.
4. Check Windows' queue and the physical output. Success means submission through the printing program, not confirmed paper delivery. Mark printing/ready/handed over manually as before.

The ordinary **Open & print** path also wraps PNG/JPEG/WebP in a one-page fitted A4 PDF. This removes the HTML printing path that could add filename headers or split tall images. It does not remove filenames/watermarks already inside the original document. For ordinary PDF viewing, choose Fit rather than Actual size if the source extends beyond printable margins.

## Safety and limits

- Operator-only issuance, verified server payment state, another student's active order, short-lived hashed ticket, one-time transactional claim, exact website origin and pairing code on the bridge. No Admin keys on the laptop. The ticket contains no public storage URL.
- B&W A4 PDF/PNG only, no binding, at most 20 copies / 200 printed sides. Colour refuses rather than silently printing grey. Printer-driver behaviour, margins, duplex alignment and orientation need a physical test.
- Forms/annotations must be flattened to PDF first to avoid losing their appearance. Encrypted or malformed PDFs fail. Documents are fitted proportionally; no cropping or filename/header text is added. Vector PDF content stays vector.
- A claimed job is never automatically retried, including after timeouts or crashes. On any error, inspect the queue and output first. For this pilot use the existing Download/Open & print path for a supervised manual reprint after confirming no duplicate. Unclaimed tickets expire after two minutes.
- Temporary prepared PDFs are removed after the print process exits; a crash/power loss can leave a `theeskapooo-print-*` folder in Windows TEMP. Delete those after checking the queue. Windows spool files are managed by Windows.
- The bridge only works in the browser on the USB-connected Windows laptop. A phone cannot reach that laptop's `127.0.0.1`. Current Chrome/Edge may request local-network permission.
- Stop with Ctrl+C. To remove the experiment, disable `BROTHER_TEST_BRIDGE` and deploy `main` again. No Brother changes are merged into main, and no printer status is automatically set to Ready.

Reference: [Sumatra command-line printing options](https://www.sumatrapdfreader.org/docs/Command-line-arguments).
