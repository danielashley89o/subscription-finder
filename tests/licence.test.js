const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../licence.js');

const KEY = 'SF-ABCD-EFGH-JKLM-NPQR-STUV-WXYZ';

function reply(body) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { json: async () => body };
  };
  return { calls, fetchImpl };
}

test('claims a key with the payment session id', async () => {
  const { calls, fetchImpl } = reply({ ok: true, key: KEY });
  const result = await L.claim('cs_test_abc123', fetchImpl);
  assert.deepEqual(result, { ok: true, key: KEY });
  assert.equal(calls[0].url, '/api/licence?session_id=cs_test_abc123');
});

test('passes on the server’s reason when a claim fails', async () => {
  const { fetchImpl } = reply({ ok: false, reason: "This payment hasn't gone through yet." });
  assert.deepEqual(await L.claim('cs_test_abc123', fetchImpl), { ok: false, reason: "This payment hasn't gone through yet." });
});

test('verifies a key with this site’s server only', async () => {
  const { calls, fetchImpl } = reply({ ok: true });
  assert.deepEqual(await L.verify(`  ${KEY}\n`, fetchImpl), { ok: true });
  assert.equal(calls[0].url, '/api/verify');
  assert.deepEqual(JSON.parse(calls[0].options.body), { key: KEY });
});

test('rejects text that is not a key without contacting the server', async () => {
  const { calls, fetchImpl } = reply({ ok: true });
  const result = await L.verify('my order number is 1234!', fetchImpl);
  assert.equal(result.ok, false);
  assert.equal(calls.length, 0);
});

test('explains when offline', async () => {
  const result = await L.verify(KEY, async () => { throw new TypeError('Failed to fetch'); });
  assert.match(result.reason, /internet connection/);
});

test('copes with a broken server reply', async () => {
  const result = await L.verify(KEY, async () => ({ json: async () => { throw new SyntaxError('bad'); } }));
  assert.equal(result.ok, false);
});

test('remembers the unlock and the key', () => {
  const data = {};
  const storage = { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
  assert.equal(L.isUnlocked(storage), false);
  assert.equal(L.remember(storage, KEY), true);
  assert.equal(L.isUnlocked(storage), true);
  assert.equal(L.savedKey(storage), KEY);
});

test('copes with blocked storage', () => {
  const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(L.isUnlocked(blocked), false);
  assert.equal(L.remember(blocked, KEY), false);
  assert.equal(L.savedKey(blocked), null);
});
