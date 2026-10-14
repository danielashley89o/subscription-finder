// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../detector.js');
const Sample = require('../sample.js');

const day = (y, m, d) => Date.UTC(y, m - 1, d) / S.DAY;

test('reads quoted fields with commas and doubled quotes', () => {
  const rows = S.parseCSV('Date,Description,Amount\r\n01/02/2026,"SHOP, ""THE"" ONE",-1.50\r\n');
  assert.deepEqual(rows, [['Date', 'Description', 'Amount'], ['01/02/2026', 'SHOP, "THE" ONE', '-1.50']]);
});

test('reads UK date formats', () => {
  assert.equal(S.parseDate('03/04/2026'), day(2026, 4, 3));
  assert.equal(S.parseDate('03/04/2026', 'mdy'), day(2026, 3, 4));
  assert.equal(S.parseDate('2026-04-03T10:00:00'), day(2026, 4, 3));
  assert.equal(S.parseDate('3 Apr 2026'), day(2026, 4, 3));
  assert.equal(S.parseDate('03-Apr-26'), day(2026, 4, 3));
  assert.equal(S.parseDate('3 September 2026'), day(2026, 9, 3));
  assert.equal(S.parseDate('31/02/2026'), null);
  assert.equal(S.parseDate('Netflix'), null);
});

test('reads amounts with symbols and signs', () => {
  assert.equal(S.parseAmount('£1,234.50'), 1234.5);
  assert.equal(S.parseAmount('-12.99'), -12.99);
  assert.equal(S.parseAmount('(12.99)'), -12.99);
  assert.equal(S.parseAmount('12.99 DR'), -12.99);
  assert.equal(S.parseAmount('�9.99'), 9.99);
  assert.equal(S.parseAmount(''), null);
  assert.equal(S.parseAmount('abc'), null);
});

function read(csv) {
  const r = S.readStatement(csv);
  assert.ok(r.mapping, 'columns should be detected');
  return r.transactions;
}

test('Monzo export', () => {
  const tx = read('Transaction ID,Date,Time,Type,Name,Emoji,Category,Amount,Currency,Local amount,Local currency,Notes and #tags,Address,Receipt,Description,Category split,Money Out,Money In\n' +
    'tx_1,03/04/2026,09:00:00,Card payment,Netflix,,Entertainment,-12.99,GBP,-12.99,GBP,,,,NETFLIX.COM 866-579 GBR,,-12.99,\n' +
    'tx_2,04/04/2026,09:00:00,Faster payment,Mum,,Transfers,50.00,GBP,50.00,GBP,,,,MUM,,,50.00\n');
  assert.deepEqual(tx, [{ day: day(2026, 4, 3), description: 'Netflix', amount: 12.99 }]);
});

test('Starling export', () => {
  const tx = read('Date,Counter Party,Reference,Type,Amount (GBP),Balance (GBP),Spending Category,Notes\n' +
    '03/04/2026,Spotify,SPOTIFY P2F8,CARD PAYMENT,-11.99,100.00,ENTERTAINMENT,\n');
  assert.deepEqual(tx, [{ day: day(2026, 4, 3), description: 'Spotify', amount: 11.99 }]);
});

test('Nationwide export with a preamble, £ signs and Windows-1252 encoding', () => {
  const text = '"Account Name:","FlexAccount ****1234"\n"Account Balance:","£500.00"\n"Available Balance: ","£500.00"\n\n' +
    '"Date","Transaction type","Description","Paid out","Paid in","Balance"\n' +
    '"03 Apr 2026","Direct debit","PUREGYM LTD","£27.99","","£472.01"\n' +
    '"04 Apr 2026","Bank credit","SALARY","","£2000.00","£2472.01"\n';
  const bytes = Uint8Array.from(text, (c) => c.charCodeAt(0));
  const tx = read(S.decode(bytes.buffer));
  assert.deepEqual(tx, [{ day: day(2026, 4, 3), description: 'PUREGYM LTD', amount: 27.99 }]);
});

