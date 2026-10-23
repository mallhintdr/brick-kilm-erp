import { syncGrnToParty } from './personal.js';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import {
  mouldingInput, sectionLoadInput, fireAdvanceInput, kilnNoteInput, firingLogInput,
  unloadStartInput, unloadCompleteInput, grnInput, customerInput, invoiceInput, bookingInput, paymentInput,
  SETTING_DEFAULTS, toPaisa,
} from '@kiln/shared';
import { withTransaction } from './db.js';
import { scope, audit, getSetting, postEntry, oid, httpError, assertType, reverseBySource } from './core.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const teamOid = (s) => { try { return new ObjectId(s); } catch { return null; } };

// Posts one earnings-ledger entry per team member.
// Piece work (`pieces` = { bricks, rate }): the bricks are split equally and each member is paid
// at their own agreed rate per 1,000 if they have one, otherwise the kiln's rate; the entry keeps
// its brick count so the weekly settlement can take the peshgi cut per 1,000 bricks.
// Otherwise (shift pay) `grossRs` is split equally.
export async function creditTeam(db, session, user, teamId, grossRs, type, sourceRef, clientUuidBase, at, pieces) {
  const team = await db.collection('teams').findOne({ _id: teamOid(teamId), ...scope(user) }, { session });
  if (!team) throw httpError(404, 'Team not found');
  const members = team.memberIds || [];
  if (!members.length) return [];
  const workers = pieces
    ? await db.collection('workers').find({ _id: { $in: members.map(teamOid).filter(Boolean) }, ...scope(user) }, { session }).toArray()
    : [];
  const out = [];
  for (let i = 0; i < members.length; i++) {
    let debit = (Number(grossRs) / members.length).toFixed(2);
    let qty = null;
    if (pieces) {
      qty = pieces.bricks / members.length;
      const own = workers.find((w) => String(w._id) === members[i])?.ratePerThousand;
      const rate = own != null && own !== '' ? Number(own) : Number(pieces.rate);
      debit = ((qty / 1000) * rate).toFixed(2);
    }
    out.push(await postEntry(db, session, user, {
      partyType: 'worker', partyId: members[i], account: 'earnings', type,
      debit, sourceRef, clientUuid: `${clientUuidBase}-${i}`, at, qty,
    }));
  }
  return out;
}

// A date-only work day (midnight UTC) is pinned to midday UTC so it stays on the same
// calendar day in Pakistan time; no date means "now".
// One moulding entry per team per work day: further output is an edit of that entry, not a new one.
export async function assertTeamDayFree(db, session, user, teamId, at, exceptId = null) {
  const day = new Date(at); const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  const q = { ...scope(user), teamId, date: { $gte: start, $lt: end } };
  if (exceptId) q._id = { $ne: exceptId };
  if (await db.collection('mouldingBatches').findOne(q, { session })) {
    throw httpError(409, 'This team already has a moulding entry for this day; edit that entry instead');
  }
}

// When an entry happened: today's entries keep the real time; a back-dated one sits at midday of its day.
export const entryAt = (d) => {
  if (!d) return new Date();
  const day = new Date(d).toISOString().slice(0, 10);
  return day === new Date().toISOString().slice(0, 10) ? new Date() : workDateTime(d);
};

// A moulder picked by name works as their own one-person pathera team (created the first time),
// so wages, the weekly grid and settlements keep working per team.
export async function soloTeamFor(db, session, user, workerId, category = 'pathera') {
  const s = scope(user);
  const worker = await db.collection('workers').findOne({ _id: teamOid(workerId), ...s }, { session });
  if (!worker) throw httpError(404, 'Worker not found');
  const existing = await db.collection('teams').findOne({ ...s, category, solo: true, memberIds: [workerId] }, { session });
  if (existing) return String(existing._id);
  const label = worker.fatherName ? `${worker.name} — ${worker.fatherName}` : worker.name;
  const r = await db.collection('teams').insertOne({ ...s, category, label, memberIds: [workerId], solo: true, createdAt: new Date() }, { session });
  return String(r.insertedId);
}

// A crew of several workers (e.g. 2 firemen on a shift): find or make the team with exactly these members.
export async function crewTeamFor(db, session, user, workerIds, category) {
  const ids = [...new Set(workerIds)].sort();
  if (ids.length === 1) return soloTeamFor(db, session, user, ids[0], category);
  const s = scope(user);
  const workers = await db.collection('workers').find({ ...s, _id: { $in: ids.map(teamOid) } }, { session }).toArray();
  if (workers.length !== ids.length) throw httpError(404, 'Worker not found');
  const existing = await db.collection('teams').findOne({ ...s, category, crew: true, memberIds: ids }, { session });
  if (existing) return String(existing._id);
  const label = ids.map((id) => workers.find((w) => String(w._id) === id).name).join(' + ');
  const r = await db.collection('teams').insertOne({ ...s, category, label, memberIds: ids, crew: true, createdAt: new Date() }, { session });
  return String(r.insertedId);
}

export const workDateTime = (d) => (d ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12)) : new Date());

// Shared by /inventory/summary and the stock guards below, so the number a guard
// checks against is always the exact number the Inventory screen shows.
// Opening stock entered once by the owner (what was on hand when the app started).
export async function openingStock(db, user, session) {
  const d = await db.collection('openingStock').findOne(scope(user), { session });
  return { awwal: d?.awwal || 0, doem: d?.doem || 0, khangar: d?.khangar || 0, green: d?.green || 0, coalKg: d?.coalKg || 0, items: d?.items || {} };
}

async function getStockLevels(db, user, session) {
  const s = scope(user);
  const open = await openingStock(db, user, session);
  const [moulded] = await db.collection('mouldingBatches').aggregate([{ $match: s }, { $group: { _id: null, net: { $sum: '$netCount' } } }], { session }).toArray();
  const [loaded] = await db.collection('sectionLoads').aggregate([{ $match: s }, { $group: { _id: null, count: { $sum: '$count' } } }], { session }).toArray();
  const [coalIn] = await db.collection('grns').aggregate([{ $match: { ...s, item: 'coal' } }, { $group: { _id: null, qty: { $sum: { $toDouble: { $ifNull: ['$qty', 0] } } } } }], { session }).toArray();
  const [coalUsedKg] = await db.collection('firingLogs').aggregate([{ $match: s }, { $group: { _id: null, kg: { $sum: '$coalKg' } } }], { session }).toArray();
  return {
    greenStock: open.green + (moulded?.net ?? 0) - (loaded?.count ?? 0),
    coalOnHandKg: Math.round(open.coalKg + ((coalIn?.qty ?? 0) * 1000) - (coalUsedKg?.kg ?? 0)),
  };
}

