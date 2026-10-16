# What to do next

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
