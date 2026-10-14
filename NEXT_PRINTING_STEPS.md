# What to do next

## Test the Brother at your friend's home

You need the **Windows laptop connected to the Brother by USB**. The Android APK is not used for this USB-only printer.

1. Switch on the printer, load A4 paper and connect USB.
2. Install Brother's official HL-L2321D driver if needed. Print a Windows test page first. If that fails, fix the driver/connection before trying our app.
3. Install **Node.js 22 or 24** from [nodejs.org](https://nodejs.org/en/download), and **SumatraPDF** from [sumatrapdfreader.org](https://www.sumatrapdfreader.org/free-pdf-reader). Both are free.
4. Download the latest project from GitHub: **Code → Download ZIP**, then extract it. Do not copy your `.env`, Firebase Admin JSON or Supabase keys to your friend's laptop.
5. Open the extracted `bridge` folder and double-click **Start-Brother-Test.cmd**. It checks the printer, installs project dependencies if missing, and shows a pairing code. Keep the window open.
6. In Render, keep the deployed branch as **main**. Add or set **BROTHER_TEST_BRIDGE=true**, then Save and deploy. This is a non-secret feature switch.
7. Upload a small B&W A4 PDF or PNG from a student account and place the order using the existing payment flow. Do not send a new payment just to retry printing an existing paid order.
8. On the USB-connected laptop, open the deployed website in Chrome/Edge and sign in with the operator account. Use an order belonging to a different student account.
9. Click **Print on Brother (test)**. Paste the pairing code from the helper window. If Chrome/Edge asks for local-network access, allow it for this website. For offline orders, confirm the student is physically present.
10. Check the actual paper. Test one page first, then two copies, a page range, a tall PNG and double-sided printing. Check that copies are not doubled and no filename is added. Only mark ready after checking the output.

**If anything times out or looks uncertain:** check the Windows print queue and paper output before trying again. Automatic retries are blocked to avoid duplicate prints. Tell me the exact error text, without passwords or pairing codes.

When finished, stop the helper with Ctrl+C and set **BROTHER_TEST_BRIDGE=false** in Render, then deploy. This removes the Brother test control from the shop workflow.

## Set up the Android helper at the college shop

1. Transfer **THEESKAPOOO-Print-test.apk** from `android-helper/build/` to the operator phone. It requires Android 8 or newer. Install only this APK; never send the `private` folder. Keep Play Protect enabled.
2. Connect the phone to the shop Wi-Fi. It also needs Internet access to fetch orders.
3. Open **THEESKAPOOO Print**. Set the printer addresses and click **Save & test connection**. This test does not print.
4. The photographed Kyocera addresses were **MZ3200i: 192.168.1.15**, **3212i: 192.168.1.50**. The helper needs an IPP URL, commonly `ipp://192.168.1.15:631/ipp/print`. Test it first; the exact IPP path/port must be supported and enabled on that printer. The Canon IP address still needs to be obtained from its network information.
5. In the website, choose the printer on the order card. Larger B&W jobs default to MZ3200i, smaller ones to 3212i. The starting threshold is 20 printed sides; change it in **Printer setup & printing guide**. Colour selects Canon.
6. Click **Print with Android helper**, then **Open helper & print**. Settings travel with the authorised job. The helper stops if the printer cannot accept them exactly.
7. Test one-page and two-sided B&W output before larger jobs. Check page order, orientation, turning edge and margins.
8. **Canon double-sided colour stays manual** because staff turn the paper over. Use the manual options and the Canon workflow. Single-sided Canon direct printing also needs a capability test; if it does not support direct PDF, use Canon PRINT for now.

The helper talks directly to compatible printers. It does not fill the KYOCERA/Canon app screens. Its build and automated tests cannot prove real hardware compatibility. Report the helper's connection-test message before relying on it for student work.

## The extra buttons

- **Download document:** original file for a manual fallback.
- **Prepared PDF:** chosen pages, copies and layout already applied.
- **Prepare phone printing:** shares that prepared PDF with another app.

These now sit under **Manual printing / download options**. When using a prepared PDF in a vendor app, set A4, **1 copy**, **all pages**, **1 page per side**; do not apply the order's copies/layout twice. Match colour, orientation and duplex to the order.
