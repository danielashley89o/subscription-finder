/* Subscription Finder: the page. Statements are read in memory and never stored or sent anywhere.
   Only the user's choices (keep / cancel / hide) and free trials are remembered, in this browser. */
(function () {
  'use strict';

  const S = window.SubFinder;
  const Licence = window.SubFinderLicence;
  const config = window.SubFinderConfig;
  const DAY = S.DAY;
  const STORE = 'subfinder.v1';
  const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
  const fmtMoney = (n) => money.format(n);
  const fmtDate = (day, withYear) => new Date(day * DAY).toLocaleDateString('en-GB',
    { day: 'numeric', month: 'short', year: withYear ? 'numeric' : undefined, timeZone: 'UTC' });
  const today = () => Math.floor(Date.now() / DAY);
  const $ = (id) => document.getElementById(id);

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; }
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify({ statuses: state.statuses, trials: state.trials })); } catch (e) { /* private mode */ }
  }

  function isUnlocked() {
    try { return Licence.isUnlocked(window.localStorage); } catch (e) { return false; }
  }
  let unlocked = isUnlocked();

  const saved = load();
  const state = {
    files: [],
    transactions: [],
    seen: new Set(),
    result: null,
    statuses: saved.statuses || {},
    trials: saved.trials || [],
    pending: null,
    queue: [],
    // The sample statement can be explored in full for free; choices made on it aren't saved
    demo: false,
    demoStatuses: {},
  };

  // Builds elements without innerHTML, so text from a statement can never run as code
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  function showError(message) {
    const box = $('error');
    box.textContent = message;
    box.hidden = false;
  }
  function hideError() {
    $('error').hidden = true;
  }

  // ---------- Adding statements ----------

  const txKey = (t) => `${t.day}|${t.description}|${t.amount}`;

  // Overlapping statements share transactions; keep each one once
  function addTransactions(name, transactions) {
    const fresh = transactions.filter((t) => !state.seen.has(txKey(t)));
    fresh.forEach((t) => state.seen.add(txKey(t)));
    state.transactions.push(...fresh);
    state.files.push({ name, count: fresh.length });
  }

  async function addFiles(files) {
    hideError();
    // Using your own statement is the paid part
    if (!isUnlocked()) { showPaywall(); return; }
    state.queue = Array.from(files);
    await processQueue();
  }

  async function processQueue() {
    while (state.queue.length) {
      const file = state.queue.shift();
      let text;
      try {
        text = S.decode(await file.arrayBuffer());
      } catch (e) {
        showError(`Couldn't open ${file.name}.`);
        continue;
      }
      const read = S.readStatement(text);
      if (read.mapping && read.transactions.length) {
        addTransactions(file.name, read.transactions);
        continue;
      }
      if (read.rows.length < 2) {
        showError(`${file.name} doesn't look like a bank statement. Make sure you downloaded it as CSV.`);
        continue;
      }
      // Couldn't tell which column is which: ask, then carry on with the rest
      state.pending = { name: file.name, rows: read.rows };
      renderMapping();
      return;
    }
    if (state.transactions.length) analyse();
  }

  function renderMapping() {
    const { name, rows } = state.pending;
    const panel = $('mapping');
    const width = Math.max(...rows.slice(0, 10).map((r) => r.length));
    const firstIsHeader = !rows[0].some((c) => S.parseDate(c) !== null);
    const labels = Array.from({ length: width }, (_, i) =>
      firstIsHeader && rows[0][i] ? rows[0][i] : `Column ${i + 1}`);
    const choose = (id, label) => h('label', { class: 'field' }, label,
      h('select', { id }, labels.map((l, i) => h('option', { value: String(i) }, l))));
    const preview = rows.slice(0, 6).map((r) =>
      h('tr', {}, Array.from({ length: width }, (_, i) => h('td', {}, String(r[i] || '').slice(0, 40)))));

    panel.replaceChildren(
      h('h2', {}, `Which column is which in ${name}?`),
      h('p', {}, "We couldn't work out this file's layout on our own. Here are its first few rows:"),
      h('div', { class: 'table-scroll' }, h('table', { class: 'preview' }, h('tbody', {}, preview))),
      h('div', { class: 'fields' },
        choose('map-date', 'Date'),
        choose('map-desc', 'Description'),
        choose('map-amount', 'Amount (or money out)')),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'primary', onclick: applyMapping }, 'Read this file'),
        h('button', { type: 'button', class: 'link', onclick: skipMapping }, 'Skip this file')));
    // Sensible starting guesses
    const guess = (pattern, fallback) => {
      const i = labels.findIndex((l) => pattern.test(l.toLowerCase()));
      return String(i === -1 ? Math.min(fallback, width - 1) : i);
    };
    panel.querySelector('#map-date').value = guess(/date/, 0);
    panel.querySelector('#map-desc').value = guess(/desc|name|payee|merchant|details|memo/, 1);
    panel.querySelector('#map-amount').value = guess(/amount|value|out|debit/, 2);
    panel.hidden = false;
  }

  function applyMapping() {
    const mapping = {
      headerRow: -1,
      date: +$('map-date').value,
      description: +$('map-desc').value,
      amount: +$('map-amount').value,
    };
    const transactions = S.toTransactions(state.pending.rows, mapping);
    if (!transactions.length) {
      showError("We still couldn't find any payments with those columns. Check the date and amount columns and try again.");
      return;
    }
    hideError();
    addTransactions(state.pending.name, transactions);
    state.pending = null;
    $('mapping').hidden = true;
    processQueue();
  }

  function skipMapping() {
    state.pending = null;
    $('mapping').hidden = true;
    processQueue();
  }

  function analyse() {
    state.result = S.findRecurring(state.transactions);
    $('start').hidden = true;
    $('results').hidden = false;
    renderResults();
    window.scrollTo(0, 0);
  }

  function startOver() {
    Object.assign(state, { files: [], transactions: [], seen: new Set(), result: null, pending: null, queue: [], demo: false, demoStatuses: {} });
    $('results').hidden = true;
    $('results').replaceChildren();
    $('start').hidden = false;
    $('file').value = '';
  }

  // ---------- Results ----------

  const statuses = () => (state.demo ? state.demoStatuses : state.statuses);
  const statusOf = (item) => statuses()[item.id];
  const sumYearly = (list) => list.reduce((total, i) => total + (i.yearly || 0), 0);

  function setStatus(item, value) {
    const map = statuses();
    if (map[item.id] === value) delete map[item.id];
    else map[item.id] = value;
    if (!state.demo) save();
    renderResults();
  }

  function renderResults() {
    unlocked = isUnlocked();
    const root = $('results');
    const { items, dataStart, dataEnd, count } = state.result;
    const shown = items.filter((i) => statusOf(i) !== 'ignore');
    const subs = shown.filter((i) => i.status === 'active' && i.category !== 'bill');
    const bills = shown.filter((i) => i.status === 'active' && i.category === 'bill');
    const check = shown.filter((i) => i.status === 'once');
    const stopped = shown.filter((i) => i.status === 'stopped');
    const hidden = items.filter((i) => statusOf(i) === 'ignore');
    const cancelling = subs.concat(bills).filter((i) => statusOf(i) === 'cancel');
    const savings = sumYearly(cancelling);
    const months = Math.max(1, Math.round((dataEnd - dataStart) / 30.44));

    const subsTotal = sumYearly(subs);
    const parts = [
      state.demo ? h('div', { class: 'demo-banner' },
        h('p', {}, h('b', {}, 'This is a sample statement'), ' with made-up payments, so you can try everything. ',
          unlocked ? 'Ready for yours?' : `Use your own statement for ${config.price}, once.`),
        unlocked
          ? h('button', { type: 'button', class: 'primary', onclick: () => { startOver(); requestFiles(); } }, 'Use my own statement')
          : h('a', { class: 'primary button', href: 'unlock.html', target: '_blank', rel: 'noopener' }, `Unlock for ${config.price}`)) : null,

      h('div', { class: 'results-head' },
        h('p', { class: 'covers' },
          `${fmtDate(dataStart, true)} to ${fmtDate(dataEnd, true)} · ${count.toLocaleString('en-GB')} payments checked`),
        h('div', { class: 'row' },
          state.demo ? null : h('button', { type: 'button', class: 'secondary', onclick: requestFiles }, 'Add another statement'),
          h('button', { type: 'button', class: 'link', onclick: startOver }, 'Start over'))),

      months < 11 ? h('p', { class: 'notice' },
        `This covers about ${months} month${months === 1 ? '' : 's'}. Add more statements to catch yearly renewals.`) : null,

      h('div', { class: 'tiles' },
        h('div', { class: 'tile tile-main' },
          h('span', { class: 'tile-label' }, 'Subscriptions'),
          h('span', { class: 'tile-value' }, fmtMoney(subsTotal), h('small', {}, ' a year')),
          h('span', { class: 'tile-sub' }, `${fmtMoney(subsTotal / 12)} a month · ${subs.length} active`)),
        h('div', { class: 'tile' },
          h('span', { class: 'tile-label' }, 'Bills'),
          h('span', { class: 'tile-value' }, fmtMoney(sumYearly(bills)), h('small', {}, ' a year')),
          h('span', { class: 'tile-sub' }, `${bills.length} regular bill${bills.length === 1 ? '' : 's'}`)),
        h('div', { class: savings ? 'tile tile-save' : 'tile' },
          h('span', { class: 'tile-label' }, 'You could save'),
          h('span', { class: 'tile-value' }, fmtMoney(savings), h('small', {}, ' a year')),
          h('span', { class: 'tile-sub' }, savings
            ? `by cancelling ${cancelling.length}`
            : 'Mark anything you don\u2019t need as \u201cCancel it\u201d'))),

      section('Subscriptions', subs, 'No regular subscriptions found in this statement.'),
      check.length ? section('Worth checking', check, null,
        'Charged once. These could be yearly renewals, or something new that will repeat.') : null,
      collapsible(`Bills (${bills.length})`, bills),
      collapsible(`Looks cancelled (${stopped.length})`, stopped,
        'These used to charge you regularly but have stopped.'),
      hidden.length ? collapsible(`Hidden (${hidden.length})`, hidden, 'You said these aren\u2019t subscriptions.') : null,
    ];

    // Free trials and reminders only make sense for someone's own statement
    if (state.demo) parts.push(demoOffer());
    else parts.push(trialsSection(), remindersSection());
    root.replaceChildren(...parts.filter(Boolean));
  }

  function demoOffer() {
    return h('section', { class: 'locked' },
      h('h2', {}, unlocked ? 'Now try your own statement' : `Find your own subscriptions for ${config.price}`),
      h('ul', { class: 'locked-list' },
        h('li', {}, 'Every subscription and bill in your own statement'),
        h('li', {}, 'Free-trial tracking'),
        h('li', {}, 'Calendar reminders before anything renews'),
        h('li', {}, 'Your statement never leaves your device')),
      unlocked
        ? h('button', { type: 'button', class: 'primary', onclick: () => { startOver(); requestFiles(); } }, 'Use my own statement')
        : h('div', { class: 'row' },
          h('a', { class: 'primary button', href: 'unlock.html', target: '_blank', rel: 'noopener' }, `Unlock for ${config.price}`),
          h('span', { class: 'muted small' }, 'One payment, no subscription. Opens in a new tab.')));
  }

  function section(title, list, emptyText, intro) {
    return h('section', { class: 'group' },
      h('h2', {}, title),
      intro ? h('p', { class: 'muted' }, intro) : null,
      list.length ? h('ul', { class: 'cards' }, list.map(card)) : h('p', { class: 'muted' }, emptyText));
  }

  function collapsible(title, list, intro) {
    if (!list.length) return null;
    return h('details', { class: 'group' },
      h('summary', {}, h('h2', {}, title)),
      intro ? h('p', { class: 'muted' }, intro) : null,
      h('ul', { class: 'cards' }, list.map(card)));
  }

  function card(item) {
    const status = statusOf(item);
    const when = item.status === 'active' ? `${item.cadence.label} · next ${fmtDate(item.nextDay)}`
      : item.status === 'stopped' ? `${item.cadence.label} · last charged ${fmtDate(item.lastDay, true)}`
      : `Charged on ${fmtDate(item.lastDay, true)}`;

    const badges = [];
    if (item.category === 'other') badges.push(h('span', { class: 'badge' }, 'Regular payment'));
    if (item.priceChange) {
      const up = item.priceChange.to > item.priceChange.from;
      badges.push(h('span', { class: up ? 'badge badge-warn' : 'badge' },
        `Price went ${up ? 'up' : 'down'} from ${fmtMoney(item.priceChange.from)}`));
    }
    if (item.confidence === 'medium') badges.push(h('span', { class: 'badge' }, `Likely · ${item.count} charges so far`));

    const choice = (value, label) => h('button', {
      type: 'button',
      class: `choice choice-${value}`,
      'aria-pressed': status === value ? 'true' : 'false',
      onclick: () => setStatus(item, value),
    }, label);

    let actions = null;
    if (status === 'ignore') {
      actions = h('div', { class: 'actions' }, h('button', { type: 'button', class: 'link', onclick: () => setStatus(item, 'ignore') }, 'Show it again'));
    } else if (item.status !== 'stopped') {
      actions = h('div', { class: 'actions' },
        choice('keep', 'Keep'), choice('cancel', 'Cancel it'), choice('ignore', 'Not a subscription'));
    }

    return h('li', { class: `card${status ? ' is-' + status : ''}` },
      h('div', { class: 'card-main' },
        h('div', { class: 'card-name' },
          h('strong', {}, item.name),
          h('span', { class: 'card-when' }, when)),
        h('div', { class: 'card-price' },
          h('strong', {}, fmtMoney(item.amount)),
          item.yearly ? h('span', {}, `${fmtMoney(item.yearly)} a year`) : null)),
      badges.length ? h('div', { class: 'badges' }, badges) : null,
      status === 'cancel' && item.yearly
        ? h('p', { class: 'saving' }, `Cancelling saves ${fmtMoney(item.yearly)} a year.`) : null,
      actions,
      h('details', { class: 'charges' },
        h('summary', {}, `${item.count} charge${item.count === 1 ? '' : 's'}`),
        h('ul', {}, item.charges.slice().reverse().map((c) =>
          h('li', {}, h('span', {}, fmtDate(c.day, true)), h('span', { class: 'desc' }, c.description), h('span', {}, fmtMoney(c.amount)))))));
  }

  // ---------- Free trials ----------

  function trialsSection() {
    const nameInput = h('input', { type: 'text', id: 'trial-name', placeholder: 'e.g. Audible', required: true, maxlength: '60' });
    const dateInput = h('input', { type: 'date', id: 'trial-date', required: true });
    const priceInput = h('input', { type: 'number', id: 'trial-price', placeholder: '7.99', min: '0', step: '0.01', inputmode: 'decimal' });

    const add = (e) => {
      e.preventDefault();
      const [y, m, d] = dateInput.value.split('-').map(Number);
      if (!nameInput.value.trim() || !y) return;
      state.trials.push({
        id: String(Date.now()),
        name: nameInput.value.trim(),
        endDay: Date.UTC(y, m - 1, d) / DAY,
        price: priceInput.value ? Number(priceInput.value) : null,
      });
      state.trials.sort((a, b) => a.endDay - b.endDay);
      save();
      renderResults();
    };
    const remove = (trial) => () => {
      state.trials = state.trials.filter((t) => t.id !== trial.id);
      save();
      renderResults();
    };

    return h('section', { class: 'group' },
      h('h2', {}, 'Free trials'),
      h('p', { class: 'muted' }, 'Free trials don\u2019t show on a statement until they start charging. Add yours here and include them in your reminders.'),
      state.trials.length ? h('ul', { class: 'trials' }, state.trials.map((t) =>
        h('li', {},
          h('span', {}, h('strong', {}, t.name), ' ',
            t.endDay < today() ? `ended ${fmtDate(t.endDay)}` : `ends ${fmtDate(t.endDay)}`,
            t.price != null ? ` · then ${fmtMoney(t.price)}` : ''),
          h('button', { type: 'button', class: 'link', onclick: remove(t) }, 'Remove')))) : null,
      h('form', { class: 'trial-form', onsubmit: add },
        h('label', { class: 'field' }, 'Name', nameInput),
        h('label', { class: 'field' }, 'Trial ends', dateInput),
        h('label', { class: 'field' }, 'Price after (£)', priceInput),
        h('button', { type: 'submit', class: 'secondary' }, 'Add trial')));
  }

  // ---------- Calendar reminders ----------

  function reminderEvents() {
    const now = today();
    const events = [];
    const remindOn = (chargeDay, daysBefore) => Math.max(chargeDay - daysBefore, now);
    for (const item of state.result.items) {
      const status = statusOf(item);
      if (status === 'ignore' || item.status === 'stopped') continue;
      if (status === 'cancel') {
        const charge = item.nextDay || item.lastDay + 365;
        if (charge < now) continue;
        events.push({
          uid: item.id,
          day: remindOn(charge, 3),
          summary: `Cancel ${item.name} before it renews (${fmtMoney(item.amount)})`,
          description: `${item.name} is due to charge ${fmtMoney(item.amount)} ${item.nextDay ? 'on' : 'around'} ${fmtDate(charge, true)}. You marked it to cancel.`,
        });
      } else if (item.cadence && item.cadence.id === 'yearly' && item.nextDay >= now) {
        events.push({
          uid: item.id,
          day: remindOn(item.nextDay, 7),
          summary: `${item.name} renews soon (${fmtMoney(item.amount)})`,
          description: `${item.name} renews on ${fmtDate(item.nextDay, true)} for ${fmtMoney(item.amount)}.`,
        });
      }
    }
    for (const trial of state.trials) {
      if (trial.endDay < now) continue;
      const price = trial.price != null ? fmtMoney(trial.price) : 'money';
      events.push({
        uid: `trial-${trial.id}`,
        day: remindOn(trial.endDay, 2),
        summary: `Free trial ending: ${trial.name}`,
        description: `${trial.name} starts charging ${price} on ${fmtDate(trial.endDay, true)}. Cancel before then if you don't want it.`,
      });
    }
    return events.sort((a, b) => a.day - b.day);
  }

  function toICS(events) {
    const esc = (s) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
    const ymd = (day) => new Date(day * DAY).toISOString().slice(0, 10).replace(/-/g, '');
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    // Calendar files wrap long lines
    const fold = (line) => {
      const parts = [];
      for (let i = 0; i < line.length; i += 60) parts.push((i ? ' ' : '') + line.slice(i, i + 60));
      return parts.join('\r\n');
    };
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Subscription Finder//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    for (const e of events) {
      lines.push('BEGIN:VEVENT',
        `UID:${e.uid.replace(/[^A-Za-z0-9-]/g, '')}-${ymd(e.day)}@subscription-finder`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${ymd(e.day)}`,
        `DTEND;VALUE=DATE:${ymd(e.day + 1)}`,
        `SUMMARY:${esc(e.summary)}`,
        `DESCRIPTION:${esc(e.description)}`,
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.summary)}`, 'TRIGGER:PT9H', 'END:VALARM',
        'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function remindersSection() {
    const events = reminderEvents();
    return h('section', { class: 'group remind' },
      h('h2', {}, 'Reminders'),
      h('p', {}, 'Get a calendar reminder a few days before anything you\u2019ve marked ',
        h('b', {}, 'Cancel it'), ' renews, before free trials end, and a week before yearly renewals.'),
      h('button', {
        type: 'button',
        class: 'primary',
        disabled: events.length === 0,
        onclick: () => download('subscription-reminders.ics', toICS(events), 'text/calendar'),
      }, events.length ? `Add ${events.length} reminder${events.length === 1 ? '' : 's'} to my calendar` : 'No reminders yet'),
      h('p', { class: 'muted small' },
        'This downloads a calendar file. Open it to add the reminders to Apple Calendar, Google Calendar or Outlook. Nothing is sent anywhere.'));
  }

  // ---------- Start-up ----------

  const drop = $('drop');
  const input = $('file');

  function showPaywall() {
    const box = $('paywall');
    box.hidden = false;
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Opens the file chooser, or explains the price first
  function requestFiles() {
    if (isUnlocked()) input.click();
    else showPaywall();
  }

  document.querySelectorAll('[data-price]').forEach((el) => { el.textContent = config.price; });
  $('paywall-sample').addEventListener('click', () => { $('paywall').hidden = true; loadSample(); });
  input.addEventListener('change', () => { if (input.files.length) addFiles(input.files); });
  // The drop zone is a label for the file input; stop it opening the chooser while locked
  drop.addEventListener('click', (e) => { if (!isUnlocked()) { e.preventDefault(); showPaywall(); } });
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); requestFiles(); }
  });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  });
  function loadSample() {
    startOver();
    state.demo = true;
    const read = S.readStatement(window.SubFinderSample.statementCSV());
    addTransactions('Sample statement', read.transactions);
    analyse();
  }
  $('sample').addEventListener('click', loadSample);
  // A link to the page with #demo opens straight on the sample
  if (location.hash === '#demo') loadSample();

  // Unlocking happens in another tab; update this one as soon as it does
  function refreshLock() {
    const now = isUnlocked();
    $('unlock-link').hidden = now;
    drop.classList.toggle('is-locked', !now);
    $('drop-lock').hidden = now;
    if (now) $('paywall').hidden = true;
    if (now !== unlocked && state.result) renderResults();
    unlocked = now;
  }
  window.addEventListener('storage', (e) => { if (e.key === Licence.STORE) refreshLock(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshLock(); });
  refreshLock();

  // Lets the app install to a home screen and work offline (only when served from a website)
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Exposed for testing in the browser console
  window.SubFinderApp = { state, toICS, reminderEvents };
})();
