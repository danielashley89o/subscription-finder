#!/bin/sh
# Copies the files customers need into dist/. Then `npx wrangler deploy` puts dist/ and worker.js online.
set -e
cd "$(dirname "$0")"

# The site's public address. Change this one line if you move to your own domain.
SITE_URL="${SITE_URL:-https://subscription-finder.subscription-finder.workers.dev}"

rm -rf dist
mkdir -p dist/icons
cp index.html unlock.html privacy.html terms.html refunds.html guide.html \
   cancel-app-subscriptions.html cancel-direct-debit.html free-trials.html \
   styles.css config.js licence.js detector.js sample.js app.js unlock.js \
   theme.js manifest.webmanifest _headers robots.txt sitemap.xml og-image.png dist/
cp icons/icon.svg icons/*.png dist/icons/
# Proves to search engines (IndexNow) that this site is ours
cp "$(cat indexnow-key.txt).txt" dist/
# A new version number makes installed copies update
sed "s/const VERSION = 'dev'/const VERSION = '$(date +%Y%m%d%H%M%S)'/" sw.js > dist/sw.js
# Put the real address into links that search engines and social sites need in full
for f in dist/*.html dist/robots.txt dist/sitemap.xml; do
  sed -i '' "s#{{SITE_URL}}#$SITE_URL#g" "$f"
done

# Warn about anything still to fill in before selling
problems=0
if grep -q "checkoutUrl: ''" config.js; then
  echo "To do: put the Stripe Payment Link in checkoutUrl in config.js" >&2; problems=1
fi
if grep -q '"STRIPE_PRODUCT_ID": ""' wrangler.jsonc; then
  echo "To do: put the Stripe product ID in STRIPE_PRODUCT_ID in wrangler.jsonc" >&2; problems=1
fi
if grep -lE "\[(EMAIL|YOUR NAME|TOWN|DATE)\]" privacy.html terms.html refunds.html >/dev/null; then
  echo "To do: replace [EMAIL], [YOUR NAME], [TOWN] and [DATE] in privacy.html, terms.html and refunds.html" >&2; problems=1
fi

echo "Built dist/ ($(ls dist | wc -l | tr -d ' ') files)"
[ "$problems" = 0 ] || echo "Not ready to sell yet: see the to-do lines above." >&2
