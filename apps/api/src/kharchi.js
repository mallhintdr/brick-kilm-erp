import { ObjectId } from 'mongodb';
import { kharchiProposeInput, kharchiRunInput, kharchaInput, SETTING_DEFAULTS, toPaisa, fromPaisa } from '@kiln/shared';
import { withTransaction } from './db.js';
import { scope, audit, getSetting, postEntry, balance, oid, httpError } from './core.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

// periodEnd arrives as a date-only string (e.g. from an <input type="date">), which
// z.coerce.date() turns into midnight UTC — excluding that whole day's entries. Push
// it to the last instant of that day so "today" actually includes today.
const endOfDay = (d) => new Date(d.getTime() + 24 * 60 * 60 * 1000 - 1);

// A back-dated entry sits at midday of its day; today's keeps the real time.
const kharchaAt = (d) => {
  if (!d) return new Date();
  const day = d.toISOString().slice(0, 10);
  return day === new Date().toISOString().slice(0, 10) ? new Date() : new Date(`${day}T12:00:00.000Z`);
};

// Total dasti kharcha each worker took in a period: { workerId: paisa }
async function takenInPeriod(db, s, workerIds, start, end, session) {
  const rows = await db.collection('kharchaEntries').aggregate([
    { $match: { ...s, workerId: { $in: workerIds }, date: { $gte: start, $lte: end } } },
    { $group: { _id: '$workerId', total: { $sum: { $toDouble: '$amount' } } } },
  ], { session }).toArray();
  return Object.fromEntries(rows.map((r) => [r._id, toPaisa(r.total.toFixed(2))]));
}

// Weekly kharchi = max(gross - r% recovery, floor), but never more than gross itself
// (you can't pay out more than was earned). Recovery is whatever's left over, further
// capped at the worker's actual outstanding peshgi — recovery can't push a worker's
// peshgi balance negative; any amount that can't be recovered is paid out as kharchi
// instead. Matches docs/02-domain-model.md §5 and brick kiln.md §7's worked example.
function splitKharchi(grossPaisa, recoveryPctStr, floorPaisa, outstandingPaisa) {
  const r = Number(recoveryPctStr) / 100;
  const raw = grossPaisa - BigInt(Math.round(Number(grossPaisa) * r));
  let kharchi = raw > floorPaisa ? raw : floorPaisa;
  if (kharchi > grossPaisa) kharchi = grossPaisa;
  if (kharchi < 0n) kharchi = 0n;
  let recovery = grossPaisa - kharchi;
  const cap = outstandingPaisa > 0n ? outstandingPaisa : 0n;
  if (recovery > cap) { recovery = cap; kharchi = grossPaisa - recovery; }
  return { kharchi, recovery };
}

