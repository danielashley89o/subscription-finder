/* Subscription Finder: the unlock page. */
(function () {
  'use strict';

  const config = window.SubFinderConfig;
  const Licence = window.SubFinderLicence;
  const $ = (id) => document.getElementById(id);

  function storage() {
    try { return window.localStorage; } catch (e) { return null; }
  }

  document.querySelectorAll('[data-price]').forEach((el) => { el.textContent = config.price; });

  if (config.checkoutUrl) {
    $('buy').href = config.checkoutUrl;
  } else {
    $('buy').hidden = true;
    $('buy-missing').hidden = false;
  }

  function say(text, kind) {
    const box = $('message');
    box.replaceChildren(...(Array.isArray(text) ? text : [text]));
    box.className = `message message-${kind}`;
    box.hidden = false;
  }

  function goToApp() {
    const back = document.createElement('a');
    back.href = 'index.html';
    back.textContent = 'Go to the app';
    return back;
  }

  const saved = storage() && Licence.savedKey(storage());
  if (saved) say(['This browser is already unlocked. ', goToApp()], 'ok');

  // ---------- Coming back from Stripe ----------

  const sessionId = new URLSearchParams(location.search).get('session_id');
  if (sessionId) {
    // Keep the payment reference out of the address bar, history and screenshots
    history.replaceState(null, '', location.pathname);
    $('shop').hidden = true;
    $('after-payment').hidden = false;
    Licence.claim(sessionId).then((result) => {
      if (!result.ok) {
        $('after-title').textContent = 'We couldn’t unlock it yet';
        $('after-message').textContent = result.reason;
        $('shop').hidden = false;
        return;
      }
      const stored = storage() && Licence.remember(storage(), result.key);
      $('after-title').textContent = 'Thank you! You’re unlocked.';
      $('after-message').textContent = stored
        ? 'If you have the app open in another tab, it has already updated.'
        : 'This browser won’t let the app remember your key (private browsing can do this). Copy it below and enter it in a normal window.';
      $('key-text').textContent = result.key;
      $('key-box').hidden = false;
    });
  }

  $('copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('key-text').textContent);
      $('copy').textContent = 'Copied';
    } catch (e) {
      // Clipboard blocked: select the text so it can be copied by hand
      const range = document.createRange();
      range.selectNodeContents($('key-text'));
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
  });

  // ---------- Typing in a key ----------

  $('unlock-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = e.target.querySelector('button');
    button.disabled = true;
    say('Checking your key…', 'info');
    const result = await Licence.verify($('key').value);
    button.disabled = false;
    if (!result.ok) {
      say(result.reason, 'error');
      return;
    }
    if (!storage() || !Licence.remember(storage(), $('key').value)) {
      say("Your key is valid, but this browser won't let the app remember it (private browsing can do this). Open the app in a normal window and unlock again.", 'error');
      return;
    }
    say(['Unlocked. If you have the app open in another tab, it has already updated. ', goToApp()], 'ok');
  });
})();
