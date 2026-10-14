/* Subscription Finder: the only server code. It runs on Cloudflare next to the website and does two things:
   - /api/licence: after someone pays, asks Stripe whether the payment went through, and if so issues a licence key
   - /api/verify:  checks a licence key someone types in
   It never sees bank statements. Keys are signed, so there's no database of customers to keep. */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I, which are easy to mix up
const encoder = new TextEncoder();

function base32(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
}

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(text)));
}

// The same payment always gets the same key, so a lost key can be issued again
export async function makeKey(secret, sessionId) {
  const id = base32((await sha256(sessionId)).slice(0, 5));
  const mac = base32((await hmac(secret, 'sf1:' + id)).slice(0, 10));
  return 'SF-' + (id + mac).match(/.{4}/g).join('-');
}

export async function checkKey(secret, key) {
  const raw = String(key || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^SF/, '');
  if (raw.length !== 24 || [...raw].some((c) => !ALPHABET.includes(c))) return false;
  const expected = base32((await hmac(secret, 'sf1:' + raw.slice(0, 8))).slice(0, 10));
  // Compare every character, so timing doesn't reveal how much matched
  let diff = 0;
  for (let i = 0; i < 16; i++) diff |= expected.charCodeAt(i) ^ raw.charCodeAt(8 + i);
  return diff === 0;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

const configured = (env) => env.STRIPE_KEY && env.LICENCE_SECRET && env.STRIPE_PRODUCT_ID;

async function issueLicence(url, env) {
  const sessionId = url.searchParams.get('session_id') || '';
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(sessionId)) {
    return json({ ok: false, reason: "That payment link isn't complete. Use the link from your Stripe receipt, or contact us." }, 400);
  }
  if (!configured(env)) return json({ ok: false, reason: "Unlocking isn't set up yet." }, 503);

  let response;
  try {
    response = await fetch(
      `${env.STRIPE_API || 'https://api.stripe.com'}/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=line_items`,
      { headers: { Authorization: `Bearer ${env.STRIPE_KEY}` } });
  } catch (e) {
    response = null;
  }
  if (response && response.status === 404) {
    return json({ ok: false, reason: "We couldn't find that payment. Contact us with your receipt and we'll sort it out." }, 404);
  }
  if (!response || !response.ok) {
    return json({ ok: false, reason: "We couldn't check your payment with Stripe just now. Refresh this page in a minute." }, 502);
  }

  const session = await response.json();
  // 'no_payment_required' covers 100%-off codes you might give away
  const paid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
  if (session.status !== 'complete' || !paid) {
    return json({ ok: false, reason: "This payment hasn't gone through yet. If you've just paid, refresh this page in a minute." }, 402);
  }
  const items = (session.line_items && session.line_items.data) || [];
  const forThisProduct = items.some((item) => {
    const product = item.price && item.price.product;
    return product === env.STRIPE_PRODUCT_ID || (product && product.id === env.STRIPE_PRODUCT_ID);
  });
  if (!forThisProduct) return json({ ok: false, reason: 'This payment was for a different product.' }, 403);

  return json({ ok: true, key: await makeKey(env.LICENCE_SECRET, sessionId) });
}

async function verifyLicence(request, env) {
  if (request.method !== 'POST') return json({ ok: false, reason: 'Use POST.' }, 405);
  if (!env.LICENCE_SECRET) return json({ ok: false, reason: "Unlocking isn't set up yet." }, 503);
  let body = {};
  try { body = await request.json(); } catch (e) { /* treated as no key */ }
  const ok = await checkKey(env.LICENCE_SECRET, body.key);
  return json(ok ? { ok: true } : { ok: false, reason: "That key wasn't recognised. Check you copied all of it." });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/licence') return issueLicence(url, env);
    if (url.pathname === '/api/verify') return verifyLicence(request, env);
    // Google Search Console ownership check: must be served at exactly this address, with no redirect
    if (url.pathname === '/google7a4720d46a6fcf76.html') {
      return new Response('google-site-verification: google7a4720d46a6fcf76.html', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    return env.ASSETS.fetch(request);
  },
};