export function registerKharchiRoutes(app, db) {
  const auth = app.locals.auth;

  // Read-only: computes what a run would look like, without posting anything. The munshi
  // reviews/adjusts the `kharchi` amount per worker (brick kiln.md §7) before confirming.
  app.get('/kharchi-runs/propose', auth(), wrap(async (req, res) => {
    const b = kharchiProposeInput.parse(req.query);
    b.periodEnd = endOfDay(b.periodEnd);
    if (b.periodEnd < b.periodStart) throw httpError(400, 'periodEnd must be after periodStart');
    const s = scope(req.user);

    const overlap = await db.collection('kharchiRuns').findOne({
      ...s, category: b.category, periodStart: { $lt: b.periodEnd }, periodEnd: { $gt: b.periodStart },
    });
    if (overlap) throw httpError(409, `A run for this category already covers part of this period (settled ${overlap.periodStart.toISOString().slice(0, 10)} to ${overlap.periodEnd.toISOString().slice(0, 10)})`);

    const teams = await db.collection('teams').find({ ...s, category: b.category }).toArray();
    const inCategory = await db.collection('workers').find({ ...s, category: b.category }, { projection: { _id: 1 } }).toArray();
    const workerIds = [...new Set([...teams.flatMap((t) => t.memberIds || []), ...inCategory.map((w) => String(w._id))])];
    if (!workerIds.length) return res.json({ items: [], recoveryPct: '0', kharchiFloor: '0' });

    const [recoveryPct, kharchiFloorStr] = await Promise.all([
      getSetting(db, req.user, 'recoveryPct', SETTING_DEFAULTS),
      getSetting(db, req.user, 'kharchiFloor', SETTING_DEFAULTS),
    ]);
    const floorPaisa = toPaisa(kharchiFloorStr);

    const grossRows = await db.collection('ledgerEntries').aggregate([
      { $match: { ...s, account: 'earnings', partyId: { $in: workerIds }, createdAt: { $gte: b.periodStart, $lte: b.periodEnd } } },
      { $group: { _id: '$partyId', d: { $sum: '$debit' }, c: { $sum: '$credit' } } },
    ]).toArray();
    const grossByWorker = Object.fromEntries(grossRows.map((r) => [r._id, toPaisa(r.d.toString()) - toPaisa(r.c.toString())]));

    const workers = await db.collection('workers').find({ _id: { $in: workerIds.map((id) => { try { return oid(id); } catch { return null; } }).filter(Boolean) } }).toArray();
    const nameOf = Object.fromEntries(workers.map((w) => [String(w._id), w.name]));

    const taken = await takenInPeriod(db, s, workerIds, b.periodStart, b.periodEnd);
    const earningWorkerIds = workerIds.filter((id) => (grossByWorker[id] || 0n) > 0n || (taken[id] || 0n) > 0n);
    const outstandingByWorker = Object.fromEntries(await Promise.all(
      earningWorkerIds.map(async (id) => [id, toPaisa(await balance(db, req.user, id, 'peshgi'))]),
    ));

    const items = earningWorkerIds.map((workerId) => {
      const gross = grossByWorker[workerId] || 0n;
      const { kharchi, recovery } = splitKharchi(gross, recoveryPct, floorPaisa, outstandingByWorker[workerId] ?? 0n);
      const tk = taken[workerId] || 0n;
      // what is still to hand over on settlement day = kharchi minus cash already taken this week
      return {
        workerId, name: nameOf[workerId] || '—', gross: fromPaisa(gross), kharchi: fromPaisa(kharchi), recovery: fromPaisa(recovery),
        taken: fromPaisa(tk), balance: fromPaisa(kharchi - tk),
      };
    });

    res.json({ items, recoveryPct, kharchiFloor: kharchiFloorStr });
  }));

  // Posts the reviewed run: credits 'earnings' for the gross settled (closes out that
  // period's production value) and credits 'peshgi' for the recovery portion, per worker,
  // in one transaction. Never touches an already-settled period (overlap guard above/below).
  app.post('/kharchi-runs', auth('owner', 'munshi'), wrap(async (req, res) => {
    const b = kharchiRunInput.parse(req.body);
    b.periodEnd = endOfDay(b.periodEnd);
    if (b.periodEnd < b.periodStart) throw httpError(400, 'periodEnd must be after periodStart');

    const result = await withTransaction(db, async (session) => {
      const s = scope(req.user);
      const overlap = await db.collection('kharchiRuns').findOne({
        ...s, category: b.category, periodStart: { $lt: b.periodEnd }, periodEnd: { $gt: b.periodStart },
      }, { session });
      if (overlap) throw httpError(409, 'This period overlaps a run that was already settled');

      const runId = new ObjectId();
      let totalGross = 0n; let totalKharchi = 0n; let totalRecovery = 0n;
      const items = [];

      for (const item of b.items) {
        const gross = toPaisa(item.gross);
        let kharchi = toPaisa(item.kharchi);
        if (kharchi > gross) kharchi = gross; // a munshi can pay less than earned, never more
        let recovery = gross - kharchi;
        // Re-check against the current balance at settle time (not just what propose saw),
        // in case something else changed the worker's peshgi balance in between.
        const outstanding = toPaisa(await balance(db, req.user, item.workerId, 'peshgi', session));
        if (recovery > (outstanding > 0n ? outstanding : 0n)) {
          recovery = outstanding > 0n ? outstanding : 0n;
          kharchi = gross - recovery;
        }
        totalGross += gross; totalKharchi += kharchi; totalRecovery += recovery;
        items.push({ workerId: item.workerId, gross: item.gross, kharchi: fromPaisa(kharchi), recovery: fromPaisa(recovery) });

        if (gross > 0n) {
          await postEntry(db, session, req.user, {
            partyType: 'worker', partyId: item.workerId, account: 'earnings', type: 'kharchi_paid',
            credit: fromPaisa(gross), sourceRef: `kharchiRun:${runId}`, clientUuid: `${b.clientUuid}-e-${item.workerId}`,
          });
        }
        if (recovery > 0n) {
          await postEntry(db, session, req.user, {
            partyType: 'worker', partyId: item.workerId, account: 'peshgi', type: 'recovery',
            credit: fromPaisa(recovery), sourceRef: `kharchiRun:${runId}`, clientUuid: `${b.clientUuid}-p-${item.workerId}`,
          });
        }
      }

      await db.collection('kharchiRuns').insertOne({
        _id: runId, ...s, category: b.category, periodStart: b.periodStart, periodEnd: b.periodEnd,
        totalGross: fromPaisa(totalGross), totalKharchi: fromPaisa(totalKharchi), totalRecovery: fromPaisa(totalRecovery),
        items, createdBy: req.user.sub, createdAt: new Date(),
      }, { session });
      await audit(db, session, req.user, 'kharchi.settle', { category: b.category, periodStart: b.periodStart, periodEnd: b.periodEnd, totalKharchi: fromPaisa(totalKharchi) });

      return { id: runId, totalGross: fromPaisa(totalGross), totalKharchi: fromPaisa(totalKharchi), totalRecovery: fromPaisa(totalRecovery) };
    });
    res.status(201).json(result);
  }));

  // ---- Daily (dasti) kharcha ----
  app.post('/kharcha', auth('owner', 'munshi'), wrap(async (req, res) => {
    const b = kharchaInput.parse(req.body);
    const s = scope(req.user);
    const worker = await db.collection('workers').findOne({ _id: oid(b.workerId), ...s });
    if (!worker) throw httpError(404, 'Worker not found');
    const at = kharchaAt(b.date);
    const r = await withTransaction(db, async (session) => {
      const doc = { ...s, workerId: b.workerId, category: worker.category, amount: b.amount, note: b.note || '', date: at, clientUuid: b.clientUuid, createdBy: req.user.sub };
      const ins = await db.collection('kharchaEntries').insertOne(doc, { session });
      await audit(db, session, req.user, 'kharcha.create', { workerId: b.workerId, amount: b.amount, date: at });
      return ins.insertedId;
    });
    res.status(201).json({ id: r });
  }));

  app.get('/kharcha', auth(), wrap(async (req, res) => {
    const s = scope(req.user);
    const q = { ...s };
    if (req.query.category) q.category = String(req.query.category);
    if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '')) q.date = { ...(q.date || {}), $gte: new Date(`${req.query.from}T00:00:00.000Z`) };
    if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '')) q.date = { ...(q.date || {}), $lte: new Date(`${req.query.to}T23:59:59.999Z`) };
    const rows = await db.collection('kharchaEntries').find(q).sort({ date: -1 }).limit(500).toArray();
    const ids = [...new Set(rows.map((r) => r.workerId))].map((id) => { try { return oid(id); } catch { return null; } }).filter(Boolean);
    const workers = ids.length ? await db.collection('workers').find({ _id: { $in: ids } }).toArray() : [];
    const nameOf = Object.fromEntries(workers.map((w) => [String(w._id), w.fatherName ? `${w.name} — ${w.fatherName}` : w.name]));
    res.json(rows.map((r) => ({ ...r, name: nameOf[r.workerId] || '—' })));
  }));

  app.delete('/kharcha/:id', auth('owner'), wrap(async (req, res) => {
    const r = await db.collection('kharchaEntries').findOneAndDelete({ _id: oid(req.params.id), ...scope(req.user) });
    if (!r) throw httpError(404, 'Entry not found');
    await audit(db, undefined, req.user, 'kharcha.delete', { id: req.params.id, amount: r.amount });
    res.json({ ok: true });
  }));

  app.get('/kharchi-runs', auth(), wrap(async (req, res) => {
    res.json(await db.collection('kharchiRuns').find(scope(req.user)).sort({ periodStart: -1 }).limit(100).toArray());
  }));

  // Single run with worker names attached to each item — used by the printable slip view.
  app.get('/kharchi-runs/:id', auth(), wrap(async (req, res) => {
    const run = await db.collection('kharchiRuns').findOne({ _id: oid(req.params.id), ...scope(req.user) });
    if (!run) throw httpError(404, 'Run not found');
    const workerIds = run.items.map((i) => { try { return oid(i.workerId); } catch { return null; } }).filter(Boolean);
    const workers = workerIds.length ? await db.collection('workers').find({ _id: { $in: workerIds } }).toArray() : [];
    const nameOf = Object.fromEntries(workers.map((w) => [String(w._id), w.name]));
    res.json({ ...run, items: run.items.map((i) => ({ ...i, name: nameOf[i.workerId] || '—' })) });
  }));
}
