import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { makeKey, checkKey } from '../worker.js';

const SECRET = 'test-secret';
const SESSION = 'cs_test_a1B2c3D4e5F6g7H8i9J0';
const env = {
  STRIPE_KEY: 'rk_test_fake',
  LICENCE_SECRET: SECRET,
  STRIPE_PRODUCT_ID: 'prod_ABC',
  ASSETS: { fetch: async () => new Response('asset') },
};

function stripeReplies(session, status = 200) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, auth: options.headers.Authorization });
    return new Response(JSON.stringify(session), { status });
  };
  return calls;
}

const paidSession = (product = 'prod_ABC', extra = {}) => ({
  id: SESSION,
  status: 'complete',
  payment_status: 'paid',
  line_items: { data: [{ price: { product } }] },
  ...extra,
});

async function call(path, init) {
  const response = await worker.fetch(new Request('https://example.com' + path, init), env);
  return { status: response.status, body: await response.json() };
}

test('keys look right, are the same every time, and check out', async () => {
  const key = await makeKey(SECRET, SESSION);
  assert.match(key, /^SF-([A-HJ-NP-Z2-9]{4}-){5}[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(await makeKey(SECRET, SESSION), key);
  assert.equal(await checkKey(SECRET, key), true);
  assert.equal(await checkKey(SECRET, key.toLowerCase().replace(/-/g, ' ')), true);
});

test('altered, made-up or other-secret keys fail', async () => {
  const key = await makeKey(SECRET, SESSION);
  const altered = key.slice(0, -1) + (key.endsWith('A') ? 'B' : 'A');
  assert.equal(await checkKey(SECRET, altered), false);
  assert.equal(await checkKey(SECRET, 'SF-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA'), false);
  assert.equal(await checkKey('other-secret', key), false);
  assert.equal(await checkKey(SECRET, ''), false);
  assert.equal(await checkKey(SECRET, undefined), false);
});

test('a paid session gets its key', async () => {
  const calls = stripeReplies(paidSession());
  const { status, body } = await call(`/api/licence?session_id=${SESSION}`);
  assert.equal(status, 200);
  assert.equal(body.key, await makeKey(SECRET, SESSION));
  assert.equal(calls[0].url, `https://api.stripe.com/v1/checkout/sessions/${SESSION}?expand[]=line_items`);
  assert.equal(calls[0].auth, 'Bearer rk_test_fake');
});

test('a free (100% off) order also gets a key', async () => {
  stripeReplies(paidSession('prod_ABC', { payment_status: 'no_payment_required' }));
  assert.equal((await call(`/api/licence?session_id=${SESSION}`)).body.ok, true);
});

test('an unpaid session gets no key', async () => {
  stripeReplies(paidSession('prod_ABC', { status: 'open', payment_status: 'unpaid' }));
  const { status, body } = await call(`/api/licence?session_id=${SESSION}`);
  assert.equal(status, 402);
  assert.equal(body.key, undefined);
});

test("someone else's product gets no key", async () => {
  stripeReplies(paidSession('prod_OTHER'));
  const { status, body } = await call(`/api/licence?session_id=${SESSION}`);
  assert.equal(status, 403);
  assert.equal(body.key, undefined);
});

test('an unknown session gets no key', async () => {
  stripeReplies({ error: { message: 'No such checkout.session' } }, 404);
  assert.equal((await call(`/api/licence?session_id=${SESSION}`)).status, 404);
});

test('nonsense session ids never reach Stripe', async () => {
  const calls = stripeReplies(paidSession());
  for (const bad of ['', 'abc', 'cs_live_../../v1/charges', 'pi_123456789012345']) {
    assert.equal((await call(`/api/licence?session_id=${encodeURIComponent(bad)}`)).status, 400);
  }
  assert.equal(calls.length, 0);
});

test('Stripe being down is reported, not crashed on', async () => {
  globalThis.fetch = async () => { throw new TypeError('network'); };
  assert.equal((await call(`/api/licence?session_id=${SESSION}`)).status, 502);
});

test('refuses to issue keys until set up', async () => {
  const response = await worker.fetch(new Request(`https://example.com/api/licence?session_id=${SESSION}`), { ASSETS: env.ASSETS });
  assert.equal(response.status, 503);
});

test('verify accepts real keys and rejects others', async () => {
  const key = await makeKey(SECRET, SESSION);
  const post = (k) => call('/api/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: k }) });
  assert.equal((await post(key)).body.ok, true);
  assert.equal((await post('SF-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA')).body.ok, false);
  assert.equal((await call('/api/verify', { method: 'POST', body: 'not json' })).body.ok, false);
});

test('everything else is the website', async () => {
  const response = await worker.fetch(new Request('https://example.com/'), env);
  assert.equal(await response.text(), 'asset');
});
