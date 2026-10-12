import { ObjectId } from 'mongodb';
import {
  mouldingInput, sectionLoadInput, fireAdvanceInput, firingLogInput,
  unloadStartInput, unloadCompleteInput, grnInput, customerInput, invoiceInput, paymentInput,
  SETTING_DEFAULTS, toPaisa,
} from '@kiln/shared';
import { withTransaction } from './db.js';
import { scope, audit, getSetting, postEntry, oid, httpError, assertType } from './core.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const teamOid = (s) => { try { return new ObjectId(s); } catch { return null; } };

// Splits a piece-work gross amount equally across a team's members and posts
// one earnings-ledger credit per worker, exactly like the seed simulation does.
async function creditTeam(db, session, user, teamId, grossRs, type, sourceRef, clientUuidBase) {
  const team = await db.collection('teams').findOne({ _id: teamOid(teamId), ...scope(user) }, { session });
  if (!team) throw httpError(404, 'Team not found');
  const members = team.memberIds || [];
  if (!members.length) return [];
  const share = (Number(grossRs) / members.length).toFixed(2);
  const out = [];
  for (let i = 0; i < members.length; i++) {
    out.push(await postEntry(db, session, user, {
      partyType: 'worker', partyId: members[i], account: 'earnings', type,
      debit: share, sourceRef, clientUuid: `${clientUuidBase}-${i}`,
    }));
  }
  return out;
}

// Shared by /inventory/summary and the stock guards below, so the number a guard
// checks against is always the exact number the Inventory screen shows.
async function getStockLevels(db, user, session) {
  const s = scope(user);
  const [moulded] = await db.collection('mouldingBatches').aggregate([{ $match: s }, { $group: { _id: null, net: { $sum: '$netCount' } } }], { session }).toArray();
  const [loaded] = await db.collection('sectionLoads').aggregate([{ $match: s }, { $group: { _id: null, count: { $sum: '$count' } } }], { session }).toArray();
  const [coalIn] = await db.collection('grns').aggregate([{ $match: { ...s, item: 'coal' } }, { $group: { _id: null, qty: { $sum: '$qty' } } }], { session }).toArray();
  const [coalUsedKg] = await db.collection('firingLogs').aggregate([{ $match: s }, { $group: { _id: null, kg: { $sum: '$coalKg' } } }], { session }).toArray();
  return {
    greenStock: (moulded?.net ?? 0) - (loaded?.count ?? 0),
    coalOnHandKg: Math.round(((coalIn?.qty ?? 0) * 1000) - (coalUsedKg?.kg ?? 0)),
  };
}

