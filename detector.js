/* Subscription Finder: reads bank statement CSVs and finds regular payments.
   Runs entirely on the user's device (and in Node for the tests). Nothing is sent anywhere. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SubFinder = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAY = 86400000;

  // ---------- Reading the file ----------

  // Most banks export UTF-8, but some (Nationwide, older Lloyds) use Windows-1252
  function decode(buffer) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch (e) {
      return new TextDecoder('windows-1252').decode(buffer);
    }
  }

  function detectDelimiter(text) {
    const sample = text.split(/\r?\n/).slice(0, 20).join('\n');
    const counts = { ',': 0, ';': 0, '\t': 0 };
    for (const ch of sample) if (ch in counts) counts[ch]++;
    return Object.keys(counts).reduce((a, b) => (counts[b] > counts[a] ? b : a));
  }

  function parseCSV(text, delimiter) {
    text = text.replace(/^\uFEFF/, '');
    const d = delimiter || detectDelimiter(text);
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    const endRow = () => {
      row.push(field);
      field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row.map((f) => f.trim()));
      row = [];
    };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
        } else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === d) { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        endRow();
      } else field += c;
    }
    endRow();
    return rows;
  }

  // ---------- Dates and amounts ----------

  const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

  // Dates are whole days since 1970, so time zones and clock changes never matter
  function makeDay(y, m, d) {
    if (y < 100) y += 2000;
    if (m < 0 || m > 11 || d < 1 || d > 31) return null;
    const t = Date.UTC(y, m, d);
    if (new Date(t).getUTCDate() !== d) return null;
    return t / DAY;
  }

  // order: 'dmy' (UK) or 'mdy' (US) for dates like 03/04/2026
  function parseDate(s, order) {
    if (!s) return null;
    s = String(s).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return makeDay(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/);
    if (m) {
      const [day, month] = order === 'mdy' ? [+m[2], +m[1]] : [+m[1], +m[2]];
      return makeDay(+m[3], month - 1, day);
    }
    m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s\-]([A-Za-z]+)[\s\-,]+(\d{2,4})\b/);
    if (m && MONTHS[m[2].slice(0, 3).toLowerCase()] !== undefined) {
      return makeDay(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]);
    }
    m = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})\b/);
    if (m && MONTHS[m[1].slice(0, 3).toLowerCase()] !== undefined) {
      return makeDay(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]);
    }
    return null;
  }

  // UK banks write 03/04/2026 day first; only switch if the data proves otherwise
  function guessDateOrder(values) {
    let dmy = false;
    let mdy = false;
    for (const v of values) {
      const m = String(v || '').trim().match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-]\d{2,4}/);
      if (!m) continue;
      if (+m[1] > 12) dmy = true;
      if (+m[2] > 12) mdy = true;
    }
    return mdy && !dmy ? 'mdy' : 'dmy';
  }

  function parseAmount(s) {
    if (s == null) return null;
    let t = String(s).trim();
    if (!t) return null;
    let negative = false;
    if (/^\(.*\)$/.test(t)) { negative = true; t = t.slice(1, -1); }
    if (/\s*DR$/i.test(t)) { negative = !negative; t = t.replace(/\s*DR$/i, ''); }
    t = t.replace(/\s*CR$/i, '');
    t = t.replace(/GBP|[£$€\s,\u00a0\ufffd]/gi, '');
    if (t.startsWith('+')) t = t.slice(1);
    if (t.startsWith('-')) { negative = !negative; t = t.slice(1); }
    if (t.endsWith('-')) { negative = !negative; t = t.slice(0, -1); }
    if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null;
    const v = parseFloat(t);
    return negative ? -v : v;
  }

  // ---------- Working out which column is which ----------

  const HEADER_PATTERNS = {
    date: [/^completed date$/, /^transaction date$/, /^posting date$/, /^posted date$/, /^date$/, /date/],
    description: [/^name$/, /^description$/, /^transaction description$/, /^counter ?party$/, /^merchant/, /^payee/,
      /^memo$/, /^details?$/, /^narrative$/, /description/, /^transaction$/, /^reference$/],
    amount: [/^amount$/, /^amount \(gbp\)$/, /^value$/, /^amount/, /^billing amount/, /^transaction amount/],
    debit: [/^paid out$/, /^money out$/, /^debit amount$/, /^debits?$/, /^withdrawals?$/, /^out$/, /debit|paid out|money out/],
    credit: [/^paid in$/, /^money in$/, /^credit amount$/, /^credits?$/, /^deposits?$/, /^in$/, /credit|paid in|money in/],
  };

  function matchHeaders(cells) {
    const names = cells.map((c) => String(c || '').toLowerCase().replace(/\s+/g, ' ').trim());
    const found = {};
    const used = new Set();
    for (const role of ['date', 'amount', 'debit', 'credit', 'description']) {
      let best = null;
      for (let i = 0; i < names.length; i++) {
        if (used.has(i) || !names[i]) continue;
        const rank = HEADER_PATTERNS[role].findIndex((re) => re.test(names[i]));
        if (rank !== -1 && (best === null || rank < best.rank)) best = { i, rank };
      }
      if (best) { found[role] = best.i; used.add(best.i); }
    }
    return found;
  }

  // Returns { headerRow, date, description, amount?, debit?, credit? } or null
  function detectColumns(rows) {
    for (let r = 0; r < Math.min(rows.length, 25); r++) {
      const cells = rows[r];
      // A header row is words, not data
      if (cells.some((c) => parseDate(c) !== null)) continue;
      const f = matchHeaders(cells);
      if (f.date !== undefined && f.description !== undefined && (f.amount !== undefined || f.debit !== undefined)) {
        return Object.assign({ headerRow: r, columns: cells }, f);
      }
    }
    return inferColumns(rows);
  }

  // No header row (HSBC, First Direct): guess from what the cells contain
  function inferColumns(rows) {
    const sample = rows.slice(0, 60);
    const width = Math.max(...sample.map((r) => r.length));
    if (!isFinite(width) || width < 2) return null;
    const stats = [];
    for (let c = 0; c < width; c++) {
      let dates = 0, numbers = 0, textLen = 0, texts = 0;
      for (const row of sample) {
        const v = row[c];
        if (v == null || v === '') continue;
        if (parseDate(v) !== null) dates++;
        else if (parseAmount(v) !== null) numbers++;
        else { texts++; textLen += v.length; }
      }
      stats.push({ c, dates, numbers, texts, avgText: texts ? textLen / texts : 0 });
    }
    const dateCol = stats.slice().sort((a, b) => b.dates - a.dates)[0];
    if (!dateCol || dateCol.dates < sample.length * 0.6) return null;
    const textCol = stats.filter((s) => s.c !== dateCol.c).sort((a, b) => b.texts * b.avgText - a.texts * a.avgText)[0];
    const amountCol = stats.find((s) => s.c !== dateCol.c && (!textCol || s.c !== textCol.c) && s.numbers >= sample.length * 0.6);
    if (!textCol || !amountCol) return null;
    return { headerRow: -1, columns: null, date: dateCol.c, description: textCol.c, amount: amountCol.c };
  }

  // Turns rows into transactions. `amount` is positive for money going out.
  function toTransactions(rows, mapping) {
    const body = rows.slice(mapping.headerRow + 1);
    const order = guessDateOrder(body.map((r) => r[mapping.date]));
    const parsed = [];
    for (const row of body) {
      const day = parseDate(row[mapping.date], order);
      if (day === null) continue;
      let amount = null;
      if (mapping.amount !== undefined && mapping.amount !== null) {
        amount = parseAmount(row[mapping.amount]);
      } else {
        const out = parseAmount(row[mapping.debit]);
        const into = mapping.credit !== undefined ? parseAmount(row[mapping.credit]) : null;
        if (out) amount = -Math.abs(out);
        else if (into) amount = Math.abs(into);
      }
      if (amount === null || amount === 0) continue;
      parsed.push({ day, description: String(row[mapping.description] || '').trim(), amount });
    }
    // Usually money out is negative. Credit card exports list purchases as positive instead.
    const singleColumn = mapping.amount !== undefined && mapping.amount !== null;
    const positives = parsed.filter((t) => t.amount > 0).length;
    const flip = singleColumn && parsed.length > 0 && positives / parsed.length > 0.85;
    return parsed
      .map((t) => ({ day: t.day, description: t.description, amount: flip ? t.amount : -t.amount }))
      .filter((t) => t.amount > 0);
  }

  function readStatement(text) {
    const rows = parseCSV(text);
    const mapping = detectColumns(rows);
    if (!mapping) return { rows, mapping: null, transactions: [] };
    return { rows, mapping, transactions: toTransactions(rows, mapping) };
  }

  // ---------- Recognising merchants ----------

  // Checked against the raw description, in order. 'subscription' or 'bill'.
  const KNOWN = [
    [/NETFLIX/, 'Netflix', 'subscription'],
    [/SPOTIFY/, 'Spotify', 'subscription'],
    [/DISNEY ?PLUS|DISNEYPLUS|DISNEY\+/, 'Disney+', 'subscription'],
    [/AMAZON PRIME|AMZN PRIME|PRIME VIDEO|PRIMEVIDEO|AMAZON PRIME\*/, 'Amazon Prime', 'subscription'],
    [/KINDLE ?UNL/, 'Kindle Unlimited', 'subscription'],
    [/AUDIBLE/, 'Audible', 'subscription'],
    [/YOUTUBE ?PREMIUM|YOUTUBEPREMIUM|GOOGLE \*?YOUTUBE/, 'YouTube Premium', 'subscription'],
    [/GOOGLE ?\*? ?(STORAGE|ONE)\b/, 'Google One', 'subscription'],
    [/APPLE\.COM\/BILL|APPLE COM BILL|ITUNES\.COM|APPLE\.COM BILL/, 'Apple (iCloud, Music, apps)', 'subscription'],
    [/GOOGLE ?\*? ?PLAY/, 'Google Play', 'subscription'],
    [/XBOX|MICROSOFT\*? ?(365|ULTIMATE|GAME)/, 'Xbox / Microsoft', 'subscription'],
    [/MICROSOFT|MSFT/, 'Microsoft', 'subscription'],
    [/PLAYSTATION|SONY INTERACTIVE|PSN/, 'PlayStation', 'subscription'],
    [/NINTENDO/, 'Nintendo', 'subscription'],
    [/NOW ?TV|NOWTV|\bNOW\b.*ENTERTAINMENT/, 'NOW', 'subscription'],
    [/PARAMOUNT/, 'Paramount+', 'subscription'],
    [/CRUNCHYROLL/, 'Crunchyroll', 'subscription'],
    [/DAZN/, 'DAZN', 'subscription'],
    [/DELIVEROO ?PLUS/, 'Deliveroo Plus', 'subscription'],
    [/UBER ?ONE/, 'Uber One', 'subscription'],
    [/OPENAI|CHATGPT/, 'ChatGPT', 'subscription'],
    [/ANTHROPIC|CLAUDE\.AI/, 'Claude', 'subscription'],
    [/MIDJOURNEY/, 'Midjourney', 'subscription'],
    [/ADOBE/, 'Adobe', 'subscription'],
    [/\bCANVA\b/, 'Canva', 'subscription'],
    [/DROPBOX/, 'Dropbox', 'subscription'],
    [/DUOLINGO/, 'Duolingo', 'subscription'],
    [/HEADSPACE/, 'Headspace', 'subscription'],
    [/\bCALM\b|CALM\.COM/, 'Calm', 'subscription'],
    [/STRAVA/, 'Strava', 'subscription'],
    [/PATREON/, 'Patreon', 'subscription'],
    [/TWITCH/, 'Twitch', 'subscription'],
    [/TINDER/, 'Tinder', 'subscription'],
    [/\bBUMBLE\b/, 'Bumble', 'subscription'],
    [/HINGE/, 'Hinge', 'subscription'],
    [/PURE ?GYM/, 'PureGym', 'subscription'],
    [/GYM GROUP/, 'The Gym Group', 'subscription'],
    [/DAVID LLOYD/, 'David Lloyd', 'subscription'],
    [/NUFFIELD/, 'Nuffield Health', 'subscription'],
    [/PELOTON/, 'Peloton', 'subscription'],
    [/HELLO ?FRESH/, 'HelloFresh', 'subscription'],
    [/GOUSTO/, 'Gousto', 'subscription'],
    [/LINKEDIN/, 'LinkedIn', 'subscription'],
    [/NYTIMES|NEW YORK TIMES/, 'New York Times', 'subscription'],
    [/ECONOMIST/, 'The Economist', 'subscription'],
    [/\bTIMES\b.*(DIGITAL|SUBS)|TIMES NEWSPAPERS/, 'The Times', 'subscription'],
    [/TELEGRAPH/, 'The Telegraph', 'subscription'],
    [/GUARDIAN/, 'The Guardian', 'subscription'],
    [/TV LICEN[CS]E/, 'TV Licence', 'bill'],
    [/COUNCIL|COUNCIL TAX/, 'Council tax', 'bill'],
    [/OCTOPUS ENERGY/, 'Octopus Energy', 'bill'],
    [/BRITISH GAS/, 'British Gas', 'bill'],
    [/\bEDF\b/, 'EDF', 'bill'],
    [/\bE\.?ON\b/, 'E.ON', 'bill'],
    [/\bOVO\b/, 'OVO', 'bill'],
    [/SCOTTISH POWER/, 'ScottishPower', 'bill'],
    [/\bWATER\b|DWR CYMRU/, 'Water', 'bill'],
    [/VIRGIN MEDIA/, 'Virgin Media', 'bill'],
    [/\bSKY\b|SKY DIGITAL|SKY UK/, 'Sky', 'bill'],
    [/\bBT\b|BT GROUP/, 'BT', 'bill'],
    [/TALKTALK/, 'TalkTalk', 'bill'],
    [/PLUSNET/, 'Plusnet', 'bill'],
    [/VODAFONE/, 'Vodafone', 'bill'],
    [/\bEE\b|EE LIMITED/, 'EE', 'bill'],
    [/\bO2\b|TELEFONICA/, 'O2', 'bill'],
    [/\bTHREE\b.*(MOBILE|UK)|THREE\.CO\.UK|HUTCHISON/, 'Three', 'bill'],
    [/GIFFGAFF/, 'giffgaff', 'bill'],
    [/LEBARA/, 'Lebara', 'bill'],
    [/INSURANCE|AVIVA|ADMIRAL|DIRECT LINE|LV=|\bAXA\b|CHURCHILL INS|HASTINGS DIRECT/, 'Insurance', 'bill'],
    [/\bRENT\b|LETTINGS|LANDLORD/, 'Rent', 'bill'],
    [/MORTGAGE/, 'Mortgage', 'bill'],
  ];

  // Not regular payments, however often they happen
  const IGNORE = /\bATM\b|CASH ?(WITHDRAWAL|MACHINE)|\bLNK\b|CASH POINT|TRANSFER TO|TO SAVINGS|SAVINGS POT|\bPOT\b|INTEREST/;

  const PREFIXES = /^(CARD PAYMENT TO|CARD PURCHASE( AT)?|CARD TRANSACTION|CONTACTLESS( PAYMENT)?|PURCHASE|POS|VIS|VISA|DEBIT CARD|DEB|DIRECT DEBIT( PAYMENT)?( TO)?|DD|SO|STO|STANDING ORDER( TO)?|BP|BGC|FPO|FASTER PAYMENT( TO)?|PAYMENT TO|BILL PAYMENT( TO)?|CPT|CHQ|TFR|MOBILE PAYMENT( TO)?)\b[\s:\-]*/;
  const PROCESSORS = /^(PAYPAL|PP|SQ|SUMUP|IZ|ZETTLE|SP|PADDLE|FS|STRIPE)$/;
  const BRANDS = /^(GOOGLE|APPLE|AMAZON|AMZN)$/;
  const STOPWORDS = new Set(['LTD', 'LIMITED', 'PLC', 'INC', 'LLC', 'CO', 'GB', 'GBR', 'UK', 'IRL', 'LUX', 'NLD', 'USA', 'US', 'LONDON', 'REF', 'THE']);

  function merchantKey(description) {
    let s = description.toUpperCase().trim();
    let previous;
    do { previous = s; s = s.replace(PREFIXES, '').trim(); } while (s !== previous);
    s = s.replace(/\bON \d{1,2} [A-Z]{3}\b.*$/, '');
    if (s.includes('*')) {
      const parts = s.split('*').map((p) => p.trim()).filter(Boolean);
      if (parts.length > 1 && PROCESSORS.test(parts[0])) s = parts[1];
      else if (parts.length > 1 && BRANDS.test(parts[0])) s = parts[0] + ' ' + parts[1];
      else s = parts[0] || s;
    }
    s = s.replace(/WWW\.|\.(COM|CO\.UK|NET|ORG|IO|UK)\b(\/\S*)?/g, ' ');
    s = s.replace(/[^A-Z0-9&+ ]/g, ' ');
    const words = s.split(/\s+/).filter((w) => w && !/\d/.test(w) && !STOPWORDS.has(w));
    return words.slice(0, 3).join(' ') || description.toUpperCase().trim().slice(0, 30);
  }

  function identify(description) {
    const upper = description.toUpperCase();
    for (const [re, name, category] of KNOWN) {
      if (re.test(upper)) return { key: name.toUpperCase(), name, category, known: true };
    }
    const key = merchantKey(description);
    const name = key.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
    return { key, name, category: 'other', known: false };
  }

  // ---------- Finding the pattern ----------

  const CADENCES = [
    { id: 'weekly', label: 'Weekly', days: 7, min: 6, max: 8, perYear: 52 },
    { id: 'fortnightly', label: 'Every 2 weeks', days: 14, min: 12, max: 16, perYear: 26 },
    { id: 'monthly', label: 'Monthly', days: 30.44, min: 26, max: 35, perYear: 12, months: 1 },
    { id: 'quarterly', label: 'Every 3 months', days: 91.31, min: 84, max: 98, perYear: 4, months: 3 },
    { id: 'yearly', label: 'Yearly', days: 365.25, min: 350, max: 380, perYear: 1, months: 12 },
  ];

  // Share of gaps that fit this cadence. Monthly and longer may skip a payment or two.
  function fitScore(gaps, cadence) {
    let fit = 0;
    let exact = 0;
    for (const gap of gaps) {
      const k = Math.max(1, Math.round(gap / cadence.days));
      const allowed = cadence.months ? 3 : 1;
      if (k <= allowed && gap >= cadence.min * k && gap <= cadence.max * k) {
        fit += k === 1 ? 1 : 0.75;
        if (k === 1) exact++;
      }
    }
    if (exact < gaps.length / 2) return 0;
    return fit / gaps.length;
  }

  // Groups charges of a similar size, so £2.99 iCloud and £10.99 Apple Music stay apart
  // but a price rise from £4.99 to £5.99 stays together
  function clusterByAmount(transactions) {
    const sorted = transactions.slice().sort((a, b) => a.amount - b.amount);
    const clusters = [];
    let current = null;
    for (const t of sorted) {
      if (!current || t.amount - current.start > Math.max(current.start * 0.25, 1)) {
        current = { start: t.amount, items: [] };
        clusters.push(current);
      }
      current.items.push(t);
    }
    return clusters.map((c) => c.items.sort((a, b) => a.day - b.day));
  }

  function addMonths(day, months) {
    const d = new Date(day * DAY);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + months;
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay)) / DAY;
  }

  function nextCharge(lastDay, cadence) {
    return cadence.months ? addMonths(lastDay, cadence.months) : lastDay + cadence.days;
  }

  function median(values) {
    const s = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  function findRecurring(transactions) {
    if (!transactions.length) return { items: [], dataStart: null, dataEnd: null, count: 0 };
    const dataStart = Math.min(...transactions.map((t) => t.day));
    const dataEnd = Math.max(...transactions.map((t) => t.day));

    const groups = new Map();
    for (const t of transactions) {
      if (IGNORE.test(t.description.toUpperCase())) continue;
      const who = identify(t.description);
      if (!groups.has(who.key)) groups.set(who.key, { who, transactions: [] });
      groups.get(who.key).transactions.push(t);
    }

    const items = [];
    for (const { who, transactions: list } of groups.values()) {
      for (const cluster of clusterByAmount(list)) {
        // Same merchant, same day, same amount is one charge listed twice
        const charges = cluster.filter((t, i) => i === 0 || t.day !== cluster[i - 1].day);
        const base = {
          name: who.name,
          category: who.category,
          known: who.known,
          count: charges.length,
          firstDay: charges[0].day,
          lastDay: charges[charges.length - 1].day,
          amount: round2(charges[charges.length - 1].amount),
          firstAmount: round2(charges[0].amount),
          charges: charges.map((t) => ({ day: t.day, amount: t.amount, description: t.description })),
        };

        if (charges.length === 1) {
          // One charge from a known subscription might be yearly, or newly started
          if (who.known && who.category === 'subscription') {
            items.push(Object.assign(base, {
              id: `${who.key}|once|${Math.round(base.amount)}`,
              status: 'once',
              confidence: 'low',
              cadence: null,
            }));
          }
          continue;
        }

        const gaps = [];
        for (let i = 1; i < charges.length; i++) gaps.push(charges[i].day - charges[i - 1].day);
        let best = null;
        for (const cadence of CADENCES) {
          const score = fitScore(gaps, cadence);
          if (score >= 0.75 && (!best || score > best.score)) best = { cadence, score };
        }
        if (!best) continue;

        // Unknown merchants need more evidence than a recognised subscription
        const short = best.cadence.id === 'weekly' || best.cadence.id === 'fortnightly';
        const needed = who.known ? 2 : short ? 4 : 3;
        if (charges.length < needed) continue;
        if (!who.known) {
          const amounts = charges.map((t) => t.amount);
          if (Math.max(...amounts) / Math.min(...amounts) > 1.3) continue;
        }

        const cadence = best.cadence;
        const stopped = dataEnd - base.lastDay > cadence.max * 1.5;
        const priceChange = Math.abs(base.amount - base.firstAmount) >= 0.01 &&
          Math.abs(base.amount - base.firstAmount) / base.firstAmount >= 0.02;
        items.push(Object.assign(base, {
          id: `${who.key}|${cadence.id}|${Math.round(median(charges.map((t) => t.amount)))}`,
          status: stopped ? 'stopped' : 'active',
          confidence: charges.length >= 3 && best.score >= 0.85 ? 'high' : 'medium',
          cadence: { id: cadence.id, label: cadence.label },
          nextDay: stopped ? null : nextCharge(base.lastDay, cadence),
          yearly: round2(base.amount * cadence.perYear),
          monthly: round2((base.amount * cadence.perYear) / 12),
          priceChange: priceChange ? { from: base.firstAmount, to: base.amount } : null,
        }));
      }
    }

    items.sort((a, b) => (b.yearly || 0) - (a.yearly || 0) || a.name.localeCompare(b.name));
    return { items, dataStart, dataEnd, count: transactions.length };
  }

  return {
    DAY, decode, parseCSV, parseDate, parseAmount, guessDateOrder, detectColumns, toTransactions,
    readStatement, merchantKey, identify, findRecurring, addMonths, CADENCES,
  };
});