export function registerProductionRoutes(app, db) {
  const auth = app.locals.auth;

  // ---- Kiln board: chambers or lines ----
  // A kiln is counted either by chambers (kilnSections) or by lines (kilnLines, 120 a side by default).
  // Both run the same cycle: Empty -> load -> Preheating -> Firing -> Cooling -> Unloading -> Empty.
  const KILN_UNITS = {
    chamber: { coll: 'kilnSections', path: 'kiln-sections', label: 'Section' },
    line: { coll: 'kilnLines', path: 'kiln-lines', label: 'Line' },
  };

  // Lines are created the first time the line board is opened, from the kilnLineCount setting.
  async function ensureLines(user) {
    const s = scope(user);
    if (await db.collection('kilnLines').countDocuments(s)) return;
    const total = Math.max(2, Number(await getSetting(db, user, 'kilnLineCount', SETTING_DEFAULTS)) || 240);
    const perSide = Math.ceil(total / 2);
    await db.collection('kilnLines').insertMany(Array.from({ length: total }, (_, i) => ({
      ...s, index: i + 1, side: i < perSide ? 'A' : 'B', state: 'Empty', currentLoad: 0,
    }))).catch((e) => { if (e?.code !== 11000) throw e; }); // two first visits at once: one insert wins
  }

  for (const [unit, U] of Object.entries(KILN_UNITS)) {
    app.get(`/${U.path}`, auth(), wrap(async (req, res) => {
      if (unit === 'line') { await ensureLines(req.user); await recomputeLines(req.user); } // states follow the fire position
      const rows = await db.collection(U.coll).find(scope(req.user)).sort({ index: 1 }).toArray();
      // an empty chamber/line still shows its last finished cycle (for the nikasi board)
      const last = await db.collection('kilnCycles').aggregate([
        { $match: { ...scope(req.user), unit } }, { $sort: { unloadedAt: -1 } },
        { $group: { _id: '$index', c: { $first: '$$ROOT' } } },
      ]).toArray();
      const lastBy = new Map(last.map((x) => [x._id, x.c]));
      for (const r of rows) {
        const c = !r.currentLoad && lastBy.get(r.index);
        if (c) r.last = { loadedAt: c.loadedAt, count: c.count, firedAt: c.firedAt, unloadedAt: c.unloadedAt, coalKg: (c.coalKg || 0) + (c.logCoalKg || 0), awwal: c.awwal, doem: c.doem, khangar: c.khangar };
      }
      res.json(rows);
    }));

    app.post(`/${U.path}/:index/load`, auth('owner', 'munshi'), wrap(async (req, res) => {
      const b = sectionLoadInput.parse({ ...req.body, sectionIndex: req.params.index });
      if (!b.teamId && b.workerId) b.teamId = await soloTeamFor(db, undefined, req.user, b.workerId, 'bharai');
      if (!b.teamId) throw httpError(400, 'Choose a loader or a team');
      await withTransaction(db, async (session) => {
        const sec = await db.collection(U.coll).findOne({ ...scope(req.user), index: b.sectionIndex }, { session });
        if (!sec) throw httpError(404, `${U.label} not found`);
        if (sec.state !== 'Empty') throw httpError(422, `${U.label} ${b.sectionIndex} is not empty (state: ${sec.state})`);
        const allowNegative = (await getSetting(db, req.user, 'allowNegativeStock', SETTING_DEFAULTS, session)) === '1';
        if (!allowNegative) {
          const { greenStock } = await getStockLevels(db, req.user, session);
          if (b.count > greenStock) {
            throw httpError(422, `Only ${greenStock.toLocaleString()} green bricks in stock; enter ${b.count.toLocaleString()} or less (or allow negative stock in Settings)`);
          }
        }
        const at = entryAt(b.date);
        const loadRef = `${unit}Load:${b.sectionIndex}:${Date.now()}`;
        await db.collection('sectionLoads').insertOne({ ...scope(req.user), unit, sectionIndex: b.sectionIndex, teamId: b.teamId, count: b.count, date: at, ledgerRef: loadRef }, { session });
        await db.collection(U.coll).updateOne(
          { ...scope(req.user), index: b.sectionIndex },
          { $set: { state: 'Preheating', currentLoad: b.count, loadedAt: at, loadTeamId: b.teamId, loadRef, firedAt: null, cooledAt: null, stage: null, coalKg: 0, issues: '' }, $inc: { round: 1 } }, { session },
        );
        const rate = await getSetting(db, req.user, 'rateBharai', SETTING_DEFAULTS, session);
        const gross = ((b.count / 1000) * Number(rate)).toFixed(2);
        await creditTeam(db, session, req.user, b.teamId, gross, 'loading_credit', loadRef, b.clientUuid, at, { bricks: b.count, rate });
        await db.collection('sectionLoads').updateOne({ ...scope(req.user), ledgerRef: loadRef }, { $set: { round: (sec.round || 0) + 1 } }, { session });
        if (unit === 'line') await recomputeLines(req.user, session);
        await audit(db, session, req.user, `${unit}.load`, b);
      });
      res.status(201).json({ ok: true });
    }));

    // The load currently in a chamber/line, and the wage entries it posted (older loads: found by prefix).
    async function currentLoad(user, index, session) {
      const s = scope(user);
      const sec = await db.collection(U.coll).findOne({ ...s, index }, { session });
      if (!sec) throw httpError(404, `${U.label} not found`);
      if (sec.state === 'Empty' || !sec.currentLoad) throw httpError(422, `${U.label} ${index} has no bricks loaded`);
      const rec = await db.collection('sectionLoads').find({ ...s, unit: unit === 'line' ? 'line' : { $in: ['chamber', null] }, sectionIndex: index }, { session })
        .sort({ date: -1, _id: -1 }).limit(1).next();
      let ref = sec.loadRef || rec?.ledgerRef;
      if (!ref) {
        const last = await db.collection('ledgerEntries').find({ ...s, sourceRef: { $regex: `^${unit}Load:${index}:` }, reversesId: null }, { session })
          .sort({ createdAt: -1 }).limit(1).next();
        ref = last?.sourceRef;
      }
      return { sec, rec, ref };
    }

    // Owner corrects a load (bricks, day, loader): old wages reversed, corrected wages posted.
    app.put(`/${U.path}/:index/load`, auth('owner'), wrap(async (req, res) => {
      const index = Number(req.params.index);
      const b = z.object({
        count: z.coerce.number().int().positive().optional(), date: z.coerce.date().optional(),
        teamId: z.string().optional(), workerId: z.string().optional(),
      }).parse(req.body);
      if (b.date && b.date.getTime() > Date.now() + 86400000) throw httpError(400, 'Date cannot be in the future');
      if (!b.teamId && b.workerId) b.teamId = await soloTeamFor(db, undefined, req.user, b.workerId, 'bharai');
      await withTransaction(db, async (session) => {
        const { sec, rec, ref } = await currentLoad(req.user, index, session);
        const count = b.count ?? sec.currentLoad;
        const teamId = b.teamId ?? sec.loadTeamId ?? rec?.teamId;
        const at = b.date ? entryAt(b.date) : (sec.loadedAt || rec?.date || new Date());
        if (!teamId) throw httpError(422, 'Choose who loaded it');
        if (ref) await reverseBySource(db, session, req.user, ref, 'loading corrected');
        const newRef = `${unit}Load:${index}:${Date.now()}`;
        const rate = await getSetting(db, req.user, 'rateBharai', SETTING_DEFAULTS, session);
        await creditTeam(db, session, req.user, teamId, ((count / 1000) * Number(rate)).toFixed(2), 'loading_credit', newRef, `${newRef}-edit`, at, { bricks: count, rate });
        if (rec) await db.collection('sectionLoads').updateOne({ _id: rec._id }, { $set: { count, teamId, date: at, ledgerRef: newRef } }, { session });
        await db.collection(U.coll).updateOne({ _id: sec._id }, { $set: { currentLoad: count, loadTeamId: teamId, loadedAt: at, loadRef: newRef } }, { session });
        await audit(db, session, req.user, `${unit}.load.edit`, { index, before: { count: sec.currentLoad, teamId: sec.loadTeamId, at: sec.loadedAt }, after: { count, teamId, at } });
      });
      res.json({ ok: true });
    }));

    // Owner undoes a load that has not caught fire yet: wages reversed, chamber/line empty again.
    app.delete(`/${U.path}/:index/load`, auth('owner'), wrap(async (req, res) => {
      const index = Number(req.params.index);
      await withTransaction(db, async (session) => {
        const { sec, rec, ref } = await currentLoad(req.user, index, session);
        if (!['Preheating', 'Loading'].includes(sec.state) || sec.firedAt) throw httpError(422, `${U.label} ${index} is already ${sec.state.toLowerCase()}; only a load that has not caught fire can be undone`);
        if (ref) await reverseBySource(db, session, req.user, ref, 'loading undone');
        if (rec) await db.collection('sectionLoads').deleteOne({ _id: rec._id }, { session });
        await db.collection(U.coll).updateOne({ _id: sec._id }, {
          $set: { state: 'Empty', currentLoad: 0, loadTeamId: null, loadedAt: null, loadRef: null, coalKg: 0, issues: '' },
          $inc: { round: -1 },
        }, { session });
        if (unit === 'line') await recomputeLines(req.user, session);
        await audit(db, session, req.user, `${unit}.load.undo`, { index, count: sec.currentLoad });
      });
      res.json({ ok: true });
    }));

    app.post(`/${U.path}/:index/unload/start`, auth('owner', 'munshi'), wrap(async (req, res) => {
      const b = unloadStartInput.parse({ ...req.body, sectionIndex: req.params.index });
      if (!b.teamId && b.workerId) b.teamId = await soloTeamFor(db, undefined, req.user, b.workerId, 'nikasi');
      if (!b.teamId) throw httpError(400, 'Choose an unloader or a team');
      await withTransaction(db, async (session) => {
        const sec = await db.collection(U.coll).findOne({ ...scope(req.user), index: b.sectionIndex }, { session });
        if (!sec) throw httpError(404, `${U.label} not found`);
        const ready = unit === 'line' ? (sec.state === 'Ready' || sec.stage === 'Cooling') : sec.state === 'Cooling';
        if (!ready) throw httpError(422, unit === 'line'
          ? `Line ${b.sectionIndex} is not ready for nikasi (${sec.state === 'Cooling' ? 'still hot behind the fire' : sec.state})`
          : `Chamber ${b.sectionIndex} is not cooled yet (state: ${sec.state})`);
        await db.collection(U.coll).updateOne(
          { ...scope(req.user), index: b.sectionIndex }, { $set: { state: 'Unloading', nikasiTeamId: b.teamId, unloadStartedAt: entryAt(b.date) } }, { session },
        );
        await audit(db, session, req.user, `${unit}.unload.start`, b);
      });
      res.status(201).json({ ok: true });
    }));

    // owner cancels a nikasi that was started (team assigned) but not finished
    app.post(`/${U.path}/:index/unload/cancel`, auth('owner'), wrap(async (req, res) => {
      const index = Number(req.params.index);
      await withTransaction(db, async (session) => {
        const sec = await db.collection(U.coll).findOne({ ...scope(req.user), index }, { session });
        if (!sec) throw httpError(404, `${U.label} not found`);
        if (!sec.nikasiTeamId) throw httpError(422, `${U.label} ${index} has no nikasi started`);
        await db.collection(U.coll).updateOne({ _id: sec._id }, { $set: { nikasiTeamId: null, unloadStartedAt: null, state: unit === 'line' ? 'Ready' : 'Cooling' } }, { session });
        if (unit === 'line') await recomputeLines(req.user, session);
        await audit(db, session, req.user, `${unit}.unload.cancel`, { index });
      });
      res.json({ ok: true });
    }));

    app.post(`/${U.path}/:index/unload/complete`, auth('owner', 'munshi', 'mistri'), wrap(async (req, res) => {
      const b = unloadCompleteInput.parse({ ...req.body, sectionIndex: req.params.index });
      await withTransaction(db, async (session) => {
        const sec = await db.collection(U.coll).findOne({ ...scope(req.user), index: b.sectionIndex }, { session });
        if (!sec) throw httpError(404, `${U.label} not found`);
        if (sec.state !== 'Unloading') throw httpError(422, `${U.label} ${b.sectionIndex} has no nikasi team assigned yet (state: ${sec.state})`);
        const total = b.awwal + b.doem + b.khangar + b.broken;
        const at = entryAt(b.date);
        const unloadRef = `${unit}Unloading:${b.sectionIndex}:${Date.now()}`;
        await db.collection('unloadings').insertOne({
          ...scope(req.user), unit, sectionIndex: b.sectionIndex, nikasiTeamId: sec.nikasiTeamId, ledgerRef: unloadRef, round: sec.round || 1,
          awwal: b.awwal, doem: b.doem, khangar: b.khangar, broken: b.broken, date: at,
        }, { session });
        // one row per finished cycle: when it was loaded, fired, unloaded, its coal, output and issues
        await db.collection('kilnCycles').insertOne({
          ...scope(req.user), unit, index: b.sectionIndex, round: sec.round || 1, count: sec.currentLoad || 0,
          loadTeamId: sec.loadTeamId ?? null, nikasiTeamId: sec.nikasiTeamId ?? null,
          loadedAt: sec.loadedAt ?? null, firedAt: sec.firedAt ?? null, cooledAt: sec.cooledAt ?? null, unloadedAt: at,
          coalKg: sec.coalKg || 0, logCoalKg: sec.logCoalKg || 0, issues: sec.issues || '',
          awwal: b.awwal, doem: b.doem, khangar: b.khangar, broken: b.broken,
        }, { session });
        await db.collection(U.coll).updateOne(
          { ...scope(req.user), index: b.sectionIndex },
          { $set: { state: 'Empty', currentLoad: 0, nikasiTeamId: null, loadTeamId: null, loadedAt: null, firedAt: null, cooledAt: null, stage: null, coalKg: 0, logCoalKg: 0, unloadStartedAt: null, issues: '' } }, { session },
        );
        const rate = await getSetting(db, req.user, 'rateNikasi', SETTING_DEFAULTS, session);
        const gross = ((total / 1000) * Number(rate)).toFixed(2);
        await creditTeam(db, session, req.user, sec.nikasiTeamId, gross, 'unloading_credit', unloadRef, b.clientUuid, at, { bricks: total, rate });
        if (unit === 'line') await recomputeLines(req.user, session);
        await audit(db, session, req.user, `${unit}.unload.complete`, b);
      });
      res.status(201).json({ ok: true });
    }));

    // Coal and issues can be noted at any point in the cycle (they are saved with the cycle on unloading).
    app.put(`/${U.path}/:index/notes`, auth('owner', 'munshi', 'mistri'), wrap(async (req, res) => {
      const b = kilnNoteInput.parse(req.body);
      const index = Number(req.params.index);
      const set = {};
      if (b.coalKg !== undefined) set.coalKg = b.coalKg;
      if (b.issues !== undefined) set.issues = b.issues;
      const r = await db.collection(U.coll).updateOne({ ...scope(req.user), index }, { $set: set });
      if (!r.matchedCount) throw httpError(404, `${U.label} not found`);
      await audit(db, undefined, req.user, `${unit}.notes`, { index, ...set });
      res.json({ ok: true });
    }));

    // Past cycles of one chamber/line, newest first.
    app.get(`/${U.path}/:index/history`, auth(), wrap(async (req, res) => {
      res.json(await db.collection('kilnCycles').find({ ...scope(req.user), unit, index: Number(req.params.index) })
        .sort({ unloadedAt: -1 }).limit(50).toArray());
    }));
  }

  // ---- Line kiln: states of the lines ----
  // Firing log entries (line no + time + coal) drive the board: a line is fired from its first log of
  // this round, and the fire is at the line of the latest log. Without any line logs, the older fire
  // position (start / advance) is used. Of the fired lines behind the fire, the nearest `hotLines`
  // stay Cooling (still hot, inside the kiln); the rest are Ready for nikasi. Loaded lines not fired
  // yet are just Loading, or Preheating when marked so with the stage button.
  async function recomputeLines(user, session) {
    const s = scope(user);
    const [fire, lines, logs] = await Promise.all([
      db.collection('kilnFire').findOne(s, { session }),
      db.collection('kilnLines').find(s, { session, projection: { index: 1, state: 1, currentLoad: 1, loadedAt: 1, firedAt: 1, nikasiTeamId: 1, stage: 1, logCoalKg: 1 } }).toArray(),
      db.collection('firingLogs').find({ ...s, lineIndex: { $gte: 1 } }, { session, projection: { lineIndex: 1, date: 1, coalKg: 1 } }).toArray(),
    ]);
    const N = lines.length;
    const hotRaw = Number(await getSetting(db, user, 'hotLines', SETTING_DEFAULTS, session));
    const hot = Number.isFinite(hotRaw) && hotRaw >= 0 ? hotRaw : 30; // 0 is a real choice, not blank
    const logMode = logs.length > 0;
    const DAY = 864e5; const PK = 5 * 3600e3; // Pakistan day
    const pkDayStart = (d) => Math.floor((new Date(d).getTime() + PK) / DAY) * DAY - PK;
    const byLine = new Map();
    for (const g of logs) { if (!byLine.has(g.lineIndex)) byLine.set(g.lineIndex, []); byLine.get(g.lineIndex).push(g); }
    const info = new Map(); // index -> { first, last, coal } from this round's logs
    let latest = null;
    for (const l of lines) {
      if (!l.currentLoad || l.nikasiTeamId) continue;
      const from = l.loadedAt ? pkDayStart(l.loadedAt) : 0;
      const mine = (byLine.get(l.index) || []).filter((g) => new Date(g.date).getTime() >= from);
      if (!mine.length) continue;
      const times = mine.map((g) => new Date(g.date).getTime());
      const it = { first: Math.min(...times), last: Math.max(...times), coal: mine.reduce((acc, g) => acc + (g.coalKg || 0), 0) };
      info.set(l.index, it);
      if (!latest || it.last > latest.at) latest = { index: l.index, at: it.last };
    }
    const F = logMode ? (latest?.index ?? null) : (fire?.index ?? null);
    if (logMode && (fire?.index ?? null) !== F) {
      await db.collection('kilnFire').updateOne(s, { $set: { index: F, updatedAt: new Date() }, $setOnInsert: s }, { upsert: true, session });
    }
    const firedAt = (l) => (logMode ? info.get(l.index)?.first ?? null : (l.firedAt ? new Date(l.firedAt).getTime() : null));
    const lastAt = (l) => (logMode ? info.get(l.index)?.last : new Date(l.firedAt).getTime()) || 0;
    const live = (l) => l.currentLoad && !l.nikasiTeamId;
    const behind = lines.filter((l) => live(l) && l.stage !== 'Cooling' && l.index !== F && firedAt(l) != null);
    behind.sort((x, y) => (F ? ((F - x.index + N) % N) - ((F - y.index + N) % N) : lastAt(y) - lastAt(x)));
    const hotSet = new Set(behind.slice(0, hot).map((l) => l.index));
    const ops = [];
    for (const l of lines) {
      let st;
      if (!l.currentLoad) st = 'Empty';
      else if (l.nikasiTeamId) st = 'Unloading';
      else if (l.stage === 'Cooling') st = 'Cooling'; // set by hand with the stage buttons
      else if (F && l.index === F && (firedAt(l) != null || !logMode)) st = 'Firing';
      else if (firedAt(l) != null) st = hotSet.has(l.index) ? 'Cooling' : 'Ready';
      else if (l.stage === 'Preheating') st = 'Preheating'; // marked by hand
      else st = 'Loading';
      const set = {};
      if (st !== l.state) set.state = st;
      if (logMode && live(l)) {
        const fa = firedAt(l);
        const cur = l.firedAt ? new Date(l.firedAt).getTime() : null;
        if (fa !== cur && l.stage !== 'Cooling') set.firedAt = fa == null ? null : new Date(fa);
        const coal = info.get(l.index)?.coal || 0;
        if ((l.logCoalKg || 0) !== coal) set.logCoalKg = coal;
      }
      if (Object.keys(set).length) ops.push({ updateOne: { filter: { _id: l._id }, update: { $set: set } } });
    }
    if (ops.length) await db.collection('kilnLines').bulkWrite(ops, { session });
  }
  app.locals.recomputeLines = recomputeLines;

  app.post('/kiln-lines/:index/stage', auth('owner', 'munshi'), wrap(async (req, res) => {
    const b = z.object({ stage: z.enum(['Cooling', 'Preheating', 'Loading']), at: z.coerce.date().optional() }).parse(req.body);
    const when = b.at || new Date();
    if (when.getTime() > Date.now() + 5 * 60 * 1000) throw httpError(400, 'Date cannot be in the future');
    const index = Number(req.params.index);
    await withTransaction(db, async (session) => {
      const s = scope(req.user);
      const line = await db.collection('kilnLines').findOne({ ...s, index }, { session });
      if (!line) throw httpError(404, 'Line not found');
      if (!line.currentLoad) throw httpError(422, `Line ${index} is not loaded`);
      if (line.nikasiTeamId) throw httpError(422, `Line ${index} is already being unloaded`);
      if (b.stage !== 'Cooling') {
        // mark (or unmark) a loaded line as preheating; only before it is fired
        if (line.firedAt || line.state === 'Firing') throw httpError(422, `Line ${index} is already fired`);
        await db.collection('kilnLines').updateOne({ _id: line._id }, { $set: { stage: b.stage === 'Preheating' ? 'Preheating' : null, preheatedAt: b.stage === 'Preheating' ? when : null } }, { session });
        await recomputeLines(req.user, session);
        await audit(db, session, req.user, 'line.stage', { index, stage: b.stage });
        return;
      }
      if (!line.firedAt && line.state !== 'Firing') throw httpError(422, `Line ${index} has not been fired yet; fire it first`);
      await db.collection('kilnLines').updateOne({ _id: line._id }, { $set: { stage: 'Cooling', cooledAt: when, firedAt: line.firedAt || when } }, { session });
      // if the fire was here, it has moved on: take the position away from this line
      await db.collection('kilnFire').updateOne({ ...s, index }, { $set: { index: null, updatedAt: new Date() } }, { session });
      await recomputeLines(req.user, session);
      await audit(db, session, req.user, 'line.stage', { index, stage: b.stage, at: when });
    });
    res.json({ ok: true });
  }));

  app.get('/kiln-fire', auth(), wrap(async (req, res) => {
    res.json(await db.collection('kilnFire').findOne(scope(req.user)) || { index: null });
  }));

  // Owner starts (or moves) the fire at any loaded line, at a chosen time (old records) or now.
  app.post('/kiln-fire/start', auth('owner', 'munshi'), wrap(async (req, res) => {
    const b = z.object({ index: z.coerce.number().int().min(1), at: z.coerce.date().optional() }).parse(req.body);
    const when = b.at || new Date();
    if (when.getTime() > Date.now() + 5 * 60 * 1000) throw httpError(400, 'Date cannot be in the future');
    await withTransaction(db, async (session) => {
      const s = scope(req.user);
      const line = await db.collection('kilnLines').findOne({ ...s, index: b.index }, { session });
      if (!line) throw httpError(404, 'Line not found');
      if (!line.currentLoad) throw httpError(422, `Line ${b.index} has no bricks; load it before starting the fire there`);
      await db.collection('kilnFire').updateOne(s, { $set: { index: b.index, startIndex: b.index, startedAt: when, updatedAt: new Date() }, $setOnInsert: s }, { upsert: true, session });
      await db.collection('kilnLines').updateOne({ _id: line._id }, { $set: { firedAt: line.firedAt || when, stage: null } }, { session });
      await recomputeLines(req.user, session);
      await audit(db, session, req.user, 'fire.start', { index: b.index, at: when });
    });
    res.json({ ok: true });
  }));

  // Owner clears the fire (testing / starting over): loaded lines go back to Preheating.
  app.post('/kiln-fire/reset', auth('owner'), wrap(async (req, res) => {
    await withTransaction(db, async (session) => {
      const s = scope(req.user);
      await db.collection('kilnFire').deleteOne(s, { session });
      await db.collection('kilnLines').updateMany({ ...s, nikasiTeamId: { $in: [null, undefined] } }, { $set: { firedAt: null, cooledAt: null, stage: null } }, { session });
      await recomputeLines(req.user, session);
      await audit(db, session, req.user, 'fire.reset', {});
    });
    res.json({ ok: true });
  }));

  // "Advance fire". Lines: the fire moves on to the next line(s) clockwise; each must be loaded.
  // Chambers: the firing chamber cools and the next preheated one catches fire.
  app.post('/fire-advance', auth('owner', 'munshi'), wrap(async (req, res) => {
    const b = fireAdvanceInput.parse(req.body);
    const when = b.at || new Date(); // firing time stamped on the lines it reaches
    const U = KILN_UNITS[b.unit];
    const moved = await withTransaction(db, async (session) => {
      const changes = [];
      if (b.unit === 'line') {
        const s = scope(req.user);
        const fire = await db.collection('kilnFire').findOne(s, { session });
        if (!fire?.index) throw httpError(422, 'Start the fire at a line first (tap the line, then "Start fire here")');
        const N = await db.collection('kilnLines').countDocuments(s, { session });
        let F = fire.index;
        for (let step = 0; step < b.steps; step++) {
          const next = (F % N) + 1;
          const line = await db.collection('kilnLines').findOne({ ...s, index: next }, { session });
          if (!line?.currentLoad) {
            if (!step) throw httpError(422, `Line ${next} is not loaded; load it before the fire can move on`);
            break;
          }
          await db.collection('kilnLines').updateOne({ _id: line._id }, { $set: { firedAt: when } }, { session });
          changes.push({ index: next, from: line.state, to: 'Firing' });
          F = next;
        }
        await db.collection('kilnFire').updateOne(s, { $set: { index: F, updatedAt: new Date() } }, { session });
        await recomputeLines(req.user, session);
      } else {
        for (let step = 0; step < b.steps; step++) {
          const rows = await db.collection(U.coll).find(scope(req.user), { session }).sort({ index: 1 }).toArray();
          const stepChanges = [];
          const firing = rows.find((r) => r.state === 'Firing');
          if (firing) stepChanges.push({ index: firing.index, from: 'Firing', to: 'Cooling' });
          const preheating = rows.find((r) => r.state === 'Preheating');
          if (preheating) stepChanges.push({ index: preheating.index, from: 'Preheating', to: 'Firing' });
          if (!stepChanges.length) break;
          for (const c of stepChanges) {
            const stamp = c.to === 'Firing' ? { firedAt: when } : c.to === 'Cooling' ? { cooledAt: when } : {};
            await db.collection(U.coll).updateOne({ ...scope(req.user), index: c.index }, { $set: { state: c.to, ...stamp } }, { session });
          }
          changes.push(...stepChanges);
        }
      }
      await db.collection('fireAdvances').insertOne({ ...scope(req.user), unit: b.unit, steps: b.steps, date: when, changes, by: req.user.sub, clientUuid: b.clientUuid }, { session });
      await audit(db, session, req.user, 'fire.advance', { unit: b.unit, steps: b.steps, changes });
      return changes;
    });
    res.status(201).json({ moved });
  }));

  // ---- Moulding (pathai) ----
  app.post('/moulding', auth('owner', 'munshi'), wrap(async (req, res) => {
    const b = mouldingInput.parse(req.body);
    if (!b.teamId) b.teamId = await soloTeamFor(db, undefined, req.user, b.workerId);
    if (b.kharaba > b.count) throw httpError(422, 'Kharaba cannot exceed the moulded count');
    // net = moulded - rain loss - breakage deduction (a % of the count, usually 2)
    const deduction = Math.round((b.count * b.deductionPct) / 100);
    const netCount = b.count - b.kharaba - deduction;
    if (netCount < 0) throw httpError(422, 'Wastage and deduction cannot exceed the moulded count');
    const ledgerRef = `moulding:${b.clientUuid}`; // lets a later delete find and reverse the wage credits
    const workAt = workDateTime(b.date);
    await withTransaction(db, async (session) => {
      await assertTeamDayFree(db, session, req.user, b.teamId, workAt);
      await db.collection('mouldingBatches').insertOne({ ...scope(req.user), teamId: b.teamId, count: b.count, kharaba: b.kharaba, deductionPct: b.deductionPct, deduction, quality: b.quality ?? null, netCount, date: workAt, status: 'drying', ledgerRef }, { session });
      const rate = await getSetting(db, req.user, 'ratePathera', SETTING_DEFAULTS, session);
      const gross = ((netCount / 1000) * Number(rate)).toFixed(2);
      // Wages are dated to the work day too, so the weekly kharchi run puts them in the right week.
      await creditTeam(db, session, req.user, b.teamId, gross, 'moulding_credit', ledgerRef, b.clientUuid, workAt, { bricks: netCount, rate });
      await audit(db, session, req.user, 'moulding.create', b);
    });
    res.status(201).json({ ok: true, netCount });
  }));

  app.get('/moulding', auth(), wrap(async (req, res) => {
    // ?from=YYYY-MM-DD&to=YYYY-MM-DD returns every batch in that range (used by the weekly grid)
    const { from, to } = req.query;
    if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
      const range = { $gte: new Date(`${from}T00:00:00Z`), $lte: new Date(`${to}T23:59:59.999Z`) };
      return res.json(await db.collection('mouldingBatches').find({ ...scope(req.user), date: range }).sort({ date: 1 }).toArray());
    }
    res.json(await db.collection('mouldingBatches').find(scope(req.user)).sort({ date: -1 }).limit(200).toArray());
  }));

  // ---- Firing (jalai) ----
  app.post('/firing-logs', auth('owner', 'munshi', 'mistri'), wrap(async (req, res) => {
    const b = firingLogInput.parse(req.body);
    const crew = b.workerIds?.length || 0;
    if (crew) b.teamId = await crewTeamFor(db, undefined, req.user, b.workerIds, 'jalai');
    if (!b.teamId) throw httpError(400, 'Choose the fireman');
    const ledgerRef = `firing:${b.clientUuid}`;
    await withTransaction(db, async (session) => {
      const allowNegative = (await getSetting(db, req.user, 'allowNegativeStock', SETTING_DEFAULTS, session)) === '1';
      if (!allowNegative) {
        const { coalOnHandKg } = await getStockLevels(db, req.user, session);
        if (b.coalKg > coalOnHandKg) {
          throw httpError(422, `Only ${coalOnHandKg.toLocaleString()} kg coal in stock; enter ${b.coalKg.toLocaleString()} or less (or allow negative stock in Settings)`);
        }
      }
      let at = entryAt(b.date);
      if (b.time) {
        const day = b.date ? new Date(b.date).toISOString().slice(0, 10) : new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
        at = new Date(`${day}T${b.time}:00+05:00`); // time is entered in Pakistan time
        if (at.getTime() > Date.now() + 5 * 60 * 1000) throw httpError(400, 'Time cannot be in the future');
      }
      await db.collection('firingLogs').insertOne({ ...scope(req.user), shift: b.shift, teamId: b.teamId, lineIndex: b.lineIndex ?? null, coalKg: b.coalKg, tempC: b.tempC, fanOn: b.fanOn, genHours: b.genHours, date: at, ledgerRef }, { session });
      if (b.lineIndex) {
        const line = await db.collection('kilnLines').findOne({ ...scope(req.user), index: b.lineIndex }, { session });
        if (!line) throw httpError(404, `Line ${b.lineIndex} not found`);
        if (!line.currentLoad) throw httpError(422, `Line ${b.lineIndex} is not loaded`);
      }
      const shiftRate = await getSetting(db, req.user, 'rateJalai', SETTING_DEFAULTS, session);
      // one shift rate per shift, paid to the fireman (he pays the helpers under him)
      await creditTeam(db, session, req.user, b.teamId, shiftRate, 'shift_credit', ledgerRef, b.clientUuid, at);
      if (b.lineIndex) await recomputeLines(req.user, session);
      await audit(db, session, req.user, 'firing.log', b);
    });
    res.status(201).json({ ok: true, fanAlert: !b.fanOn });
  }));

  app.get('/firing-logs', auth(), wrap(async (req, res) => {
    res.json(await db.collection('firingLogs').find(scope(req.user)).sort({ date: -1 }).limit(200).toArray());
  }));

  // ---- Opening stock (owner): on-hand quantities when the kiln started using the app ----
  app.get('/opening-stock', auth(), wrap(async (req, res) => {
    const d = await db.collection('openingStock').findOne(scope(req.user));
    res.json({ ...(await openingStock(db, req.user)), asOf: d?.asOf || null, updatedAt: d?.updatedAt || null });
  }));
  app.put('/opening-stock', auth('owner'), wrap(async (req, res) => {
    const num = (v) => { const x = Number(v); if (!Number.isFinite(x) || x < 0) throw httpError(400, 'Quantities must be 0 or more'); return x; };
    const b = req.body || {};
    const items = {};
    for (const [k, v] of Object.entries(b.items || {})) if (/^[a-z0-9_]{2,30}$/.test(k) && v !== '' && v != null) items[k] = num(v);
    const doc = {
      awwal: num(b.awwal || 0), doem: num(b.doem || 0), khangar: num(b.khangar || 0), green: num(b.green || 0), coalKg: num(b.coalKg || 0),
      items, asOf: /^\d{4}-\d{2}-\d{2}$/.test(b.asOf || '') ? b.asOf : null, updatedAt: new Date(), updatedBy: req.user.sub,
    };
    const before = await db.collection('openingStock').findOne(scope(req.user));
    await db.collection('openingStock').updateOne(scope(req.user), { $set: doc, $setOnInsert: scope(req.user) }, { upsert: true });
    await audit(db, undefined, req.user, 'openingStock.save', { before, after: doc });
    res.json({ ok: true });
  }));

  // ---- Stock report: the whole flow from moulding to sale, as of now ----
  app.get('/stock-report', auth(), wrap(async (req, res) => {
    const s = scope(req.user);
    const sum = async (coll, fields, match = {}) => {
      const group = { _id: null };
      for (const [k, v] of Object.entries(fields)) group[k] = { $sum: v };
      const [r] = await db.collection(coll).aggregate([{ $match: { ...s, ...match } }, { $group: group }]).toArray();
      return r || {};
    };
    const unit = (await getSetting(db, req.user, 'kilnUnit', SETTING_DEFAULTS)) === 'chamber' ? 'chamber' : 'line';
    const [moulding, loaded, nikasi, sold, coalIn, shiftCoal, cycleCoal, unitStates] = await Promise.all([
      sum('mouldingBatches', { count: '$count', net: '$netCount' }),
      sum('sectionLoads', { count: '$count' }),
      sum('unloadings', { awwal: '$awwal', doem: '$doem', khangar: '$khangar', broken: '$broken' }),
      db.collection('invoices').aggregate([{ $match: s }, { $group: { _id: '$grade', qty: { $sum: { $toDouble: { $ifNull: ['$qty', 0] } } } } }]).toArray(),
      sum('grns', { qty: { $toDouble: { $ifNull: ['$qty', 0] } } }, { item: 'coal' }),
      sum('firingLogs', { kg: '$coalKg' }),
      sum('kilnCycles', { kg: '$coalKg' }),
      db.collection(unit === 'line' ? 'kilnLines' : 'kilnSections').aggregate([
        { $match: s }, { $group: { _id: '$state', n: { $sum: 1 }, bricks: { $sum: { $ifNull: ['$currentLoad', 0] } }, coal: { $sum: { $ifNull: ['$coalKg', 0] } } } },
      ]).toArray(),
    ]);
    // every other purchased item: total received (only coal has its use recorded)
    const itemsIn = await db.collection('grns').aggregate([
      { $match: { ...s, item: { $ne: 'coal' } } }, { $group: { _id: '$item', qty: { $sum: { $toDouble: { $ifNull: ['$qty', 0] } } } } }, { $sort: { _id: 1 } },
    ]).toArray();
    const open = await openingStock(db, req.user);
    const st = Object.fromEntries(unitStates.map((r) => [r._id, r]));
    // this week (kiln week: Saturday to Friday) and this month, by Pakistan time; fired lines in the last 1 / 7 / 30 days
    const PK = 5 * 3600e3; const DAY = 864e5;
    const pkNow = new Date(Date.now() + PK);
    const pkMidnight = Date.UTC(pkNow.getUTCFullYear(), pkNow.getUTCMonth(), pkNow.getUTCDate()) - PK;
    const weekStart = new Date(pkMidnight - ((pkNow.getUTCDay() + 1) % 7) * DAY);
    const monthStart = new Date(Date.UTC(pkNow.getUTCFullYear(), pkNow.getUTCMonth(), 1) - PK);
    const since = (ms) => ({ $gte: new Date(Date.now() - ms) });
    const unitColl = unit === 'line' ? 'kilnLines' : 'kilnSections';
    const firedCount = async (ms) => (await db.collection(unitColl).countDocuments({ ...s, firedAt: since(ms) }))
      + (await db.collection('kilnCycles').countDocuments({ ...s, unit, firedAt: since(ms) }));
    const [mWeek, mMonth, lWeek, lMonth, fired1, fired7, fired30, fire] = await Promise.all([
      sum('mouldingBatches', { count: '$count' }, { date: { $gte: weekStart } }),
      sum('mouldingBatches', { count: '$count' }, { date: { $gte: monthStart } }),
      sum('sectionLoads', { count: '$count' }, { date: { $gte: weekStart } }),
      sum('sectionLoads', { count: '$count' }, { date: { $gte: monthStart } }),
      firedCount(DAY), firedCount(7 * DAY), firedCount(30 * DAY),
      db.collection('kilnFire').findOne(s),
    ]);
    const bricks = (...states) => states.reduce((a, k) => a + (st[k]?.bricks || 0), 0);
    const count = (...states) => states.reduce((a, k) => a + (st[k]?.n || 0), 0);
    const soldBy = Object.fromEntries(sold.map((r) => [r._id, r.qty]));
    const n = (k) => nikasi[k] || 0;
    const lineCoal = unitStates.reduce((a, r) => a + (r.coal || 0), 0);
    const coalUsedKg = (shiftCoal.kg || 0) + (cycleCoal.kg || 0) + lineCoal;
    res.json({
      unit,
      moulding: { moulded: moulding.count || 0, net: moulding.net || 0, week: mWeek.count || 0, month: mMonth.count || 0 },
      kachiBharai: loaded.count || 0,
      loading: { total: loaded.count || 0, week: lWeek.count || 0, month: lMonth.count || 0 },
      fired: { day: fired1, week: fired7, month: fired30 },
      // the kiln now, line by line
      situation: {
        fireAt: fire?.index ?? null, empty: count('Empty'), ready: count('Ready'), cooling: count('Cooling'),
        preheating: count('Loading', 'Preheating'), unloading: count('Unloading'),
      },
      // bricks in the kiln: not fired yet (ahead of the fire) and fired (the fire line and everything behind it)
      inKiln: { green: bricks('Loading', 'Preheating'), fired: bricks('Firing', 'Cooling', 'Ready', 'Unloading') },
      jalai: {
        // how far the fire has got: units waiting, burning, cooling, being unloaded, and bricks inside
        preheating: (st.Preheating?.n || 0) + (st.Loading?.n || 0), firing: st.Firing?.n || 0, cooling: st.Cooling?.n || 0,
        unloading: st.Unloading?.n || 0, empty: st.Empty?.n || 0,
        bricksInKiln: unitStates.filter((r) => r._id !== 'Empty').reduce((a, r) => a + r.bricks, 0),
      },
      nikasi: { awwal: n('awwal'), doem: n('doem'), khangar: n('khangar'), broken: n('broken') },
      sales: { awwal: soldBy.awwal || 0, doem: soldBy.doem || 0, khangar: soldBy.khangar || 0 },
      coal: { openingKg: open.coalKg, inKg: Math.round((coalIn.qty || 0) * 1000), usedKg: Math.round(coalUsedKg), remainingKg: Math.round(open.coalKg + (coalIn.qty || 0) * 1000 - coalUsedKg) },
      stock: {
        greenInKiln: bricks('Loading', 'Preheating'),
        green: open.green + (moulding.net || 0) - (loaded.count || 0),
        awwal: open.awwal + n('awwal') - (soldBy.awwal || 0), doem: open.doem + n('doem') - (soldBy.doem || 0), khangar: open.khangar + n('khangar') - (soldBy.khangar || 0),
      },
      // opening quantities count as received; items with only an opening quantity are listed too
      items: [...new Set([...itemsIn.map((r) => r._id), ...Object.keys(open.items)])].filter((k) => k !== 'coal').sort()
        .map((k) => ({ item: k, received: +((itemsIn.find((r) => r._id === k)?.qty || 0) + Number(open.items[k] || 0)).toFixed(2) })),
    });
  }));

  // Kachi bharai: every chamber/line load (newest first)
  app.get('/section-loads', auth(), wrap(async (req, res) => {
    res.json(await db.collection('sectionLoads').find(scope(req.user)).sort({ date: -1 }).limit(1000).toArray());
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
    const at = entryAt(b.date);
    await withTransaction(db, async (session) => {
      const exp = await db.collection('expenses').insertOne({ ...scope(req.user), category: b.item, amount: landedTotal, payee: b.supplierName, date: at }, { session });
      const grn = await db.collection('grns').insertOne({
        ...scope(req.user), item: b.item, supplierName: b.supplierName, vehicleNo: b.vehicleNo, description: b.description || '',
        qty: b.qty, rate: b.rate, freight, landedTotal, landedUnitCost, labFields: b.labFields ?? {}, date: at, expenseId: exp.insertedId,
      }, { session });
      await syncGrnToParty(db, session, req.user, await db.collection('grns').findOne({ _id: grn.insertedId }, { session }));
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
      { $match: s }, { $group: { _id: '$grade', qty: { $sum: { $toDouble: { $ifNull: ['$qty', 0] } } } } },
    ]).toArray();
    const fired = unloaded ?? { awwal: 0, doem: 0, khangar: 0, broken: 0 };
    const sold = Object.fromEntries(soldRows.map((r) => [r._id, r.qty]));
    const open = await openingStock(db, req.user);
    const stockByGrade = {
      awwal: open.awwal + fired.awwal - (sold.awwal || 0),
      doem: open.doem + fired.doem - (sold.doem || 0),
      khangar: open.khangar + fired.khangar - (sold.khangar || 0),
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

  // ---- Bookings: advance orders; the advance is a payment in (shows in the cash book) ----
  app.post('/bookings', auth('owner', 'munshi', 'accountant'), wrap(async (req, res) => {
    const b = bookingInput.parse(req.body);
    const out = await withTransaction(db, async (session) => {
      const customer = await db.collection('customers').findOne({ _id: oid(b.customerId), ...scope(req.user) }, { session });
      if (!customer) throw httpError(404, 'Customer not found');
      const rate = b.rate ?? await getSetting(db, req.user, PRICE_KEY[b.grade], SETTING_DEFAULTS, session);
      const at = entryAt(b.date);
      const r = await db.collection('bookings').insertOne({ ...scope(req.user), customerId: b.customerId, grade: b.grade, qty: b.qty, rate: String(rate), note: b.note, date: at, status: 'open', createdAt: new Date() }, { session });
      if (b.advance > 0) {
        await db.collection('payments').insertOne({ ...scope(req.user), partyId: b.customerId, bookingId: String(r.insertedId), invoiceId: null, amount: b.advance.toFixed(2), mode: b.mode, direction: 'in', date: at, clientUuid: b.clientUuid }, { session });
      }
      await audit(db, session, req.user, 'booking.create', { id: r.insertedId, ...b });
      return { id: r.insertedId };
    });
    res.status(201).json(out);
  }));
  app.get('/bookings', auth(), wrap(async (req, res) => {
    const s = scope(req.user);
    const [rows, lifted, paid] = await Promise.all([
      db.collection('bookings').find(s).sort({ date: -1 }).limit(300).toArray(),
      db.collection('invoices').aggregate([{ $match: { ...s, bookingId: { $ne: null } } }, { $group: { _id: '$bookingId', qty: { $sum: '$qty' } } }]).toArray(),
      db.collection('payments').aggregate([{ $match: { ...s, bookingId: { $ne: null } } }, { $group: { _id: '$bookingId', amt: { $sum: { $toDouble: '$amount' } } } }]).toArray(),
    ]);
    const L = Object.fromEntries(lifted.map((x) => [x._id, x.qty])); const P = Object.fromEntries(paid.map((x) => [x._id, x.amt]));
    res.json(rows.map((r) => ({ ...r, lifted: L[String(r._id)] || 0, remaining: r.qty - (L[String(r._id)] || 0), advance: P[String(r._id)] || 0 })));
  }));
  app.delete('/bookings/:id', auth('owner'), wrap(async (req, res) => {
    const s = scope(req.user);
    await db.collection('bookings').deleteOne({ _id: oid(req.params.id), ...s });
    await db.collection('payments').deleteMany({ ...s, bookingId: req.params.id });
    await audit(db, undefined, req.user, 'booking.delete', { id: req.params.id });
    res.json({ ok: true });
  }));
  app.get('/invoices/:id', auth(), wrap(async (req, res) => {
    const inv = await db.collection('invoices').findOne({ _id: oid(req.params.id), ...scope(req.user) });
    if (!inv) throw httpError(404, 'Invoice not found');
    const customer = await db.collection('customers').findOne({ _id: oid(inv.customerId), ...scope(req.user) });
    res.json({ ...inv, customerName: customer?.name || '—', customerPhone: customer?.phone || '' });
  }));

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
        amount, tax, status: 'open', date: entryAt(b.date), clientUuid: b.clientUuid,
        vehicleNo: b.vehicleNo || '', driver: b.driver || '', destination: b.destination || '', freight: b.freight || '',
        bookingId: b.bookingId || null,
        challanNo: (await db.collection('invoices').countDocuments(scope(req.user), { session })) + 1,
      };
      const r = await db.collection('invoices').insertOne(doc, { session });
      await audit(db, session, req.user, 'invoice.create', { id: r.insertedId, ...b });
      return { id: r.insertedId, amount, tax };
    });
    res.status(201).json(result);
  }));

  app.get('/invoices', auth(), wrap(async (req, res) => {
    const invoices = await db.collection('invoices').find(scope(req.user)).sort({ date: -1 }).limit(200).toArray();
    // paid so far and the remaining balance, so part-paid invoices show what is still owed
    const paidRows = await db.collection('payments').aggregate([
      { $match: { ...scope(req.user), invoiceId: { $in: invoices.map((i) => String(i._id)) } } },
      { $group: { _id: '$invoiceId', total: { $sum: { $toDouble: '$amount' } } } },
    ]).toArray();
    const paidBy = Object.fromEntries(paidRows.map((r) => [r._id, r.total]));
    res.json(invoices.map((i) => {
      const total = Number(i.amount) + Number(i.tax || 0);
      const paid = paidBy[String(i._id)] ?? 0;
      return { ...i, total: total.toFixed(2), paid: paid.toFixed(2), balance: Math.max(0, total - paid).toFixed(2) };
    }));
  }));

  app.post('/payments', auth('owner', 'munshi', 'accountant'), wrap(async (req, res) => {
    const b = paymentInput.parse(req.body);
    await assertType(db, req.user, 'paymentMode', b.mode);
    const result = await withTransaction(db, async (session) => {
      const invoice = await db.collection('invoices').findOne({ _id: oid(b.invoiceId), ...scope(req.user) }, { session });
      if (!invoice) throw httpError(404, 'Invoice not found');
      const at = entryAt(b.date);
      if (at.toISOString().slice(0, 10) < new Date(invoice.date).toISOString().slice(0, 10)) {
        throw httpError(422, 'Payment date cannot be before the invoice date');
      }
      const [paidRow] = await db.collection('payments').aggregate([
        { $match: { ...scope(req.user), invoiceId: b.invoiceId } },
        { $group: { _id: null, total: { $sum: { $toDouble: '$amount' } } } },
      ], { session }).toArray();
      const owed = Number(invoice.amount) + Number(invoice.tax) - (paidRow?.total ?? 0);
      if (toPaisa(b.amount) > toPaisa(owed.toFixed(2))) throw httpError(422, `Payment exceeds amount owed (Rs ${owed.toFixed(2)})`);
      const doc = { ...scope(req.user), invoiceId: b.invoiceId, direction: 'in', partyId: invoice.customerId, amount: b.amount, mode: b.mode, date: at, clientUuid: b.clientUuid };
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
      ...loads.map((r) => ({ at: r.date, kind: 'load', summary: `${r.unit === 'line' ? 'Line' : 'Section'} ${r.sectionIndex}: -${r.count} green → loaded` })),
      ...firing.map((r) => ({ at: r.date, kind: 'firing', summary: `${r.shift} shift: ${r.coalKg} kg coal, ${r.tempC}°C${r.fanOn ? '' : ' — FAN OFF'}` })),
      ...unloads.map((r) => ({ at: r.date, kind: 'unload', summary: `${r.unit === 'line' ? 'Line' : 'Section'} ${r.sectionIndex}: Awwal ${r.awwal}, Doem ${r.doem}, Khangar ${r.khangar}, Broken ${r.broken}` })),
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

    // ledger entries have no 'amount'; advances are summed from their debit
    const sumBefore = async (coll, dateField, extraMatch = {}, field = '$amount') => {
      const [r] = await db.collection(coll).aggregate([
        { $match: { ...s, ...extraMatch, [dateField]: { $lt: dayStart } } },
        { $group: { _id: null, total: { $sum: { $toDouble: field } } } },
      ]).toArray();
      return r?.total ?? 0;
    };

    const sumCreditBefore = async (match) => {
      const [r] = await db.collection('ledgerEntries').aggregate([
        { $match: { ...s, ...match, createdAt: { $lt: dayStart } } },
        { $group: { _id: null, total: { $sum: { $toDouble: '$credit' } } } },
      ]).toArray();
      return r?.total ?? 0;
    };
    const [inBefore, expBefore, advBefore, advRevBefore, kharchaBefore] = await Promise.all([
      sumBefore('payments', 'date'),
      sumBefore('expenses', 'date'),
      sumBefore('ledgerEntries', 'createdAt', { account: 'peshgi', type: 'advance' }, '$debit'),
      sumCreditBefore({ account: 'peshgi', type: 'advance_reversal' }),
      sumBefore('kharchaEntries', 'date'),
    ]);
    const openingCash = inBefore - expBefore - advBefore + advRevBefore - kharchaBefore;

    const [incomeRows, expenseRows, advanceRows] = await Promise.all([
      db.collection('payments').find({ ...s, date: { $gte: dayStart, $lte: dayEnd } }).sort({ date: 1 }).toArray(),
      db.collection('expenses').find({ ...s, date: { $gte: dayStart, $lte: dayEnd } }).sort({ date: 1 }).toArray(),
      db.collection('ledgerEntries').find({ ...s, account: 'peshgi', type: 'advance', createdAt: { $gte: dayStart, $lte: dayEnd } }).sort({ createdAt: 1 }).toArray(),
    ]);
    // a corrected advance is replaced by its newer entry; hide the reversed original
    const reversed = new Set((await db.collection('ledgerEntries').find(
      { ...s, account: 'peshgi', type: 'advance_reversal', reversesId: { $in: advanceRows.map((r) => r._id) } },
    ).toArray()).map((r) => String(r.reversesId)));
    const liveAdvances = advanceRows.filter((r) => !reversed.has(String(r._id)));

    const customerIds = [...new Set(incomeRows.map((r) => r.partyId))].map(oid);
    const kharchaRows = await db.collection('kharchaEntries').find({ ...s, date: { $gte: dayStart, $lte: dayEnd } }).sort({ date: 1 }).toArray();
    const workerIds = [...new Set([...liveAdvances.map((r) => r.partyId), ...kharchaRows.map((r) => r.workerId)])].map(oid);
    const [customers, workers] = await Promise.all([
      customerIds.length ? db.collection('customers').find({ _id: { $in: customerIds } }).toArray() : [],
      workerIds.length ? db.collection('workers').find({ _id: { $in: workerIds } }).toArray() : [],
    ]);
    const customerName = Object.fromEntries(customers.map((c) => [String(c._id), c.name]));
    const workerName = Object.fromEntries(workers.map((w) => [String(w._id), w.name]));

    const income = incomeRows.map((r) => ({ kind: 'payment', id: r._id, at: r.date, name: customerName[r.partyId] || '—', detail: `Payment (${r.mode})`, amount: r.amount }));
    const expense = [
      ...expenseRows.map((r) => ({ kind: 'expense', id: r._id, at: r.date, name: r.payee || r.category, detail: r.category, amount: r.amount })),
      ...kharchaRows.map((r) => ({ kind: 'kharcha', at: r.date, name: workerName[r.workerId] || '—', detail: 'Dasti kharcha', amount: r.amount })),
      ...liveAdvances.map((r) => ({ kind: 'advance', id: r._id, at: r.createdAt, name: workerName[r.partyId] || '—', detail: 'Peshgi advance', amount: r.debit.toString() })),
    ].sort((a, b) => new Date(a.at) - new Date(b.at));

    const totalIn = income.reduce((a, r) => a + Number(r.amount), 0);
    const totalOut = expense.reduce((a, r) => a + Number(r.amount), 0);

    res.json({
      date: dateStr,
      openingCash: openingCash.toFixed(2),
      totalIn: totalIn.toFixed(2),
      totalOut: totalOut.toFixed(2),
      closingCash: (openingCash + totalIn - totalOut).toFixed(2),
      counted: (await db.collection('cashCounts').findOne({ ...s, date: dateStr }))?.amount ?? null,
      income, expense,
    });
  }));

  // cash actually counted at the end of a day; the cash book shows the difference with its closing figure
  app.put('/cash-count', auth('owner', 'accountant', 'munshi'), wrap(async (req, res) => {
    const b = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), amount: z.coerce.number().min(0) }).parse(req.body);
    await db.collection('cashCounts').updateOne({ ...scope(req.user), date: b.date }, { $set: { amount: b.amount, by: req.user.sub, at: new Date() } }, { upsert: true });
    await audit(db, undefined, req.user, 'cash.count', b);
    res.json({ ok: true });
  }));
}