export function registerProductionRoutes(app, db) {
  const auth = app.locals.auth;

  // ---- Kiln section board ----
  app.get('/kiln-sections', auth(), wrap(async (req, res) => {
    res.json(await db.collection('kilnSections').find(scope(req.user)).sort({ index: 1 }).toArray());
  }));

  app.post('/kiln-sections/:index/load', auth('owner', 'munshi'), wrap(async (req, res) => {
    const b = sectionLoadInput.parse({ ...req.body, sectionIndex: req.params.index });
    await withTransaction(db, async (session) => {
      const sec = await db.collection('kilnSections').findOne({ ...scope(req.user), index: b.sectionIndex }, { session });
      if (!sec) throw httpError(404, 'Section not found');
      if (sec.state !== 'Empty') throw httpError(422, `Section ${b.sectionIndex} is not empty (state: ${sec.state})`);
      const allowNegative = (await getSetting(db, req.user, 'allowNegativeStock', SETTING_DEFAULTS, session)) === '1';
      if (!allowNegative) {
        const { greenStock } = await getStockLevels(db, req.user, session);
        if (b.count > greenStock) {
          throw httpError(422, `Only ${greenStock.toLocaleString()} green bricks in stock; enter ${b.count.toLocaleString()} or less (or allow negative stock in Settings)`);
        }
      }
      await db.collection('sectionLoads').insertOne({ ...scope(req.user), sectionIndex: b.sectionIndex, teamId: b.teamId, count: b.count, date: new Date() }, { session });
      await db.collection('kilnSections').updateOne(
        { ...scope(req.user), index: b.sectionIndex },
        { $set: { state: 'Preheating', currentLoad: b.count, loadedAt: new Date() } }, { session },
      );
      const rate = await getSetting(db, req.user, 'rateBharai', SETTING_DEFAULTS, session);
      const gross = ((b.count / 1000) * Number(rate)).toFixed(2);
      await creditTeam(db, session, req.user, b.teamId, gross, 'loading_credit', `sectionLoad:${b.sectionIndex}:${Date.now()}`, b.clientUuid);
      await audit(db, session, req.user, 'section.load', b);
    });
    res.status(201).json({ ok: true });
  }));

  // "Advance fire": moves the fire line forward one step across the whole board.
  app.post('/fire-advance', auth('owner', 'munshi'), wrap(async (req, res) => {
    const b = fireAdvanceInput.parse(req.body);
    const moved = await withTransaction(db, async (session) => {
      const sections = await db.collection('kilnSections').find(scope(req.user)).sort({ index: 1 }).toArray();
      const changes = [];
      const firing = sections.find((s) => s.state === 'Firing');
      if (firing) changes.push({ index: firing.index, from: 'Firing', to: 'Cooling' });
      const preheating = sections.find((s) => s.state === 'Preheating');
      if (preheating) changes.push({ index: preheating.index, from: 'Preheating', to: 'Firing' });
      for (const c of changes) {
        await db.collection('kilnSections').updateOne({ ...scope(req.user), index: c.index }, { $set: { state: c.to } }, { session });
      }
      await db.collection('fireAdvances').insertOne({ ...scope(req.user), date: new Date(), changes, by: req.user.sub, clientUuid: b.clientUuid }, { session });
      await audit(db, session, req.user, 'fire.advance', { changes });
      return changes;
    });
    res.status(201).json({ moved });
  }));

  app.post('/kiln-sections/:index/unload/start', auth('owner', 'munshi'), wrap(async (req, res) => {
    const b = unloadStartInput.parse({ ...req.body, sectionIndex: req.params.index });
    await withTransaction(db, async (session) => {
      const sec = await db.collection('kilnSections').findOne({ ...scope(req.user), index: b.sectionIndex }, { session });
      if (!sec) throw httpError(404, 'Section not found');
      if (sec.state !== 'Cooling') throw httpError(422, `Section ${b.sectionIndex} is not cooled yet (state: ${sec.state})`);
      await db.collection('kilnSections').updateOne(
        { ...scope(req.user), index: b.sectionIndex }, { $set: { state: 'Unloading', nikasiTeamId: b.teamId } }, { session },
      );
      await audit(db, session, req.user, 'section.unload.start', b);
    });
    res.status(201).json({ ok: true });
  }));

  app.post('/kiln-sections/:index/unload/complete', auth('owner', 'munshi', 'mistri'), wrap(async (req, res) => {
    const b = unloadCompleteInput.parse({ ...req.body, sectionIndex: req.params.index });
    await withTransaction(db, async (session) => {
      const sec = await db.collection('kilnSections').findOne({ ...scope(req.user), index: b.sectionIndex }, { session });
      if (!sec) throw httpError(404, 'Section not found');
      if (sec.state !== 'Unloading') throw httpError(422, `Section ${b.sectionIndex} has no nikasi team assigned yet (state: ${sec.state})`);
      const total = b.awwal + b.doem + b.khangar + b.broken;
      await db.collection('unloadings').insertOne({
        ...scope(req.user), sectionIndex: b.sectionIndex, nikasiTeamId: sec.nikasiTeamId,
        awwal: b.awwal, doem: b.doem, khangar: b.khangar, broken: b.broken, date: new Date(),
      }, { session });
      await db.collection('kilnSections').updateOne(
        { ...scope(req.user), index: b.sectionIndex },
        { $set: { state: 'Empty', currentLoad: 0, nikasiTeamId: null } }, { session },
      );
      const rate = await getSetting(db, req.user, 'rateNikasi', SETTING_DEFAULTS, session);
      const gross = ((total / 1000) * Number(rate)).toFixed(2);
      await creditTeam(db, session, req.user, sec.nikasiTeamId, gross, 'unloading_credit', `unloading:${b.sectionIndex}:${Date.now()}`, b.clientUuid);
      await audit(db, session, req.user, 'section.unload.complete', b);
    });
    res.status(201).json({ ok: true });
  }));

  // ---- Moulding (pathai) ----
  app.post('/moulding', auth('owner', 'munshi'), wrap(async (req, res) => {
    const b = mouldingInput.parse(req.body);
    if (b.kharaba > b.count) throw httpError(422, 'Kharaba cannot exceed the moulded count');
    const netCount = b.count - b.kharaba;
    const ledgerRef = `moulding:${b.clientUuid}`; // lets a later delete find and reverse the wage credits
    await withTransaction(db, async (session) => {
      await db.collection('mouldingBatches').insertOne({ ...scope(req.user), teamId: b.teamId, count: b.count, kharaba: b.kharaba, netCount, date: new Date(), status: 'drying', ledgerRef }, { session });
      const rate = await getSetting(db, req.user, 'ratePathera', SETTING_DEFAULTS, session);
      const gross = ((netCount / 1000) * Number(rate)).toFixed(2);
      await creditTeam(db, session, req.user, b.teamId, gross, 'moulding_credit', ledgerRef, b.clientUuid);
      await audit(db, session, req.user, 'moulding.create', b);
    });
    res.status(201).json({ ok: true, netCount });
  }));

  app.get('/moulding', auth(), wrap(async (req, res) => {
    res.json(await db.collection('mouldingBatches').find(scope(req.user)).sort({ date: -1 }).limit(200).toArray());
  }));

  // ---- Firing (jalai) ----
  app.post('/firing-logs', auth('owner', 'munshi', 'mistri'), wrap(async (req, res) => {
    const b = firingLogInput.parse(req.body);
    const ledgerRef = `firing:${b.clientUuid}`;
    await withTransaction(db, async (session) => {
      const allowNegative = (await getSetting(db, req.user, 'allowNegativeStock', SETTING_DEFAULTS, session)) === '1';
      if (!allowNegative) {
        const { coalOnHandKg } = await getStockLevels(db, req.user, session);
        if (b.coalKg > coalOnHandKg) {
          throw httpError(422, `Only ${coalOnHandKg.toLocaleString()} kg coal in stock; enter ${b.coalKg.toLocaleString()} or less (or allow negative stock in Settings)`);
        }
      }
      await db.collection('firingLogs').insertOne({ ...scope(req.user), shift: b.shift, teamId: b.teamId, coalKg: b.coalKg, tempC: b.tempC, fanOn: b.fanOn, genHours: b.genHours, date: new Date(), ledgerRef }, { session });
      const shiftRate = await getSetting(db, req.user, 'rateJalai', SETTING_DEFAULTS, session);
      await creditTeam(db, session, req.user, b.teamId, shiftRate, 'shift_credit', ledgerRef, b.clientUuid);
      await audit(db, session, req.user, 'firing.log', b);
    });
    res.status(201).json({ ok: true, fanAlert: !b.fanOn });
  }));

  app.get('/firing-logs', auth(), wrap(async (req, res) => {
    res.json(await db.collection('firingLogs').find(scope(req.user)).sort({ date: -1 }).limit(200).toArray());
  }));

  app.get('/unloadings', auth(), wrap(async (req, res) => {
    res.json(await db.collection('unloadings').find(scope(req.user)).sort({ date: -1 }).limit(200).toArray());
  }));

  // ---- Procurement (GRN: coal, soil, diesel) ----
  app.post('/grns', auth('owner', 'munshi'), wrap(async (req, res) => {
    const b = grnInput.parse(req.body);
    await assertType(db, req.user, 'procurementItem', b.item);
    const freight = b.freight ?? '0';
    const landedTotal = (b.qty * Number(b.rate) + Number(freight)).toFixed(2);
    const landedUnitCost = (Number(landedTotal) / b.qty).toFixed(2);
    await withTransaction(db, async (session) => {
      const exp = await db.collection('expenses').insertOne({ ...scope(req.user), category: b.item, amount: landedTotal, payee: b.supplierName, date: new Date() }, { session });
      await db.collection('grns').insertOne({
        ...scope(req.user), item: b.item, supplierName: b.supplierName, vehicleNo: b.vehicleNo,
        qty: b.qty, rate: b.rate, freight, landedTotal, landedUnitCost, labFields: b.labFields ?? {}, date: new Date(), expenseId: exp.insertedId,
      }, { session });
      await audit(db, session, req.user, 'grn.create', b);
    });
    res.status(201).json({ ok: true, landedUnitCost });
  }));

  app.get('/grns', auth(), wrap(async (req, res) => {
    res.json(await db.collection('grns').find(scope(req.user)).sort({ date: -1 }).limit(200).toArray());
  }));

  // ---- Inventory (derived, never stored by hand) ----
  app.get('/inventory/summary', auth(), wrap(async (req, res) => {
    const s = scope(req.user);
    const { greenStock, coalOnHandKg } = await getStockLevels(db, req.user);
    const [unloaded] = await db.collection('unloadings').aggregate([
      { $match: s }, { $group: { _id: null, awwal: { $sum: '$awwal' }, doem: { $sum: '$doem' }, khangar: { $sum: '$khangar' }, broken: { $sum: '$broken' } } },
    ]).toArray();
    const soldRows = await db.collection('invoices').aggregate([
      { $match: s }, { $group: { _id: '$grade', qty: { $sum: '$qty' } } },
    ]).toArray();
    const fired = unloaded ?? { awwal: 0, doem: 0, khangar: 0, broken: 0 };
    const stockByGrade = {
      awwal: fired.awwal - (sold.awwal || 0),
      doem: fired.doem - (sold.doem || 0),
      khangar: fired.khangar - (sold.khangar || 0),
    };
    res.json({ greenStock, firedStockByGrade: stockByGrade, coalOnHandKg });
  }));

  app.get('/teams', auth(), wrap(async (req, res) => {
    res.json(await db.collection('teams').find(scope(req.user)).toArray());
  }));

  // ---- Ledger history (full timestamped entry list, not just the running balance) ----
  app.get('/workers/:id/ledger', auth(), wrap(async (req, res) => {
    const rows = await db.collection('ledgerEntries')
      .find({ ...scope(req.user), partyId: req.params.id })
      .sort({ createdAt: -1 }).limit(200).toArray();
    res.json(rows.map((r) => ({
      _id: r._id, account: r.account, type: r.type, debit: r.debit.toString(), credit: r.credit.toString(),
      reason: r.reason, reversesId: r.reversesId, createdAt: r.createdAt,
    })));
  }));

  // ---- Sales: customers, invoices, payments ----
  app.get('/customers', auth(), wrap(async (req, res) => {
    res.json(await db.collection('customers').find(scope(req.user)).toArray());
  }));

  app.post('/customers', auth('owner', 'munshi', 'accountant'), wrap(async (req, res) => {
    const b = customerInput.parse(req.body);
    await assertType(db, req.user, 'customerType', b.type);
    const r = await db.collection('customers').insertOne({
      ...scope(req.user), name: b.name, type: b.type, phone: b.phone, creditLimit: b.creditLimit ?? '0', createdAt: new Date(),
    });
    res.status(201).json({ id: r.insertedId });
  }));

  const PRICE_KEY = { awwal: 'priceAwwal', doem: 'priceDoem', khangar: 'priceKhangar' };

  app.post('/invoices', auth('owner', 'munshi', 'accountant'), wrap(async (req, res) => {
    const b = invoiceInput.parse(req.body);
    const result = await withTransaction(db, async (session) => {
      const customer = await db.collection('customers').findOne({ _id: oid(b.customerId), ...scope(req.user) }, { session });
      if (!customer) throw httpError(404, 'Customer not found');
      const rate = b.rate ?? await getSetting(db, req.user, PRICE_KEY[b.grade], SETTING_DEFAULTS, session);
      const amount = ((b.qty / 1000) * Number(rate)).toFixed(2);
      const tax = (Number(amount) * (b.taxPct / 100)).toFixed(2);
      const doc = {
        ...scope(req.user), customerId: b.customerId, grade: b.grade, qty: b.qty, rate: String(rate),
        amount, tax, status: 'open', date: new Date(), clientUuid: b.clientUuid,
      };
      const r = await db.collection('invoices').insertOne(doc, { session });
      await audit(db, session, req.user, 'invoice.create', { id: r.insertedId, ...b });
      return { id: r.insertedId, amount, tax };
    });
    res.status(201).json(result);
  }));

  app.get('/invoices', auth(), wrap(async (req, res) => {
    res.json(await db.collection('invoices').find(scope(req.user)).sort({ date: -1 }).limit(200).toArray());
  }));

  app.post('/payments', auth('owner', 'munshi', 'accountant'), wrap(async (req, res) => {
    const b = paymentInput.parse(req.body);
    await assertType(db, req.user, 'paymentMode', b.mode);
    const result = await withTransaction(db, async (session) => {
      const invoice = await db.collection('invoices').findOne({ _id: oid(b.invoiceId), ...scope(req.user) }, { session });
      if (!invoice) throw httpError(404, 'Invoice not found');
      const [paidRow] = await db.collection('payments').aggregate([
        { $match: { ...scope(req.user), invoiceId: b.invoiceId } },
        { $group: { _id: null, total: { $sum: { $toDouble: '$amount' } } } },
      ], { session }).toArray();
      const owed = Number(invoice.amount) + Number(invoice.tax) - (paidRow?.total ?? 0);
      if (toPaisa(b.amount) > toPaisa(owed.toFixed(2))) throw httpError(422, `Payment exceeds amount owed (Rs ${owed.toFixed(2)})`);
      const doc = { ...scope(req.user), invoiceId: b.invoiceId, direction: 'in', partyId: invoice.customerId, amount: b.amount, mode: b.mode, date: new Date(), clientUuid: b.clientUuid };
      const r = await db.collection('payments').insertOne(doc, { session });
      const newPaid = (paidRow?.total ?? 0) + Number(b.amount);
      if (newPaid >= Number(invoice.amount) + Number(invoice.tax)) {
        await db.collection('invoices').updateOne({ _id: invoice._id }, { $set: { status: 'paid' } }, { session });
      }
      await audit(db, session, req.user, 'payment.create', b);
      return { id: r.insertedId };
    });
    res.status(201).json(result);
  }));

  app.get('/payments', auth(), wrap(async (req, res) => {
    res.json(await db.collection('payments').find(scope(req.user)).sort({ date: -1 }).limit(200).toArray());
  }));

  // ---- Receivables aging: who owes money, and how overdue (per docs/02-domain-model.md §9) ----
  app.get('/receivables', auth(), wrap(async (req, res) => {
    const s = scope(req.user);
    const invoices = await db.collection('invoices').find({ ...s, status: { $ne: 'paid' } }).sort({ date: 1 }).toArray();
    const paidRows = await db.collection('payments').aggregate([
      { $match: s }, { $group: { _id: '$invoiceId', paid: { $sum: { $toDouble: '$amount' } } } },
    ]).toArray();
    const paidByInvoice = Object.fromEntries(paidRows.map((r) => [r._id, r.paid]));
    const customerIds = [...new Set(invoices.map((i) => i.customerId))].map(oid);
    const customers = customerIds.length ? await db.collection('customers').find({ _id: { $in: customerIds } }).toArray() : [];
    const customerName = Object.fromEntries(customers.map((c) => [String(c._id), c.name]));

    const now = Date.now();
    const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    const rows = invoices.map((inv) => {
      const owed = Number(inv.amount) + Number(inv.tax) - (paidByInvoice[String(inv._id)] || 0);
      const days = Math.floor((now - new Date(inv.date).getTime()) / 86400000);
      const bucket = days <= 30 ? '0-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+';
      buckets[bucket] += owed;
      return { invoiceId: inv._id, customer: customerName[inv.customerId] || '—', date: inv.date, grade: inv.grade, owed: owed.toFixed(2), days, bucket };
    }).filter((r) => Number(r.owed) > 0);

    res.json({
      total: rows.reduce((a, r) => a + Number(r.owed), 0).toFixed(2),
      buckets: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.toFixed(2)])),
      rows: rows.sort((a, b) => b.days - a.days),
    });
  }));

  // ---- Bonded-labour risk: a soft dashboard alert only, never blocks a payment ----
  // Flags a worker whose peshgi balance is still outstanding with no recovery posted in
  // 30+ days, per docs/02-domain-model.md §5 ("fair, transparent records, flags risk").
  app.get('/insights/bonded-labour-risk', auth(), wrap(async (req, res) => {
    const s = scope(req.user);
    const rows = await db.collection('ledgerEntries').aggregate([
      { $match: { ...s, account: 'peshgi' } },
      {
        $group: {
          _id: '$partyId',
          balance: { $sum: { $subtract: ['$debit', '$credit'] } },
          lastRecovery: { $max: { $cond: [{ $eq: ['$type', 'recovery'] }, '$createdAt', null] } },
          lastActivity: { $max: '$createdAt' },
        },
      },
      { $match: { balance: { $gt: 0 } } },
    ]).toArray();

    const flagged = rows.filter((r) => {
      const since = r.lastRecovery || r.lastActivity;
      return !since || (Date.now() - new Date(since).getTime()) / 86400000 >= 30;
    });
    const workerIds = flagged.map((r) => { try { return oid(r._id); } catch { return null; } }).filter(Boolean);
    const workers = workerIds.length ? await db.collection('workers').find({ _id: { $in: workerIds } }).toArray() : [];
    const nameOf = Object.fromEntries(workers.map((w) => [String(w._id), w.name]));

    res.json(flagged.map((r) => ({
      workerId: r._id, name: nameOf[r._id] || '—', outstanding: r.balance.toString(),
      daysSinceRecovery: r.lastRecovery ? Math.floor((Date.now() - new Date(r.lastRecovery).getTime()) / 86400000) : null,
    })));
  }));

  // ---- Master activity feed: every stock/cash movement, timestamped, one place ----
  app.get('/activity', auth(), wrap(async (req, res) => {
    const s = scope(req.user);
    const limit = Math.min(Number(req.query.limit) || 100, 300);
    const [moulding, loads, firing, unloads, grns, invoices, payments, ledger] = await Promise.all([
      db.collection('mouldingBatches').find(s).sort({ date: -1 }).limit(limit).toArray(),
      db.collection('sectionLoads').find(s).sort({ date: -1 }).limit(limit).toArray(),
      db.collection('firingLogs').find(s).sort({ date: -1 }).limit(limit).toArray(),
      db.collection('unloadings').find(s).sort({ date: -1 }).limit(limit).toArray(),
      db.collection('grns').find(s).sort({ date: -1 }).limit(limit).toArray(),
      db.collection('invoices').find(s).sort({ date: -1 }).limit(limit).toArray(),
      db.collection('payments').find(s).sort({ date: -1 }).limit(limit).toArray(),
      db.collection('ledgerEntries').find(s).sort({ createdAt: -1 }).limit(limit).toArray(),
    ]);
    const rows = [
      ...moulding.map((r) => ({ at: r.date, kind: 'moulding', summary: `+${r.netCount} green bricks (kharaba ${r.kharaba})` })),
      ...loads.map((r) => ({ at: r.date, kind: 'load', summary: `Section ${r.sectionIndex}: -${r.count} green → loaded` })),
      ...firing.map((r) => ({ at: r.date, kind: 'firing', summary: `${r.shift} shift: ${r.coalKg} kg coal, ${r.tempC}°C${r.fanOn ? '' : ' — FAN OFF'}` })),
      ...unloads.map((r) => ({ at: r.date, kind: 'unload', summary: `Section ${r.sectionIndex}: Awwal ${r.awwal}, Doem ${r.doem}, Khangar ${r.khangar}, Broken ${r.broken}` })),
      ...grns.map((r) => ({ at: r.date, kind: 'grn', summary: `+${r.qty} ${r.item} from ${r.supplierName} @ Rs ${r.landedUnitCost}/unit` })),
      ...invoices.map((r) => ({ at: r.date, kind: 'invoice', summary: `Sold ${r.qty} ${r.grade} — Rs ${r.amount}`, amount: r.amount })),
      ...payments.map((r) => ({ at: r.date, kind: 'payment', summary: `Payment received — Rs ${r.amount} (${r.mode})`, amount: r.amount })),
      ...ledger.map((r) => ({
        at: r.createdAt, kind: 'ledger', summary: `${r.type} (${r.account}) — debit Rs ${r.debit.toString()}, credit Rs ${r.credit.toString()}`,
      })),
    ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, limit);
    res.json(rows);
  }));

  // ---- Daily cash book (roznamcha): opening cash -> today's in/out -> closing ----
  // Cash in = customer payments received. Cash out = expenses (purchases/diesel, already
  // includes GRN cost) plus peshgi advances actually handed to a worker that day. Kharchi
  // (weekly settlement) isn't its own cash event yet — see docs/03-roadmap.md v1 item #11.
  app.get('/cashbook', auth(), wrap(async (req, res) => {
    const s = scope(req.user);
    const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : new Date().toISOString().slice(0, 10);
    const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
    const dayEnd = new Date(`${dateStr}T23:59:59.999Z`);

    const sumBefore = async (coll, dateField, extraMatch = {}) => {
      const [r] = await db.collection(coll).aggregate([
        { $match: { ...s, ...extraMatch, [dateField]: { $lt: dayStart } } },
        { $group: { _id: null, total: { $sum: { $toDouble: '$amount' } } } },
      ]).toArray();
      return r?.total ?? 0;
    };

    const [inBefore, expBefore, advBefore] = await Promise.all([
      sumBefore('payments', 'date'),
      sumBefore('expenses', 'date'),
      sumBefore('ledgerEntries', 'createdAt', { account: 'peshgi', type: 'advance' }),
    ]);
    const openingCash = inBefore - expBefore - advBefore;

    const [incomeRows, expenseRows, advanceRows] = await Promise.all([
      db.collection('payments').find({ ...s, date: { $gte: dayStart, $lte: dayEnd } }).sort({ date: 1 }).toArray(),
      db.collection('expenses').find({ ...s, date: { $gte: dayStart, $lte: dayEnd } }).sort({ date: 1 }).toArray(),
      db.collection('ledgerEntries').find({ ...s, account: 'peshgi', type: 'advance', createdAt: { $gte: dayStart, $lte: dayEnd } }).sort({ createdAt: 1 }).toArray(),
    ]);

    const customerIds = [...new Set(incomeRows.map((r) => r.partyId))].map(oid);
    const workerIds = [...new Set(advanceRows.map((r) => r.partyId))].map(oid);
    const [customers, workers] = await Promise.all([
      customerIds.length ? db.collection('customers').find({ _id: { $in: customerIds } }).toArray() : [],
      workerIds.length ? db.collection('workers').find({ _id: { $in: workerIds } }).toArray() : [],
    ]);
    const customerName = Object.fromEntries(customers.map((c) => [String(c._id), c.name]));
    const workerName = Object.fromEntries(workers.map((w) => [String(w._id), w.name]));

    const income = incomeRows.map((r) => ({ at: r.date, name: customerName[r.partyId] || '—', detail: `Payment (${r.mode})`, amount: r.amount }));
    const expense = [
      ...expenseRows.map((r) => ({ at: r.date, name: r.payee || r.category, detail: r.category, amount: r.amount })),
      ...advanceRows.map((r) => ({ at: r.createdAt, name: workerName[r.partyId] || '—', detail: 'Peshgi advance', amount: r.debit.toString() })),
    ].sort((a, b) => new Date(a.at) - new Date(b.at));

    const totalIn = income.reduce((a, r) => a + Number(r.amount), 0);
    const totalOut = expense.reduce((a, r) => a + Number(r.amount), 0);

    res.json({
      date: dateStr,
      openingCash: openingCash.toFixed(2),
      totalIn: totalIn.toFixed(2),
      totalOut: totalOut.toFixed(2),
      closingCash: (openingCash + totalIn - totalOut).toFixed(2),
      income, expense,
    });
  }));
}
