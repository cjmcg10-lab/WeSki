# Setting up payments: Paddle (website) and Apple (iPhone app)

Written 2026-11-24 for issue #118. This is the owner's step-by-step list. Each step says what you need in hand
before you start, where to click, and what to send back to Claude.

## The plan (owner's decisions, 2026-11-24)

- **The website sells through Paddle. The iPhone app sells through Apple.** Paddle cannot sell inside the iPhone app
  (Apple's rules), and Apple cannot sell to Android phones or computers, so both are needed.
- **The website is a little cheaper for Season and Crew** (it shares about half of Paddle's lower fee). Day and Week
  cost the same everywhere.

  | Pass | iPhone app (Apple) | Website (Paddle) | How it is charged |
  | --- | --- | --- | --- |
  | Day Pass | $2.99 | $2.99 | once, lasts 24 hours |
  | Week Pass | $5.99 | $5.99 | once, lasts 7 days |
  | Season Pass | $24.99 a year | $23.99 a year | renews every year until the person cancels |
  | Crew Season Pass | $44.99 a year, 4 people | $42.99 a year, 4 people | renews every year until the person cancels |

  Next season the prices go up: Season $29.99 and Crew $49.99 in the app, with matching web prices.
- **"Also on the web" line (US only).** In the iPhone app, a quiet grey line under Season and Crew: "Also on the web:
  $23.99 · save $1 ↗". Only for people whose App Store country is the US, and only while a switch on our server
  (`WEB_LINK_US`) is on, so it can be turned off at once if Apple starts charging for links to the web. No banners or
  pop-ups.

- **One account for both.** A pass bought on the website works in the app and the other way round, because it is
  stored on the SkiWithMe account (the email you sign in with), not on the phone.
- **Order:** Paddle on the website first (most of it is built already), then Apple when the app goes into the App Store.
- **Taxes:** Paddle and Apple are each the seller to the customer. They collect and pay sales tax and VAT and send you
  what is left. You get two monthly payout reports (one from each); book each as income with its fees. Check with
  whoever does your taxes; this is not tax advice.

## Golden rules

- **Never type a bank number, password or secret key into the chat.** Bank details go straight into Paddle's and
  Apple's own sites. Secret keys go into Cloudflare (or through the secure form Claude opens).
- Things marked **send to Claude** are not secret (an id or a public token). It is fine to paste those in the chat.
- Menu names below are from Claude's knowledge of these sites. If a name has changed slightly, look for the nearest
  match, or send a screenshot.

## What to have ready before you start

| Item | Used for | Where to find it |
| --- | --- | --- |
| Company's exact name: Built By Roger LLC | Paddle, Apple, tax forms | your LLC papers |
| EIN (the LLC's federal tax number) | Paddle, Apple tax form (W-9) | the IRS letter (CP 575) from when you got the EIN |
| Business bank account: bank name, routing number, account number, name on the account | where Paddle and Apple pay you | your online banking or a cheque |
| A photo ID (driving licence or passport) | Paddle's identity check | — |
| D-U-N-S number for the LLC | Apple, only if your Apple account is not yet in the LLC's name | free from Dun & Bradstreet: developer.apple.com/enroll/duns-lookup (takes up to about 5 working days) |
| Logins: Paddle, App Store Connect, Cloudflare, Resend, hello@builtbyroger.app inbox | each step below | — |
| A spare email address that is not already an Apple ID | Apple test purchases (Part D, step 9) | for example a new Gmail address |

---

## Part A: Sign-in emails (Resend) — skip if already done

Paying needs an account, and accounts need sign-in emails.

**A1. Check the Resend account.**
- Need: Resend login.
- Do: resend.com → Domains. `builtbyroger.app` should show **Verified**. If not, add the DNS records it lists in the
  Cloudflare dashboard (Websites → builtbyroger.app → DNS), then press Verify.

**A2. Put the key in Cloudflare.**
- Need: Resend → API Keys → Create API key (permission: Sending access). Copy it.
- Do: Cloudflare dashboard → Workers & Pages → `skiwithme` → Settings → Variables and secrets → Add → type **Secret**,
  name `RESEND_API_KEY`, paste the key → Deploy/Save.
- Send to Claude: "Resend key saved". Claude then sends a test sign-in code to you.

---

## Part B: Paddle (the website)

**B1. Finish Paddle's business check.**
- Need: company name, EIN, address, your photo ID, website address.
- Do: log in at vendors.paddle.com (the **live** account, not sandbox) and finish every item in the onboarding
  checklist (business details, identity check). Give the website as `https://skiwithme.builtbyroger.app/about`.
- Waiting: Paddle reviews the business and the website, usually a few working days.

**B2. Approve the website for checkout.**
- Do: Paddle → Checkout → Website approval (or Settings → Domains) → add `skiwithme.builtbyroger.app`.
- Then: Checkout → Checkout settings → **Default payment link**: `https://skiwithme.builtbyroger.app/`.

**B3. Ask about prices under $10.**
- Paddle asks for special terms on prices under $10 (our Day $2.99 and Week $5.99 passes).
- Do: message Paddle support: "We sell a $2.99 day pass and a $5.99 week pass for our ski app. Can these be approved
  on the standard plan?" Tell Claude the answer.

**B4. Add your bank account for payouts.**
- Need: business bank account details.
- Do: Paddle → Business account → Payouts (or Settings → Payouts) → add the bank account. Paddle pays monthly once you
  are owed at least $100.

**B5. Create the four products and prices.**
- Do: Paddle → Catalog → Products → New product, four times:

  | Product name | Price | Type | Billing |
  | --- | --- | --- | --- |
  | Day Pass | 2.99 USD | One-time | — |
  | Week Pass | 5.99 USD | One-time | — |
  | Season Pass | 23.99 USD | Recurring | every 1 year, no trial |
  | Crew Season Pass | 42.99 USD | Recurring | every 1 year, no trial |

  (If the sandbox products still show $24.99 and $44.99, change them to these too.)

  Tax category: **Standard digital goods** (or "SaaS").
- Send to Claude: the four **price ids** (they start with `pri_`; open each price to see it).

**B6. Get the checkout token.**
- Do: Paddle → Developer tools → Authentication → Client-side tokens → New token (name it "SkiWithMe app").
- Send to Claude: the token (it starts with `live_`; it is public, made to sit in the app).

**B7. Tell Paddle where to send "someone paid" messages.**
- Do: Paddle → Developer tools → Notifications → New destination.
  - URL: `https://skiwithme.builtbyroger.app/api/paddle/webhook`
  - Events: `transaction.completed`, `subscription.created`, `subscription.updated`, `subscription.canceled`
- Then copy the destination's **secret key** and put it in Cloudflare (as in A2) as secret `PADDLE_WEBHOOK_SECRET`.
  Do not send it to Claude.
- Send to Claude: "Paddle webhook secret saved".

**B8. Claude switches on, you test.**
- Claude (in a pull request): turns on payments (`PAYWALL` on, Paddle set to live, your token and price ids).
- You: once it is live, buy a Day Pass with your own card on the website, check the app shows the pass, then refund
  it in Paddle (Transactions → the purchase → Refund).

---

## Part C: Is your Apple account ready?

**C1. Account in the company's name.**
- Check: developer.apple.com → Account → Membership details. **Entity type** should say Organization with
  "Built By Roger LLC".
- If it says Individual with your own name: contact Apple Developer Support (developer.apple.com/contact) and ask to
  convert the membership to an organization. You need the D-U-N-S number. The TestFlight app keeps working.

**C2. Paid Apps Agreement, bank and tax.**
- Need: bank details, EIN, company address, a contact name and phone for legal, finance and tax.
- Do: App Store Connect (appstoreconnect.apple.com) → **Business** (in older versions "Agreements, Tax, and Banking")
  → Paid Apps → accept the agreement → add the bank account → fill in the **U.S. tax form (W-9)** with the LLC's EIN
  → add the contacts.
- Waiting: the agreement shows **Active** once Apple has checked the bank account (can take a day or two). Products
  cannot be sold before that.

**C3. Join the Small Business Program (Apple takes 15% instead of 30%).**
- Need: the Account Holder's Apple login.
- Do: developer.apple.com/app-store/small-business-program → Enroll → list any other developer accounts you own
  (probably none) → submit.
- Waiting: Apple confirms by email. The lower rate starts after approval, so do this before the first sale.

---

## Part D: Apple (the iPhone app)

Do these once Part C is done. Claude builds the app side at the same time.

**D1. Find the app's Apple ID number.**
- Do: App Store Connect → Apps → SkiWithMe → App Information → General Information → **Apple ID** (a number such as
  6740000000).
- Send to Claude: that number.

**D2. Create the Day and Week passes.**
- Do: App Store Connect → Apps → SkiWithMe → Monetization → **In-App Purchases** → + → type **Non-Renewing
  Subscription**, twice:

  | Reference name | Product ID | Price | Display name | Description |
  | --- | --- | --- | --- | --- |
  | Day Pass | `app.builtbyroger.skiwithme.day` | $2.99 | Day Pass | Directions, groups and more for 24 hours |
  | Week Pass | `app.builtbyroger.skiwithme.week` | $5.99 | Week Pass | Directions, groups and more for 7 days |

  Product IDs must be typed exactly as above and can never be reused or changed.
- Availability: all countries. Review screenshot and notes: leave for now; Claude supplies them (D8).

**D3. Create the Season and Crew passes.**
- Do: Monetization → **Subscriptions** → create a subscription group named **SkiWithMe Pass**, then add two
  auto-renewable subscriptions to it:

  | Reference name | Product ID | Length | Price | Display name | Description |
  | --- | --- | --- | --- | --- | --- |
  | Crew Season Pass | `app.builtbyroger.skiwithme.crew` | 1 year | $44.99 | Crew Season Pass | Every pass feature for you and 3 friends, for a year |
  | Season Pass | `app.builtbyroger.skiwithme.season` | 1 year | $24.99 | Season Pass | Every pass feature for a year |

  In the group, put **Crew above Season** (the higher level), so moving between them counts as an upgrade or
  downgrade rather than a second subscription. No free trial or introductory offer.
- Group display name (localization): "SkiWithMe Pass".

**D4. Links Apple requires for yearly subscriptions.**
- Do: App Store Connect → SkiWithMe → App Information → **Privacy Policy URL**:
  `https://skiwithme.builtbyroger.app/legal/privacy`. In the app's version page, put the terms link in the
  description: "Terms of use: https://skiwithme.builtbyroger.app/legal/terms".

**D5. Tell Apple where to send "someone paid" messages.**
- Do: SkiWithMe → App Information → **App Store Server Notifications** →
  - Production Server URL: `https://skiwithme.builtbyroger.app/api/apple/notifications`
  - Sandbox Server URL: the same address
  - Version: **Version 2**
- Do this after Claude's server change is live (Claude will say when), or Apple's test message fails.

**D6. Make a key for checking purchases with Apple.**
- Do: App Store Connect → Users and Access → **Integrations** → **In-App Purchase** → Generate (name it
  "SkiWithMe server"). Download the `.p8` file (you can only download it once; keep a copy somewhere safe).
- Put the whole file's text into Cloudflare (as in A2) as secret `APPLE_IAP_KEY`. Do not send it to Claude.
- Send to Claude: the **Key ID** and the **Issuer ID** shown on that page (not secret).

**D7. Make a test buyer.**
- Need: the spare email address.
- Do: Users and Access → **Sandbox** → Test Accounts → + → fill in (any name, region United States). Test purchases
  with this account cost nothing.
- On your iPhone: Settings → App Store → Sandbox Account → sign in with it.

**D8. Test, then submit.**
- Claude: builds the Apple purchase into the app, a TestFlight build arrives, and gives you review screenshots and
  notes for D2 and D3.
- You: in the TestFlight app buy each pass with the test buyer, check the website shows the pass when signed in with the
  same SkiWithMe account, and try **Restore purchases**.
- Then: the passes are submitted together with the first App Store version of the app (the first in-app purchases
  must go to review with an app version).

---

## Summary: what goes where

| Thing | Goes to | Secret? |
| --- | --- | --- |
| Bank details, EIN, photo ID | typed into Paddle's and Apple's own sites | yes |
| `RESEND_API_KEY` | Cloudflare secret | yes |
| `PADDLE_WEBHOOK_SECRET` | Cloudflare secret | yes |
| `APPLE_IAP_KEY` (the `.p8` file's text) | Cloudflare secret | yes |
| Paddle `live_` token, four `pri_` price ids | send to Claude | no |
| App's Apple ID number, IAP Key ID, Issuer ID | send to Claude | no |

## What Claude builds (for reference)

1. Two price lists: the app's prices for Apple and the web prices for Paddle (`PLANS` in `worker/accounts.js`, the
   about page and the legal pages show the web prices), plus the US-only "Also on the web" line and its switch.
2. Website: Paddle switched to live once Part B is done.
3. Server: receives and checks Apple's signed messages (`/api/apple/notifications`) and records the pass on the
   account, as it does for Paddle; a reminder email before a yearly renewal.
4. iPhone app: buys through Apple (a StoreKit plugin in the Capacitor wrapper in `ios-beta/`), "Restore purchases",
   and the wording Apple requires next to yearly plans (price, length, renews until cancelled, how to cancel).
5. If Apple objects to needing an account before buying, the app lets people buy first and adds the pass to their
   account when they sign in.