test('Lloyds / Halifax export with debit and credit columns', () => {
  const tx = read('Transaction Date,Transaction Type,Sort Code,Account Number,Transaction Description,Debit Amount,Credit Amount,Balance\n' +
    '03/04/2026,DD,\'11-22-33,12345678,EE LIMITED,20.00,,980.00\n' +
    '04/04/2026,BGC,\'11-22-33,12345678,ACME SALARY,,2000.00,2980.00\n');
  assert.deepEqual(tx, [{ day: day(2026, 4, 3), description: 'EE LIMITED', amount: 20 }]);
});

test('Barclays export', () => {
  const tx = read('Number,Date,Account,Amount,Subcategory,Memo\n,03/04/2026,20-00-00 1234,-9.99,Direct Debit,NOW TV\n');
  assert.deepEqual(tx, [{ day: day(2026, 4, 3), description: 'NOW TV', amount: 9.99 }]);
});

test('Revolut export uses the completed date', () => {
  const tx = read('Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance\n' +
    'CARD_PAYMENT,Current,2026-04-02 10:00:00,2026-04-03 10:00:00,Disney Plus,-5.99,0.00,GBP,COMPLETED,90.00\n');
  assert.deepEqual(tx, [{ day: day(2026, 4, 3), description: 'Disney Plus', amount: 5.99 }]);
});

test('HSBC export with no header row', () => {
  const tx = read('03/04/2026,NETFLIX.COM,-12.99\n05/04/2026,TESCO STORES,-23.10\n06/04/2026,SALARY,2000.00\n');
  assert.equal(tx.length, 2);
  assert.equal(tx[0].description, 'NETFLIX.COM');
});

test('credit card export lists purchases as positive', () => {
  const tx = read('Date,Description,Amount\n03/04/2026,NETFLIX.COM,12.99\n05/04/2026,TESCO,23.10\n06/04/2026,PAYMENT RECEIVED,-500.00\n' +
    '07/04/2026,SHELL,40.00\n08/04/2026,AMAZON,9.99\n09/04/2026,BOOTS,4.50\n10/04/2026,TFL,2.80\n11/04/2026,PRET,6.10\n');
  assert.equal(tx.length, 7);
  assert.ok(tx.every((t) => t.amount > 0));
});

test('merchant names ignore references, prefixes and payment processors', () => {
  assert.equal(S.merchantKey('CARD PAYMENT TO CLOUDNEST HOSTING ON 03 APR'), 'CLOUDNEST HOSTING');
  assert.equal(S.merchantKey('PAYPAL *STEAMGAMES'), 'STEAMGAMES');
  assert.equal(S.merchantKey('SQ *CORNER CAFE 1234'), 'CORNER CAFE');
  assert.equal(S.identify('Waterstones').category, 'other');
  assert.equal(S.identify('LEON RESTAURANTS').category, 'other');
});

test('finds the subscriptions in the sample statement', () => {
  const r = S.readStatement(Sample.statementCSV(Date.UTC(2026, 9, 14)));
  const { items } = S.findRecurring(r.transactions);
  const find = (name, amount) => items.find((i) => i.name === name && (amount === undefined || i.amount === amount));

  const netflix = find('Netflix');
  assert.equal(netflix.status, 'active');
  assert.equal(netflix.cadence.id, 'monthly');
  assert.equal(netflix.yearly, 155.88);
  assert.equal(netflix.nextDay, day(2026, 11, 3));

  assert.deepEqual(find('Disney+').priceChange, { from: 4.99, to: 5.99 });
  assert.ok(find('Apple (iCloud, Music, apps)', 2.99));
  assert.ok(find('Apple (iCloud, Music, apps)', 10.99));
  assert.equal(find('NOW').status, 'stopped');
  assert.equal(find('Amazon Prime').status, 'once');
  assert.equal(find('Audible').confidence, 'medium');
  assert.equal(find('Cloudnest Hosting').category, 'other');
  assert.equal(find('Council tax').category, 'bill');

  for (const noise of ['Tesco Stores', 'Pret A Manger', 'Tfl Travel Ch', 'Deliveroo', 'Amznmktplace']) {
    assert.equal(items.find((i) => i.name.startsWith(noise)), undefined, `${noise} is not a subscription`);
  }
});

test('nothing to find in an empty statement', () => {
  assert.deepEqual(S.findRecurring([]).items, []);
});
