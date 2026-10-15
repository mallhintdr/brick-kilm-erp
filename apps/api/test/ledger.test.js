process.env.NODE_ENV = 'test'; // use a fresh throwaway in-memory DB, never the persistent dev one

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { connect, close } from '../src/db.js';
import { createApp } from '../src/app.js';
import { seed } from '../src/seed.js';
import { postEntry, oid } from '../src/core.js';

let base, server, ctx, testDb, tokens = {};

async function api(method, path, body, who = 'owner') {
  const r = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(tokens[who] ? { authorization: `Bearer ${tokens[who]}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json() };
}

before(async () => {
  testDb = await connect();
  ctx = await seed(testDb);
  server = createApp(testDb).listen(0);
  base = `http://localhost:${server.address().port}`;
  for (const [who, username] of [['owner', 'owner'], ['munshi', 'munshi']]) {
    const r = await api('POST', '/auth/login', { tenantId: ctx.tenantId, username, password: 'owner123' }, null);
    tokens[who] = r.body.token;
  }
});
after(async () => { server.close(); await close(); });

const newWorker = async (over = {}, who = 'owner') => {
  const r = await api('POST', '/workers', {
    name: 'Ali', fatherName: 'Akbar', cnic: String(Math.floor(1e12 + Math.random() * 9e12)), dob: '1990-01-01', category: 'pathera', ...over,
  }, who);
  if (r.status === 201) await api('POST', `/workers/${r.body.id}/contract-signed`, { signedDocUrl: 'x' }, who);
  return r;
};

test('rejects worker under 14', async () => {
  const r = await api('POST', '/workers', { name: 'Kid', fatherName: 'Akbar', cnic: '1234567890123', dob: '2020-01-01', category: 'pathera' });
  assert.equal(r.status, 422);
});

test('duplicate CNIC blocked', async () => {
  const cnic = '3120212345671';
  assert.equal((await newWorker({ cnic })).status, 201);
  assert.equal((await newWorker({ cnic })).status, 409);
});

test('no advance without signed contract', async () => {
  const w = await api('POST', '/workers', { name: 'Bilal', fatherName: 'Akbar', cnic: '3120200000001', dob: '1990-01-01', category: 'pathera' });
  const r = await api('POST', '/advances', { workerId: w.body.id, amount: '1000', clientUuid: randomUUID() });
  assert.equal(r.status, 422);
});

test('peshgi limit is editable; over-limit needs owner override', async () => {
  const w = (await newWorker()).body.id;
  // default 50,000: owner cannot exceed without a reason
  assert.equal((await api('POST', '/advances', { workerId: w, amount: '60000', clientUuid: randomUUID() })).status, 422);
  // owner raises the limit
  assert.equal((await api('PUT', '/settings', { key: 'peshgiLimit', value: '100000' })).status, 201);
  assert.equal((await api('POST', '/advances', { workerId: w, amount: '60000', clientUuid: randomUUID() })).status, 201);
  assert.equal((await api('GET', `/workers/${w}/peshgi`)).body.outstanding, '60000.00');
  // munshi cannot change settings
  assert.equal((await api('PUT', '/settings', { key: 'peshgiLimit', value: '1' }, 'munshi')).status, 403);
});

test('owner override with reason above limit; munshi limit enforced', async () => {
  const w = (await newWorker()).body.id;
  const big = await api('POST', '/advances', { workerId: w, amount: '150000', clientUuid: randomUUID() });
  assert.equal(big.status, 422);
  const ok = await api('POST', '/advances', { workerId: w, amount: '150000', overrideReason: 'family emergency', clientUuid: randomUUID() });
  assert.equal(ok.status, 201);
  const w2 = (await newWorker()).body.id;
  assert.equal((await api('POST', '/advances', { workerId: w2, amount: '20000', clientUuid: randomUUID() }, 'munshi')).status, 403);
});

test('idempotent clientUuid and reversal', async () => {
  const w = (await newWorker()).body.id;
  const uuid = randomUUID();
  const a = await api('POST', '/advances', { workerId: w, amount: '5000', clientUuid: uuid });
  assert.equal(a.status, 201);
  assert.equal((await api('POST', '/advances', { workerId: w, amount: '5000', clientUuid: uuid })).status, 409);
  assert.equal((await api('GET', `/workers/${w}/peshgi`)).body.outstanding, '5000.00');
  assert.equal((await api('POST', `/ledger/${a.body.id}/reverse`, { reason: 'typo', clientUuid: randomUUID() })).status, 201);
  assert.equal((await api('GET', `/workers/${w}/peshgi`)).body.outstanding, '0.00');
});

test('types: add custom, validate on use, protect built-ins, block delete when in use', async () => {
  // unknown category rejected until the owner adds it
  const before = await newWorker({ category: 'welder' });
  assert.equal(before.status, 422);

  const add = await api('POST', '/types', { kind: 'workerCategory', label: 'Welder', labelUr: 'ویلڈر' });
  assert.equal(add.status, 201);
  assert.equal(add.body.key, 'welder');
  assert.equal((await api('POST', '/types', { kind: 'workerCategory', label: 'Welder' })).status, 409); // duplicate key

  // munshi cannot manage types
  assert.equal((await api('POST', '/types', { kind: 'workerCategory', label: 'Cook' }, 'munshi')).status, 403);

  // now usable
  assert.equal((await newWorker({ category: 'welder' })).status, 201);

  const list = (await api('GET', '/types?kind=workerCategory')).body;
  const welder = list.find((t) => t.key === 'welder');
  const builtin = list.find((t) => t.key === 'pathera');

  // edit label; key stays
  assert.equal((await api('PUT', `/types/${welder._id}`, { label: 'Welder / Fitter' })).status, 200);
  // built-ins: rename ok, cannot deactivate or delete
  assert.equal((await api('PUT', `/types/${builtin._id}`, { label: 'Moulder (Pathera)' })).status, 200);
  assert.equal((await api('PUT', `/types/${builtin._id}`, { active: false })).status, 422);
  assert.equal((await api('DELETE', `/types/${builtin._id}`)).status, 422);

  // in use -> delete refused, deactivate allowed and blocks new use
  assert.equal((await api('DELETE', `/types/${welder._id}`)).status, 409);
  assert.equal((await api('PUT', `/types/${welder._id}`, { active: false })).status, 200);
  assert.equal((await newWorker({ category: 'welder' })).status, 422);

  // unused custom type can be deleted
  const cook = await api('POST', '/types', { kind: 'paymentMode', label: 'Cheque' });
  assert.equal(cook.status, 201);
  const modes = (await api('GET', '/types?kind=paymentMode')).body;
  const cheque = modes.find((t) => t.key === 'cheque');
  assert.equal((await api('DELETE', `/types/${cheque._id}`)).status, 200);
});

test('kharchi run: propose matches the formula, settle posts correctly, overlap refused', async () => {
  const w1 = (await newWorker()).body.id;
  const w2 = (await newWorker()).body.id;
  const team = await testDb.collection('teams').insertOne({ tenantId: ctx.tenantId, kilnId: ctx.kilnId, category: 'pathera', label: 'K', memberIds: [w1, w2] });

  // Thursday hisaab: 12,000 bricks @ 2,738/1000 = Rs 32,856 gross (16,428 each, 6,000 bricks each).
  // Peshgi cut Rs 400 per 1,000 bricks -> 2,400 each; kharchi = 16,428 - 2,400 = 14,028 each.
  await api('PUT', '/settings', { key: 'ratePathera', value: '2738' });
  await api('PUT', '/settings', { key: 'cutPathera', value: '400' });
  await api('PUT', '/settings', { key: 'recoveryPct', value: '25' });
  await api('PUT', '/settings', { key: 'kharchiFloor', value: '0' });
  for (const w of [w1, w2]) {
    assert.equal((await api('POST', '/advances', { workerId: w, amount: '10000', clientUuid: randomUUID() })).status, 201);
  }
  const m1 = await api('POST', '/moulding', { teamId: String(team.insertedId), count: 12000, kharaba: 0, clientUuid: randomUUID() });
  assert.equal(m1.status, 201);

  const start = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const end = new Date().toISOString().slice(0, 10);
  const proposal = await api('GET', `/kharchi-runs/propose?periodStart=${start}&periodEnd=${end}&category=pathera`);
  assert.equal(proposal.status, 200);
  const row = proposal.body.items.find((i) => i.workerId === w1);
  assert.equal(row.gross, '16428.00'); // 32,856 split equally between 2 workers
  assert.equal(row.bricks, 6000);
  assert.equal(row.recovery, '2400.00');
  assert.equal(row.kharchi, '14028.00');

  const settle = await api('POST', '/kharchi-runs', {
    periodStart: start, periodEnd: end, category: 'pathera', items: proposal.body.items, clientUuid: randomUUID(),
  });
  assert.equal(settle.status, 201);
  assert.equal(settle.body.totalKharchi, '28056.00');
  assert.equal(settle.body.totalRecovery, '4800.00');

  // earnings balance is netted back to ~0 after settlement (debit from moulding, credit from kharchi_paid)
  const ledger = (await api('GET', `/workers/${w1}/ledger`)).body;
  const earningsNet = ledger.filter((e) => e.account === 'earnings').reduce((a, e) => a + Number(e.debit) - Number(e.credit), 0);
  assert.ok(Math.abs(earningsNet) < 0.01);
  // recovery posted against peshgi: 10,000 advance - 2,400 cut = 7,600 still outstanding
  assert.equal((await api('GET', `/workers/${w1}/peshgi`)).body.outstanding, '7600.00');

  // a worker with no outstanding peshgi gets recovery capped at 0 (gets it all as kharchi instead).
  // Uses a different category (bharai) so this doesn't collide with the pathera run just settled.
  const w3 = (await newWorker()).body.id;
  await testDb.collection('teams').insertOne({ tenantId: ctx.tenantId, kilnId: ctx.kilnId, category: 'bharai', label: 'K2', memberIds: [w3] });
  await postEntry(testDb, undefined, { sub: 'test', tenantId: ctx.tenantId, kilnId: ctx.kilnId }, {
    partyType: 'worker', partyId: w3, account: 'earnings', type: 'loading_credit', debit: '1800', clientUuid: randomUUID(),
  });
  const prop2 = await api('GET', `/kharchi-runs/propose?periodStart=${start}&periodEnd=${end}&category=bharai`);
  const row3 = prop2.body.items.find((i) => i.workerId === w3);
  assert.equal(row3.recovery, '0.00');
  assert.equal(row3.kharchi, row3.gross);

  // settling the same (overlapping) period again is refused
  const again = await api('POST', '/kharchi-runs', {
    periodStart: start, periodEnd: end, category: 'pathera', items: proposal.body.items, clientUuid: randomUUID(),
  });
  assert.equal(again.status, 409);
});

test('permission matrix: grants and restricts beyond role defaults', async () => {
  // a fresh munshi-role user, to test overrides without disturbing the shared 'munshi' token
  const username = `test-munshi-${Date.now()}`;
  const created = await api('POST', '/users', { username, password: 'test1234', role: 'munshi', clientUuid: randomUUID() });
  assert.equal(created.status, 201);
  const userId = created.body.id;
  const login = await api('POST', '/auth/login', { username, password: 'test1234' });
  assert.equal(login.status, 200);
  tokens.testMunshi = login.body.token;

  // default: munshi can add a worker, cannot edit settings
  assert.equal((await newWorker({}, 'testMunshi')).status, 201);
  assert.equal((await api('PUT', '/settings', { key: 'kharchiFloor', value: '1234' }, 'testMunshi')).status, 403);

  // owner restricts this specific munshi's worker-add rights below the role default
  assert.equal((await api('PUT', `/users/${userId}/permissions`, { module: 'workers', add: false })).status, 200);
  assert.equal((await newWorker({}, 'testMunshi')).status, 403);

  // owner grants this specific munshi settings-edit rights beyond the role default
  assert.equal((await api('PUT', `/users/${userId}/permissions`, { module: 'settings', edit: true })).status, 200);
  assert.equal((await api('PUT', '/settings', { key: 'kharchiFloor', value: '1234' }, 'testMunshi')).status, 201);

  // effective matrix reflects both overrides, marked as overridden
  const matrix = await api('GET', `/users/${userId}/permissions`);
  assert.equal(matrix.body.modules.workers.effective.add, false);
  assert.equal(matrix.body.modules.workers.overridden.add, true);
  assert.equal(matrix.body.modules.settings.effective.edit, true);

  // resetting the module clears the override, falling back to the role default
  assert.equal((await api('DELETE', `/users/${userId}/permissions/workers`)).status, 200);
  assert.equal((await newWorker({}, 'testMunshi')).status, 201);

  // a non-owner cannot manage users or permissions at all
  assert.equal((await api('POST', '/users', { username: 'nope', password: 'password1', role: 'viewer', clientUuid: randomUUID() }, 'munshi')).status, 403);
  assert.equal((await api('PUT', `/users/${userId}/permissions`, { module: 'workers', add: true }, 'munshi')).status, 403);
});

test('moulding: a whole week can be entered by date, and edits re-post wages', async () => {
  const m1 = (await newWorker()).body.id;
  const team = await testDb.collection('teams').insertOne({ tenantId: ctx.tenantId, kilnId: ctx.kilnId, category: 'pathera', label: 'Week', memberIds: [m1] });
  const teamId = String(team.insertedId);

  // seven days, oldest first
  for (let d = 6; d >= 0; d--) {
    const date = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
    const r = await api('POST', '/moulding', { teamId, count: 1000, kharaba: 0, date, clientUuid: randomUUID() });
    assert.equal(r.status, 201, `day -${d}`);
  }
  // future dates are refused
  const tomorrow2 = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  assert.equal((await api('POST', '/moulding', { teamId, count: 1000, date: tomorrow2, clientUuid: randomUUID() })).status, 400);

  // a second entry for the same team and day is refused; the existing one must be edited instead
  const today = new Date().toISOString().slice(0, 10);
  const dup = await api('POST', '/moulding', { teamId, count: 500, kharaba: 0, date: today, clientUuid: randomUUID() });
  assert.equal(dup.status, 409);

  const batches = (await api('GET', '/moulding')).body.filter((b) => b.teamId === teamId);
  assert.equal(batches.length, 7);
  const days = new Set(batches.map((b) => new Date(b.date).toISOString().slice(0, 10)));
  assert.equal(days.size, 7);

  // wage entries carry the work date, not "now"
  const ledger = (await api('GET', `/workers/${m1}/ledger`)).body;
  const ledgerDays = new Set(ledger.map((e) => new Date(e.createdAt).toISOString().slice(0, 10)));
  assert.equal(ledgerDays.size, 7);

  // owner edits one batch: old wage reversed, new one posted, net equals the new count's wage
  await api('PUT', '/settings', { key: 'ratePathera', value: '2000' });
  const one = batches[0];
  const before = ledger.reduce((a, e) => a + Number(e.debit) - Number(e.credit), 0);
  const ed = await api('PUT', `/moulding/${one._id}`, { count: 3000 });
  assert.equal(ed.status, 200);
  const after = (await api('GET', `/workers/${m1}/ledger`)).body.reduce((a, e) => a + Number(e.debit) - Number(e.credit), 0);
  const oldWage = (1000 / 1000) * 2738;
  assert.ok(Math.abs(after - (before - oldWage + 3 * 2000)) < 0.01, `before=${before} after=${after}`);
  // moving an entry onto a day the team already has is refused too
  const otherDay = new Date(batches[1].date).toISOString().slice(0, 10);
  assert.equal((await api('PUT', `/moulding/${one._id}`, { date: otherDay })).status, 409);
  // munshi cannot edit records
  assert.equal((await api('PUT', `/moulding/${one._id}`, { count: 10 }, 'munshi')).status, 403);
});

test('session: active users get a renewed token; failed logins are rate-limited per user', async () => {
  // a token older than the renewal threshold is renewed on the next request
  const jwt = (await import('jsonwebtoken')).default;
  const me = JSON.parse(Buffer.from(tokens.owner.split('.')[1], 'base64url').toString());
  const old = jwt.sign({ sub: me.sub, role: me.role, tenantId: me.tenantId, kilnId: me.kilnId, iat: Math.floor(Date.now() / 1000) - 2 * 3600 }, 'dev-secret-change-me', { expiresIn: '7d' });
  const r = await fetch(`${base}/settings`, { headers: { authorization: `Bearer ${old}` } });
  assert.equal(r.status, 200);
  assert.ok(r.headers.get('x-refresh-token'));

  // a successful login doesn't count toward the limit; ten wrong passwords for one user do
  const user = `lim-${Date.now()}`;
  await api('POST', '/users', { username: user, password: 'right123', role: 'viewer', clientUuid: randomUUID() });
  for (let i = 0; i < 12; i++) assert.equal((await api('POST', '/auth/login', { username: 'owner', password: 'owner123' }, null)).status, 200);
  for (let i = 0; i < 10; i++) await api('POST', '/auth/login', { username: user, password: 'wrong' }, null);
  assert.equal((await api('POST', '/auth/login', { username: user, password: 'wrong' }, null)).status, 429);
  // a different user from the same IP is unaffected
  assert.equal((await api('POST', '/auth/login', { username: 'owner', password: 'owner123' }, null)).status, 200);
});

test('delete: guards, reversals and settings reset', async () => {
  // munshi cannot delete anything
  const w0 = (await newWorker()).body.id;
  assert.equal((await api('DELETE', `/workers/${w0}`, null, 'munshi')).status, 403);
  // worker without money history can be deleted; with history cannot
  assert.equal((await api('DELETE', `/workers/${w0}`)).status, 200);
  assert.equal((await api('DELETE', `/workers/${w0}`)).status, 404);
  const w1 = (await newWorker()).body.id;
  await api('POST', '/advances', { workerId: w1, amount: '1000', clientUuid: randomUUID() });
  assert.equal((await api('DELETE', `/workers/${w1}`)).status, 409);

  // customer -> invoice -> payment chain: delete in dependency order
  const cust = (await api('POST', '/customers', { name: 'Chain Buyer', type: 'individual', clientUuid: randomUUID() })).body.id;
  const inv = (await api('POST', '/invoices', { customerId: cust, grade: 'awwal', qty: 1000, clientUuid: randomUUID() })).body;
  const pay = (await api('POST', '/payments', { invoiceId: inv.id, amount: inv.amount, clientUuid: randomUUID() })).body;
  assert.equal((await api('DELETE', `/customers/${cust}`)).status, 409);
  assert.equal((await api('DELETE', `/invoices/${inv.id}`)).status, 409);
  assert.equal((await api('DELETE', `/payments/${pay.id}`)).status, 200);
  const invoices = (await api('GET', '/invoices')).body;
  assert.equal(invoices.find((i) => i._id === inv.id).status, 'open'); // re-opened
  assert.equal((await api('DELETE', `/invoices/${inv.id}`)).status, 200);
  assert.equal((await api('DELETE', `/customers/${cust}`)).status, 200);

  // deleting a moulding batch reverses the wage credits it posted
  const m1 = (await newWorker()).body.id;
  const m2 = (await newWorker()).body.id;
  const team = await testDb.collection('teams').insertOne({ tenantId: ctx.tenantId, kilnId: ctx.kilnId, category: 'pathera', label: 'T', memberIds: [m1, m2] });
  const mould = await api('POST', '/moulding', { teamId: String(team.insertedId), count: 2000, kharaba: 0, clientUuid: randomUUID() });
  assert.equal(mould.status, 201);
  const sumOf = async (id) => (await api('GET', `/workers/${id}/ledger`)).body.reduce((a, e) => a + Number(e.debit) - Number(e.credit), 0);
  assert.ok((await sumOf(m1)) > 0);
  const batch = (await api('GET', '/moulding')).body.find((b) => b.teamId === String(team.insertedId));
  const del = await api('DELETE', `/moulding/${batch._id}`);
  assert.equal(del.status, 200);
  assert.equal(del.body.wageEntriesReversed, 2);
  assert.equal(await sumOf(m1), 0);
  assert.equal((await api('GET', `/workers/${m1}/ledger`)).body.length, 2); // original + reversal kept

  // GRN delete removes its expense too
  const grn = await api('POST', '/grns', { item: 'coal', supplierName: 'Coal Co', qty: 5, rate: 30000, clientUuid: randomUUID() });
  assert.equal(grn.status, 201);
  const g = (await api('GET', '/grns')).body[0];
  assert.equal((await api('DELETE', `/grns/${g._id}`)).body.expenseRemoved, true);

  // settings: reset falls back to the built-in default
  await api('PUT', '/settings', { key: 'kharchiFloor', value: '9999' });
  assert.equal((await api('GET', '/settings')).body.kharchiFloor, '9999');
  assert.equal((await api('DELETE', '/settings/kharchiFloor')).status, 200);
  assert.equal((await api('GET', '/settings')).body.kharchiFloor, '5000');
  assert.equal((await api('DELETE', '/settings/nope')).status, 400);
});

test('cash book: today\'s entries can be corrected by staff, past days only by the owner', async () => {
  const w = (await newWorker()).body.id;
  const today = new Date().toISOString().slice(0, 10);
  assert.equal((await api('POST', '/advances', { workerId: w, amount: '3000', clientUuid: randomUUID() })).status, 201);
  const book = async () => (await api('GET', `/cashbook?date=${today}`)).body;
  const before = await book();
  const row = before.expense.find((r) => r.kind === 'advance' && r.amount === '3000');
  assert.ok(row, 'advance listed in cash book');

  // munshi may lower today's advance but not raise it
  assert.equal((await api('PUT', `/advances/${row.id}`, { amount: '5000' }, 'munshi')).status, 403);
  const fix = await api('PUT', `/advances/${row.id}`, { amount: '2000' }, 'munshi');
  assert.equal(fix.status, 200);
  const after = await book();
  assert.ok(!after.expense.some((r) => r.id === row.id), 'corrected original hidden');
  assert.ok(after.expense.some((r) => r.kind === 'advance' && r.amount === '2000'), 'corrected advance listed');
  assert.ok(Math.abs(Number(after.totalOut) - (Number(before.totalOut) - 1000)) < 0.01, 'cash out reduced by the correction');
  // the original can't be corrected twice
  assert.equal((await api('PUT', `/advances/${row.id}`, { amount: '1500' })).status, 409);

  // a past-day entry: munshi refused, owner allowed
  const old = await testDb.collection('ledgerEntries').findOne({ _id: oid(fix.body.id) });
  await testDb.collection('ledgerEntries').updateOne({ _id: old._id }, { $set: { createdAt: new Date(Date.now() - 3 * 86400000) } });
  assert.equal((await api('PUT', `/advances/${old._id}`, { amount: '1000' }, 'munshi')).status, 403);
  assert.equal((await api('PUT', `/advances/${old._id}`, { amount: '1000' })).status, 200);
});

test('sales: a part-payment leaves the invoice open with the remaining balance', async () => {
  const cust = (await api('POST', '/customers', { name: 'Part Payer', type: 'individual', clientUuid: randomUUID() })).body.id;
  const inv = (await api('POST', '/invoices', { customerId: cust, grade: 'awwal', qty: 1000, clientUuid: randomUUID() })).body;
  const find = async () => (await api('GET', '/invoices')).body.find((i) => String(i._id) === String(inv.id));
  const full = Number((await find()).total);
  const half = (full / 2).toFixed(2);
  assert.equal((await api('POST', '/payments', { invoiceId: inv.id, amount: half, clientUuid: randomUUID() })).status, 201);
  let now = await find();
  assert.equal(now.status, 'open');
  assert.equal(now.paid, half);
  assert.equal(now.balance, (full - Number(half)).toFixed(2));
  // paying more than the balance is refused; paying the balance closes it
  assert.equal((await api('POST', '/payments', { invoiceId: inv.id, amount: full.toFixed(2), clientUuid: randomUUID() })).status, 422);
  assert.equal((await api('POST', '/payments', { invoiceId: inv.id, amount: now.balance, clientUuid: randomUUID() })).status, 201);
  now = await find();
  assert.equal(now.status, 'paid');
  assert.equal(now.balance, '0.00');
});

test('back-dated entries: invoice, payment and advance land on the chosen day', async () => {
  const day = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
  const before = new Date(Date.now() - 9 * 86400000).toISOString().slice(0, 10);
  const future = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const cust = (await api('POST', '/customers', { name: 'Old Buyer', type: 'individual', clientUuid: randomUUID() })).body.id;
  const inv = (await api('POST', '/invoices', { customerId: cust, grade: 'awwal', qty: 1000, date: day, clientUuid: randomUUID() })).body;
  const row = (await api('GET', '/invoices')).body.find((i) => String(i._id) === String(inv.id));
  assert.equal(new Date(row.date).toISOString().slice(0, 10), day);
  // a payment cannot predate its invoice, nor be in the future
  assert.equal((await api('POST', '/payments', { invoiceId: inv.id, amount: '100', date: before, clientUuid: randomUUID() })).status, 422);
  assert.equal((await api('POST', '/payments', { invoiceId: inv.id, amount: '100', date: future, clientUuid: randomUUID() })).status, 400);
  assert.equal((await api('POST', '/payments', { invoiceId: inv.id, amount: '100', date: day, clientUuid: randomUUID() })).status, 201);
  const book = (await api('GET', `/cashbook?date=${day}`)).body;
  assert.ok(book.income.some((r) => r.amount === '100'), 'payment shows in that day\'s cash book');

  const w = (await newWorker()).body.id;
  assert.equal((await api('POST', '/advances', { workerId: w, amount: '700', date: day, clientUuid: randomUUID() })).status, 201);
  const led = (await api('GET', `/workers/${w}/ledger`)).body.find((e) => e.type === 'advance');
  assert.equal(new Date(led.createdAt).toISOString().slice(0, 10), day);
});

test('every form: an existing record can be edited and saved (payloads as the screens send them)', async () => {
  await api('PUT', '/settings', { key: 'allowNegativeStock', value: '1' });
  // Workers
  const w = (await newWorker()).body.id;
  let r = await api('PUT', `/workers/${w}`, { name: 'Ali Edited', fatherName: 'Akbar Khan', category: 'pathera', eobiNo: '', pessiNo: '' });
  assert.equal(r.status, 200, `worker: ${JSON.stringify(r.body)}`);
  // a worker saved before father names existed (none on record) still edits fine
  await testDb.collection('workers').updateOne({ _id: oid(w) }, { $unset: { fatherName: 1 } });
  r = await api('PUT', `/workers/${w}`, { name: 'Ali Again', category: 'pathera', eobiNo: '', pessiNo: '' });
  assert.equal(r.status, 200, `legacy worker: ${JSON.stringify(r.body)}`);

  // Customers
  const cust = (await api('POST', '/customers', { name: 'Edit Buyer', type: 'individual', clientUuid: randomUUID() })).body.id;
  assert.equal((await api('PUT', `/customers/${cust}`, { name: 'Edit Buyer 2' })).status, 200);

  // Invoices + payments
  const inv = (await api('POST', '/invoices', { customerId: cust, grade: 'awwal', qty: 2000, clientUuid: randomUUID() })).body;
  r = await api('PUT', `/invoices/${inv.id}`, { qty: 3000, rate: '20000' });
  assert.equal(r.status, 200, `invoice: ${JSON.stringify(r.body)}`);
  const pay = (await api('POST', '/payments', { invoiceId: inv.id, amount: '1000', clientUuid: randomUUID() })).body;
  assert.equal((await api('PUT', `/payments/${pay.id}`, { amount: '1500' })).status, 200);

  // Goods receipts, including one saved without a supplier (as the sample data is)
  assert.equal((await api('POST', '/grns', { item: 'coal', supplierName: 'Edit Coal Co', qty: 5, rate: '30000', freight: '0', clientUuid: randomUUID() })).status, 201);
  const grn = (await api('GET', '/grns')).body.find((g) => g.supplierName === 'Edit Coal Co');
  r = await api('PUT', `/grns/${grn._id}`, { supplierName: 'Edit Coal Co', qty: 6, rate: '31000' });
  assert.equal(r.status, 200, `grn: ${JSON.stringify(r.body)}`);
  await testDb.collection('grns').updateOne({ _id: oid(String(grn._id)) }, { $set: { supplierName: '' } });
  r = await api('PUT', `/grns/${grn._id}`, { qty: 7, rate: '31000' });
  assert.equal(r.status, 200, `grn without supplier: ${JSON.stringify(r.body)}`);

  // Firing logs
  const fteam = await testDb.collection('teams').insertOne({ tenantId: ctx.tenantId, kilnId: ctx.kilnId, category: 'jalai', label: 'Edit Fire', memberIds: [w] });
  assert.equal((await api('POST', '/firing-logs', { shift: 'day', teamId: String(fteam.insertedId), coalKg: 100, tempC: 900, fanOn: true, clientUuid: randomUUID() })).status, 201);
  const log = (await api('GET', '/firing-logs')).body.find((f) => f.teamId === String(fteam.insertedId));
  r = await api('PUT', `/firing-logs/${log._id}`, { shift: 'night', coalKg: 120, tempC: 950, fanOn: false });
  assert.equal(r.status, 200, `firing: ${JSON.stringify(r.body)}`);

  // Cash book expense (from the goods receipt)
  const today = new Date().toISOString().slice(0, 10);
  const exp = (await api('GET', `/cashbook?date=${today}`)).body.expense.find((e) => e.kind === 'expense');
  r = await api('PUT', `/expenses/${exp.id}`, { amount: '1000.00', payee: 'Edited Payee' });
  assert.equal(r.status, 200, `expense: ${JSON.stringify(r.body)}`);
});

test('kiln lines: 240 lines, a full cycle keeps dates, coal, issues and output', async () => {
  await api('PUT', '/settings', { key: 'allowNegativeStock', value: '1' });
  const lines = (await api('GET', '/kiln-lines')).body;
  assert.equal(lines.length, 240);
  assert.equal(lines[119].side, 'A'); assert.equal(lines[120].side, 'B');
  const w = (await newWorker()).body.id;
  const team = await testDb.collection('teams').insertOne({ tenantId: ctx.tenantId, kilnId: ctx.kilnId, category: 'bharai', label: 'Line Loaders', memberIds: [w] });
  const nteam = await testDb.collection('teams').insertOne({ tenantId: ctx.tenantId, kilnId: ctx.kilnId, category: 'nikasi', label: 'Line Unloaders', memberIds: [w] });
  assert.equal((await api('POST', '/kiln-lines/1/load', { teamId: String(team.insertedId), count: 4800, clientUuid: randomUUID() })).status, 201);
  assert.equal((await api('POST', '/fire-advance', { unit: 'line', clientUuid: randomUUID() })).status, 201);
  let l1 = (await api('GET', '/kiln-lines')).body[0];
  assert.equal(l1.state, 'Firing'); assert.ok(l1.firedAt && l1.loadedAt);
  assert.equal((await api('PUT', '/kiln-lines/1/notes', { coalKg: 850, issues: 'Fan stopped 40 min; too much khangar at the top.' }, 'munshi')).status, 200);
  await api('POST', '/fire-advance', { unit: 'line', clientUuid: randomUUID() });
  assert.equal((await api('POST', '/kiln-lines/1/unload/start', { teamId: String(nteam.insertedId), clientUuid: randomUUID() })).status, 201);
  assert.equal((await api('POST', '/kiln-lines/1/unload/complete', { awwal: 4000, doem: 500, khangar: 200, broken: 100, clientUuid: randomUUID() })).status, 201);
  const hist = (await api('GET', '/kiln-lines/1/history')).body;
  assert.equal(hist.length, 1);
  assert.equal(hist[0].coalKg, 850); assert.match(hist[0].issues, /Fan stopped/); assert.equal(hist[0].awwal, 4000);
  assert.ok(hist[0].firedAt && hist[0].loadedAt && hist[0].unloadedAt);
  // the chamber board is untouched
  assert.ok((await api('GET', '/kiln-sections')).body.every((s) => s.state === 'Empty' || s.state));
});

test('daily kharcha: entries are listed, hit the cash book, and reduce the settlement balance', async () => {
  const w = (await newWorker({ category: 'driver' })).body.id;
  const today = new Date().toISOString().slice(0, 10);
  assert.equal((await api('POST', '/kharcha', { workerId: w, amount: '500', clientUuid: randomUUID() }, 'munshi')).status, 201);
  const rows = (await api('GET', `/kharcha?from=${today}&to=${today}`)).body;
  assert.ok(rows.some((r) => r.workerId === w && r.amount === '500'));
  const book = (await api('GET', `/cashbook?date=${today}`)).body;
  assert.ok(book.expense.some((r) => r.kind === 'kharcha' && r.amount === '500'));
  const p = (await api('GET', `/kharchi-runs/propose?periodStart=${today}&periodEnd=${today}&category=driver`)).body;
  const it = p.items.find((i) => i.workerId === w);
  assert.ok(it, 'worker taken kharcha appears in the proposal');
  assert.equal(it.taken, '500.00');
});

test('piece work: own rate, opening peshgi, cut per 1,000 bricks and dasti give the Thursday cash', async () => {
  await api('PUT', '/settings', { key: 'allowNegativeStock', value: '1' });
  await api('PUT', '/settings', { key: 'ratePathera', value: '1400' });
  await api('PUT', '/settings', { key: 'cutPathera', value: '400' });
  // moulder registered with peshgi 50,000 and an own rate of 1,500
  const w = (await newWorker({ ratePerThousand: '1500', openingPeshgi: '50000' })).body.id;
  assert.equal((await api('GET', `/workers/${w}/peshgi`)).body.outstanding, '50000.00');
  const team = await testDb.collection('teams').insertOne({ tenantId: ctx.tenantId, kilnId: ctx.kilnId, category: 'pathera', label: 'Solo', memberIds: [w] });
  const day = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  assert.equal((await api('POST', '/moulding', { teamId: String(team.insertedId), count: 10000, kharaba: 0, date: day, clientUuid: randomUUID() })).status, 201);
  assert.equal((await api('POST', '/kharcha', { workerId: w, amount: '3000', date: day, clientUuid: randomUUID() })).status, 201);
  const end = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10); // before the run settled earlier
  const start = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const it = (await api('GET', `/kharchi-runs/propose?periodStart=${start}&periodEnd=${end}&category=pathera`)).body.items.find((i) => i.workerId === w);
  assert.equal(it.bricks, 10000);
  assert.equal(it.gross, '15000.00');    // 10,000 x 1,500 / 1000 (own rate)
  assert.equal(it.recovery, '4000.00');  // 10,000 x 400 / 1000 toward peshgi
  assert.equal(it.kharchi, '11000.00');
  assert.equal(it.taken, '3000.00');     // dasti during the week
  assert.equal(it.balance, '8000.00');   // cash on Thursday
});
