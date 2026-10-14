# Going live with Stripe

The site is at https://subscription-finder.subscription-finder.workers.dev (Cloudflare, free plan).
Stripe Managed Payments is the merchant of record: it takes payment and handles VAT.
Menu names may have moved since this was written. If something isn't where it says, search Stripe's docs for the step's name.

## How buying works

1. The Buy button opens a Stripe Payment Link.
2. After paying, Stripe sends the buyer to `/unlock?session_id=...`.
3. `worker.js` asks Stripe whether that payment went through, using a read-only key. If it did, it gives the
   buyer a licence key (`SF-XXXX-...`). The same payment always gets the same key.
4. On other devices, the buyer types the key in and `worker.js` checks it.

Keys are signed with `LICENCE_SECRET`. There's no customer database. The backup copy of the secret is in
`~/.config/subscription-finder/licence-secret`. **Never lose or change it**: every key ever issued depends on it.

## 1. Set it up in Stripe's test mode first

1. **Product:** create "Subscription Finder", one-off price £4.99. Set the tax code to
   **Software as a service (SaaS) – personal use** (`txcd_10103000`); Managed Payments needs an eligible code.
   Copy the product ID (`prod_...`).
2. **Payment Link:** create one for that price, with Managed Payments switched on. Under
   **After payment**, choose to redirect customers to your website and use exactly:

   ```
   https://subscription-finder.subscription-finder.workers.dev/unlock?session_id={CHECKOUT_SESSION_ID}
   ```

   Copy the link (`https://buy.stripe.com/...`).
3. **Read-only key:** Developers → API keys → **Create restricted key**. Name it `subscription-finder-unlock`
   and give it **Checkout Sessions: Read**, and nothing else. Never use your full secret key (`sk_...`).
4. **Give the key to the site.** Don't paste it into a chat or a file. In Terminal:

   ```sh
   cd ~/subscription-finder
   npx wrangler secret put STRIPE_KEY
   ```

   Paste the restricted key (`rk_test_...`) when it asks, and press Enter.
5. Put the **Payment Link** in `config.js` (`checkoutUrl`) and the **product ID** in `wrangler.jsonc`
   (`STRIPE_PRODUCT_ID`). Then build and upload:

   ```sh
   ./build.sh && npx wrangler deploy
   ```

6. **Test purchase:** open the site, click Unlock → Buy, and pay with Stripe's test card `4242 4242 4242 4242`
   (any future expiry date, any CVC). You should land on "Thank you! You're unlocked." with a key.
   Try the key on another browser.

## 2. Switch to live

Test and live mode have separate products, links and keys. Repeat steps 1 to 5 in **live mode**: live product ID,
live Payment Link, a live restricted key (`rk_live_...`) via `npx wrangler secret put STRIPE_KEY`. Then build and
deploy. Do one real £4.99 purchase yourself and refund it from the Stripe dashboard.

## Day-to-day

- **"I lost my key":** find their payment in Stripe, open its Checkout Session, copy the session ID (`cs_live_...`),
  and send them
  `https://subscription-finder.subscription-finder.workers.dev/unlock?session_id=THAT_ID`.
  It shows the same key again.
- **Refunds:** issue them in the Stripe dashboard. Keys can't be switched off afterwards. That's a deliberate
  trade-off for having no customer database, and fine at £4.99.
- **Updating the site:** `./build.sh && npx wrangler deploy`.
- **Legal pages:** replace `[YOUR NAME]`, `[TOWN]`, `[EMAIL]` and `[DATE]` in `privacy.html`, `terms.html` and
  `refunds.html` before launch. They're a sensible starting point, not legal advice.
- **Tax:** Stripe handles VAT. Your profit is still income: above the £1,000 trading allowance, register for
  Self Assessment.
