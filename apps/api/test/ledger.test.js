process.env.NODE_ENV = 'test'; // use a fresh throwaway in-memory DB, never the persistent dev one

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { connect, close } from '../src/db.js';
import { createApp } from '../src/app.js';
import { seed } from '../src/seed.js';
import { postEntry } from '../src/core.js';

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
    name: 'Ali', cnic: String(Math.floor(1e12 + Math.random() * 9e12)), dob: '1990-01-01', category: 'pathera', ...over,
  }, who);
  if (r.status === 201) await api('POST', `/workers/${r.body.id}/contract-signed`, { signedDocUrl: 'x' }, who);
  return r;
};

test('rejects worker under 14', async () => {
  const r = await api('POST', '/workers', { name: 'Kid', cnic: '1234567890123', dob: '2020-01-01', category: 'pathera' });
  assert.equal(r.status, 422);
});

test('duplicate CNIC blocked', async () => {
  const cnic = '3120212345671';
  assert.equal((await newWorker({ cnic })).status, 201);
  assert.equal((await newWorker({ cnic })).status, 409);
});

test('no advance without signed contract', async () => {
  const w = await api('POST', '/workers', { name: 'Bilal', cnic: '3120200000001', dob: '1990-01-01', category: 'pathera' });
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

  // worked example from brick kiln.md §7: 12,000 bricks @ 2,738/1000 = Rs 32,856 gross,
  // 25% recovery -> Rs 8,214 recovery, Rs 24,642 kharchi. Each worker needs an outstanding
  // peshgi advance at least that large, or recovery is capped at what they actually owe.
  await api('PUT', '/settings', { key: 'ratePathera', value: '2738' });
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
  assert.equal(row.kharchi, '12321.00');
  assert.equal(row.recovery, '4107.00');

  const settle = await api('POST', '/kharchi-runs', {
    periodStart: start, periodEnd: end, category: 'pathera', items: proposal.body.items, clientUuid: randomUUID(),
  });
  assert.equal(settle.status, 201);
  assert.equal(settle.body.totalKharchi, '24642.00');
  assert.equal(settle.body.totalRecovery, '8214.00');

  // earnings balance is netted back to ~0 after settlement (debit from moulding, credit from kharchi_paid)
  const ledger = (await api('GET', `/workers/${w1}/ledger`)).body;
  const earningsNet = ledger.filter((e) => e.account === 'earnings').reduce((a, e) => a + Number(e.debit) - Number(e.credit), 0);
  assert.ok(Math.abs(earningsNet) < 0.01);
  // recovery posted against peshgi: 10,000 advance - 4,107 recovery = 5,893 still outstanding
  assert.equal((await api('GET', `/workers/${w1}/peshgi`)).body.outstanding, '5893.00');

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
  const batch = (await api('GET', '/moulding')).body[0];
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
