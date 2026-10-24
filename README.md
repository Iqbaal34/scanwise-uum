# ScanWise UUM

**Learn safe digital payments & scam prevention — by scanning, not just reading.**

> 🔗 **Live demo:** [https://iqbaal34.github.io/scanwise-uum/](https://iqbaal34.github.io/scanwise-uum/)

ScanWise UUM is a front-end interactive simulation built for the
**PayNet Northern Hackathon at Universiti Utara Malaysia (UUM)**.
It answers the challenge direction **D — "Make it approachable"**: helping
people who are unfamiliar with digital payments build real confidence using
them.

Instead of a read-only guide, you step inside a **playable sixty-second café
payment scenario** — the same decisive moment UUM students face every day at
campus stalls.

---

## The core journey

| Step | What you do | What you learn |
|---|---|---|
| 1. Scan | Scan the merchant's DuitNow QR at *Kopi Corner Café · UUM* | Verify the **merchant name** before trusting a QR sticker |
| 2. Review | The payment screen shows **RM 115.00** — your receipt says **RM 11.50** | Cross-check the **amount** against the real price |
| 3. Fix | Edit the amount to RM 11.50 and confirm | How to correct a mismatched QR before paying |
| 4. Result | Pay correctly → wallet drops **RM 100.00 → RM 88.50** | Overpaying "wrong-QR" would have cost **RM 103.50** extra |
| 5. Replay | Wrong path (RM 115.00) is fully simulated too | Feel the consequence in a zero-risk sandbox |

Also included:

- 🎬 **Scam cinema** — a full-screen SMS scam simulation: "your bank account is
  at risk, transfer now" — practise refusing under pressure.
- 📡 **Transaction explainer** — a 6-step motion journey of what actually
  happens between scanning and the merchant's "Paid" screen.
- 🛡 **Safety playbook** — checklist habits that generalize to any QR payment.

## Built for the UUM brief

- **Audience:** UUM students paying at campus cafés, convenience stores and stalls.
- **Goal:** make the first real scan *not* your first attempt — confidence
  through rehearsal, not instruction.
- **Scenario:** Kopi Corner Café · UUM — fictional merchant, campus-realistic
  price point (RM 11.50).

## Tech

- **Pure front-end:** vanilla HTML, CSS, JavaScript + GSAP (CDN).
- **No backend, no build step** — everything runs client-side in any browser.
- **Integer-sen math:** all amounts are computed in *sen* (RM 1 = 100 sen),
  avoiding floating-point money errors.
- **State machine:** `intro → scanning → review ⇄ editing → confirmation → processing → result → explainer`.
- Responsive down to 320 px; supports `prefers-reduced-motion` and basic
  screen-reader announcements (`aria-live`).

## Run locally

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

Just opening `index.html` directly also works.

---

## ⚠️ Educational simulation — no real money

Every scan, payment, receipt, wallet balance and transaction result on this
site is **fictional**, created for education and demonstration in a hackathon
setting. Nothing here connects to any payment gateway, banking system or
PayNet infrastructure, and no personal or financial data is collected.

The official DuitNow trademarks and PayNet services are referenced purely as
part of the educational narrative.
