import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { SETTING_DEFAULTS } from '@kiln/shared';
import { withTransaction } from './db.js';
import { scope, audit, getSetting, httpError, reverseBySource } from './core.js';
import { creditTeam, entryAt } from './production.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const isoDay = /^\d{4}-\d{2}-\d{2}$/;
const pastDate = z.coerce.date().refine((d) => d.getTime() <= Date.now() + 86400000, 'Date cannot be in the future');
const oidOf = (id) => { if (!ObjectId.isValid(id)) throw httpError(400, 'Invalid id'); return new ObjectId(id); };

// Corrections & erase: one place to fix or remove loading (bharai) and nikasi records.
// Money stays append-only: the wages a record posted are reversed and, for an edit, posted again.
export function registerCorrectionRoutes(app, db) {
  const auth = app.locals.auth;
  const recompute = (user, session) => app.locals.recomputeLines?.(user, session);

  // The wage entries a record posted. Newer records keep their reference; older ones are found by
  // type, same timestamp (wages are dated exactly like the record) and source prefix.
  async function wageRefs(user, doc, type, prefixes, session) {
    if (doc.ledgerRef) return [doc.ledgerRef];
    const rows = await db.collection('ledgerEntries').find({
      ...scope(user), type, createdAt: doc.date, reversesId: null,
      sourceRef: { $regex: `^(${prefixes.join('|')})` },
    }, { session }).toArray();
    return [...new Set(rows.map((r) => r.sourceRef))];
  }
  const range = (q) => {
    const m = {};
    if (isoDay.test(q.from || '')) m.$gte = new Date(`${q.from}T00:00:00.000Z`);
    if (isoDay.test(q.to || '')) m.$lte = new Date(`${q.to}T23:59:59.999Z`);
    return Object.keys(m).length ? { date: m } : {};
  };

  // ---------- loading (bharai) ----------
  app.get('/corrections/loads', auth('owner'), wrap(async (req, res) => {
    res.json(await db.collection('sectionLoads').find({ ...scope(req.user), ...range(req.query) }).sort({ date: -1 }).limit(500).toArray());
  }));

  async function loadContext(user, id, session) {
    const s = scope(user);
    const rec = await db.collection('sectionLoads').findOne({ _id: oidOf(id), ...s }, { session });
    if (!rec) throw httpError(404, 'Loading record not found');
    const coll = rec.unit === 'line' ? 'kilnLines' : rec.unit === 'grid' ? null : 'kilnSections';
    const prefixes = rec.unit === 'grid' ? ['gridLoad:'] : [`${rec.unit === 'line' ? 'line' : 'chamber'}Load:${rec.sectionIndex}:`];
    const refs = await wageRefs(user, rec, 'loading_credit', prefixes, session);
    // is this the load still sitting in its line/chamber?
    let holder = null;
    if (coll) {
      const sec = await db.collection(coll).findOne({ ...s, index: rec.sectionIndex }, { session });
      const same = sec && sec.currentLoad && ((sec.loadRef && refs.includes(sec.loadRef)) || (sec.loadedAt && +new Date(sec.loadedAt) === +new Date(rec.date)));
      if (same) holder = { coll, sec };
    }
    return { rec, refs, holder };
  }

  app.put('/section-loads/:id', auth('owner'), wrap(async (req, res) => {
    const b = z.object({ count: z.coerce.number().int().positive().optional(), date: pastDate.optional() }).parse(req.body);
    await withTransaction(db, async (session) => {
      const { rec, refs, holder } = await loadContext(req.user, req.params.id, session);
      const count = b.count ?? rec.count;
      const at = b.date ? entryAt(b.date) : rec.date;
      for (const r of refs) await reverseBySource(db, session, req.user, r, 'loading corrected');
      const ref = `${rec.unit === 'grid' ? 'gridLoad' : `${rec.unit === 'line' ? 'line' : 'chamber'}Load`}:${rec.sectionIndex ?? 'g'}:${Date.now()}`;
      const rate = await getSetting(db, req.user, 'rateBharai', SETTING_DEFAULTS, session);
      await creditTeam(db, session, req.user, rec.teamId, ((count / 1000) * Number(rate)).toFixed(2), 'loading_credit', ref, `${ref}-fix`, at, { bricks: count, rate });
      await db.collection('sectionLoads').updateOne({ _id: rec._id }, { $set: { count, date: at, ledgerRef: ref } }, { session });
      if (holder) await db.collection(holder.coll).updateOne({ _id: holder.sec._id }, { $set: { currentLoad: count, loadedAt: at, loadRef: ref } }, { session });
      await audit(db, session, req.user, 'load.correct', { id: req.params.id, before: { count: rec.count, date: rec.date }, after: { count, date: at } });
    });
    res.json({ ok: true });
  }));

  app.delete('/section-loads/:id', auth('owner'), wrap(async (req, res) => {
    await withTransaction(db, async (session) => {
      const { rec, refs, holder } = await loadContext(req.user, req.params.id, session);
      if (holder) {
        if (holder.sec.firedAt || holder.sec.nikasiTeamId) throw httpError(422, 'These bricks are already fired; erase the nikasi first or reset the fire');
        await db.collection(holder.coll).updateOne({ _id: holder.sec._id }, {
          $set: { state: 'Empty', currentLoad: 0, loadTeamId: null, loadedAt: null, loadRef: null, coalKg: 0, issues: '' }, $inc: { round: -1 },
        }, { session });
      }
      for (const r of refs) await reverseBySource(db, session, req.user, r, 'loading erased');
      await db.collection('sectionLoads').deleteOne({ _id: rec._id }, { session });
      if (rec.unit === 'line') await recompute(req.user, session);
      await audit(db, session, req.user, 'load.erase', { id: req.params.id, count: rec.count, date: rec.date, unit: rec.unit, index: rec.sectionIndex });
    });
    res.json({ ok: true });
  }));

  // ---------- nikasi ----------
  app.get('/corrections/nikasi', auth('owner'), wrap(async (req, res) => {
    res.json(await db.collection('unloadings').find({ ...scope(req.user), ...range(req.query) }).sort({ date: -1 }).limit(500).toArray());
  }));

  async function nikasiContext(user, id, session) {
    const rec = await db.collection('unloadings').findOne({ _id: oidOf(id), ...scope(user) }, { session });
    if (!rec) throw httpError(404, 'Nikasi record not found');
    const prefixes = rec.unit === 'grid' ? ['gridUnload:'] : [`${rec.unit === 'line' ? 'line' : 'chamber'}Unloading:${rec.sectionIndex}:`];
    const refs = await wageRefs(user, rec, 'unloading_credit', prefixes, session);
    return { rec, refs };
  }
  const cycleFilter = (user, rec) => ({ ...scope(user), unit: rec.unit, index: rec.sectionIndex, unloadedAt: rec.date });

  app.put('/unloadings/:id', auth('owner'), wrap(async (req, res) => {
    const n = z.coerce.number().int().min(0);
    const b = z.object({ awwal: n.optional(), doem: n.optional(), khangar: n.optional(), broken: n.optional(), date: pastDate.optional() }).parse(req.body);
    await withTransaction(db, async (session) => {
      const { rec, refs } = await nikasiContext(req.user, req.params.id, session);
      const g = { awwal: b.awwal ?? rec.awwal, doem: b.doem ?? rec.doem, khangar: b.khangar ?? rec.khangar, broken: b.broken ?? rec.broken };
      const total = g.awwal + g.doem + g.khangar + g.broken;
      if (!total) throw httpError(422, 'Enter at least one brick, or erase the record instead');
      const at = b.date ? entryAt(b.date) : rec.date;
      for (const r of refs) await reverseBySource(db, session, req.user, r, 'nikasi corrected');
      const ref = `${rec.unit === 'grid' ? 'gridUnload' : `${rec.unit === 'line' ? 'line' : 'chamber'}Unloading`}:${rec.sectionIndex ?? 'g'}:${Date.now()}`;
      const rate = await getSetting(db, req.user, 'rateNikasi', SETTING_DEFAULTS, session);
      if (rec.nikasiTeamId) {
        await creditTeam(db, session, req.user, rec.nikasiTeamId, ((total / 1000) * Number(rate)).toFixed(2), 'unloading_credit', ref, `${ref}-fix`, at, { bricks: total, rate });
      }
      await db.collection('kilnCycles').updateOne(cycleFilter(req.user, rec), { $set: { ...g, unloadedAt: at } }, { session });
      await db.collection('unloadings').updateOne({ _id: rec._id }, { $set: { ...g, date: at, ledgerRef: ref } }, { session });
      await audit(db, session, req.user, 'nikasi.correct', { id: req.params.id, before: { awwal: rec.awwal, doem: rec.doem, khangar: rec.khangar, broken: rec.broken, date: rec.date }, after: { ...g, date: at } });
    });
    res.json({ ok: true });
  }));

  app.delete('/unloadings/:id', auth('owner'), wrap(async (req, res) => {
    await withTransaction(db, async (session) => {
      const { rec, refs } = await nikasiContext(req.user, req.params.id, session);
      for (const r of refs) await reverseBySource(db, session, req.user, r, 'nikasi erased');
      await db.collection('kilnCycles').deleteOne(cycleFilter(req.user, rec), { session });
      await db.collection('unloadings').deleteOne({ _id: rec._id }, { session });
      await audit(db, session, req.user, 'nikasi.erase', { id: req.params.id, awwal: rec.awwal, doem: rec.doem, khangar: rec.khangar, broken: rec.broken, date: rec.date });
    });
    res.json({ ok: true });
  }));
}
