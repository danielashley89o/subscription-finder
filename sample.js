/* A made-up year of bank transactions, so people can try the app before using their own statement. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SubFinderSample = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAY = 86400000;

  // Same "random" numbers every time, so the sample and the tests never change
  function seeded(seed) {
    return function () {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
  }

  function fmt(day) {
    const d = new Date(day * DAY);
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getUTCFullYear()}`;
  }

  // Monthly charges on a fixed day of the month, from `startMonth` months ago to `endMonth` months ago
  function monthly(today, dayOfMonth, startMonth, endMonth, fn) {
    const t = new Date(today * DAY);
    for (let back = startMonth; back >= endMonth; back--) {
      const y = t.getUTCFullYear();
      const m = t.getUTCMonth() - back;
      const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      const day = Date.UTC(y, m, Math.min(dayOfMonth, last)) / DAY;
      if (day <= today) fn(day, back);
    }
  }

  function statementCSV(todayMs) {
    const today = Math.floor((todayMs || Date.now()) / DAY);
    const rand = seeded(20261014);
    const rows = [];
    const add = (day, description, amount) => rows.push([day, description, amount]);

    monthly(today, 25, 12, 0, (d) => add(d, 'ACME SUPPLIES LTD SALARY', 2150));
    monthly(today, 1, 12, 0, (d) => add(d, 'SO HARBOUR LETTINGS RENT', -850));
    monthly(today, 3, 12, 0, (d) => add(d, 'NETFLIX.COM', -12.99));
    monthly(today, 9, 12, 0, (d) => add(d, 'SPOTIFY P2F8A91C3D', -11.99));
    monthly(today, 14, 12, 0, (d, back) => add(d, 'DISNEY PLUS', back > 5 ? -4.99 : -5.99));
    monthly(today, 17, 12, 0, (d) => add(d, 'APPLE.COM/BILL', -2.99));
    monthly(today, 22, 12, 0, (d) => add(d, 'APPLE.COM/BILL', -10.99));
    monthly(today, 2, 12, 0, (d) => add(d, 'DD PUREGYM LTD', -27.99));
    monthly(today, 11, 12, 0, (d) => add(d, 'OPENAI *CHATGPT SUBSCR', -20));
    monthly(today, 6, 12, 0, (d) => add(d, 'CLOUDNEST HOSTING', -4.5));
    monthly(today, 5, 12, 0, (d) => add(d, 'DD OCTOPUS ENERGY', -96));
    monthly(today, 20, 12, 0, (d) => add(d, 'DD EE LIMITED', -20));
    monthly(today, 15, 12, 0, (d) => add(d, 'TV LICENCE MBP', -14.54));
    monthly(today, 1, 12, 0, (d, back) => {
      const month = new Date(d * DAY).getUTCMonth();
      if (month >= 3 || month === 0) add(d, 'DD LEEDS CITY COUNCIL', -142);
    });
    monthly(today, 19, 12, 9, (d) => add(d, 'NOW TV ENTERTAINMENT', -9.99));
    monthly(today, 27, 2, 0, (d) => add(d, 'AUDIBLE UK ADBL', -7.99));
    monthly(today, 8, 4, 4, (d) => add(d, 'AMAZON PRIME*2K3LS9QX', -95));

    // Everyday spending, which should never show up as a subscription
    const start = today - 365;
    for (let d = start; d <= today; d++) {
      if (rand() < 0.3) add(d, 'TESCO STORES 2231', -(8 + rand() * 82));
      if (rand() < 0.15) add(d, 'PRET A MANGER', -(3.2 + rand() * 6));
      if (rand() < 0.25) add(d, 'TFL TRAVEL CH', -(1.75 + rand() * 6));
      if (rand() < 0.06) add(d, 'AMZNMKTPLACE*' + Math.floor(rand() * 1e6).toString(36).toUpperCase(), -(6 + rand() * 40));
      if (rand() < 0.05) add(d, 'DELIVEROO', -(14 + rand() * 18));
      if (rand() < 0.03) add(d, 'CASH WITHDRAWAL LNK', -(20 + Math.floor(rand() * 4) * 10));
    }

    rows.sort((a, b) => b[0] - a[0]);
    const lines = ['Date,Description,Amount'];
    for (const [day, description, amount] of rows) {
      lines.push(`${fmt(day)},"${description}",${amount.toFixed(2)}`);
    }
    return lines.join('\n');
  }

  return { statementCSV };
});
