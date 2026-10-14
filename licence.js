/* Subscription Finder: getting and checking licence keys, from the unlock page only.
   It talks to this website's own server (worker.js), which checks payments with Stripe. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SubFinderLicence = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STORE = 'subfinder.licence';
  const OFFLINE = "Couldn't reach the server. Check your internet connection and try again.";

  async function ask(fetchImpl, url, options) {
    let response;
    try {
      response = await (fetchImpl || fetch)(url, options);
    } catch (e) {
      return { ok: false, reason: OFFLINE };
    }
    try {
      const data = await response.json();
      if (data && typeof data.ok === 'boolean') return data;
    } catch (e) { /* handled below */ }
    return { ok: false, reason: 'Something went wrong on our side. Try again in a minute.' };
  }

  // After paying, Stripe sends people back with their payment's session id
  function claim(sessionId, fetchImpl) {
    return ask(fetchImpl, '/api/licence?session_id=' + encodeURIComponent(sessionId), { headers: { Accept: 'application/json' } });
  }

  async function verify(rawKey, fetchImpl) {
    const key = String(rawKey || '').trim();
    if (!/^[A-Za-z0-9 -]{20,40}$/.test(key)) {
      return { ok: false, reason: "That doesn't look like a licence key. It starts with SF- and has six groups of four letters and numbers." };
    }
    return ask(fetchImpl, '/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ key }),
    });
  }

  function isUnlocked(storage) {
    try {
      const saved = JSON.parse(storage.getItem(STORE));
      return !!(saved && saved.key);
    } catch (e) {
      return false;
    }
  }

  function savedKey(storage) {
    try {
      const saved = JSON.parse(storage.getItem(STORE));
      return (saved && saved.key) || null;
    } catch (e) {
      return null;
    }
  }

  function remember(storage, key) {
    try {
      storage.setItem(STORE, JSON.stringify({ key: String(key).trim(), unlockedAt: new Date().toISOString() }));
      return true;
    } catch (e) {
      return false;
    }
  }

  return { STORE, claim, verify, isUnlocked, savedKey, remember };
});
