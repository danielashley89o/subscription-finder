# Subscription Finder

Finds every subscription and regular payment in a bank statement CSV, shows what each costs per year and when it
renews, and makes calendar reminders. It runs entirely in the browser: the page that reads statements can't
connect to the internet.

Live at https://subscription-finder.subscription-finder.workers.dev

## How it's built

- Plain HTML, CSS and JavaScript, with no framework and no build step beyond copying files
- `detector.js`: reads bank CSVs and finds recurring payments
- `app.js`: the app page. `unlock.js` and `licence.js`: buying and unlocking
- `worker.js`: Cloudflare Worker that checks Stripe payments and issues and verifies signed licence keys
- Payments: Stripe Payment Link with Managed Payments (Stripe is the merchant of record)
- Hosting: Cloudflare Workers with static assets (free plan)

## Working on it

```sh
node --test tests/              # run the tests
./build.sh                      # copy the site into dist/
npx wrangler deploy             # put dist/ and worker.js online
```

Secrets (`STRIPE_KEY`, `LICENCE_SECRET`) live in Cloudflare and are never stored in this repository.
See `SETUP.md` for the payment setup and `marketing/LAUNCH.md` for the launch plan.
