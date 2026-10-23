import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { scope, audit, httpError } from './core.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const isoDay = /^\d{4}-\d{2}-\d{2}$/;
const oidOf = (id) => { if (!ObjectId.isValid(id)) throw httpError(400, 'Invalid id'); return new ObjectId(id); };

export const PERSONAL_TYPES = ['borrowed', 'loanGiven', 'repaymentIn', 'repaymentOut', 'cashGiven', 'expense', 'income', 'other'];
// Party accounts (kiln business with anyone who is not a worker or customer: a mistri, a tractor
// owner, a coal supplier): in = owed to them (work done, goods supplied), out = paid to them.
export const PARTY_TYPES = ['workBill', 'purchase', 'serviceCharge', 'payment', 'advance', 'other'];
const entryInput = z.object({
  date: z.string().regex(isoDay),
  party: z.string().trim().min(1).max(80),
  type: z.enum([...new Set([...PERSONAL_TYPES, ...PARTY_TYPES])]),
  direction: z.enum(['in', 'out']), // in = credit (money received), out = debit (money paid / given)
  amount: z.coerce.number().positive().max(1e12),
  mode: z.enum(['cash', 'account', 'jazzcash', 'easypaisa', 'other']).default('cash'), // how the money moved
  note: z.string().trim().max(1000).optional().default(''),
});

// Owner's personal finances: borrowing, cash given, daily expenses... Kept apart from the kiln's
// books and visible only to the owner.
export function registerPersonalRoutes(app, db) {
  const auth = app.locals.auth;
  const coll = () => db.collection('personalEntries');
  // two books with the same screens: the owner's personal book (only the owner, only their own),
  // and the kiln's party accounts (owner, accountant and munshi share them)
  const BOOKS = {
    personal: { path: '/personal', roles: ['owner'], match: (u) => ({ owner: u.sub, book: { $in: [null, 'personal'] } }), fields: (u) => ({ owner: u.sub, book: 'personal' }) },
    parties: { path: '/parties', roles: ['owner', 'accountant', 'munshi'], match: () => ({ book: 'parties' }), fields: () => ({ book: 'parties' }) },
  };
  for (const [name, B] of Object.entries(BOOKS)) {
    app.get(B.path, auth(...B.roles), wrap(async (req, res) => {
      if (name === 'parties') await backfillGrns(db, req.user);
      const q = { ...scope(req.user), ...B.match(req.user) };
      if (isoDay.test(req.query.from || '')) q.date = { ...(q.date || {}), $gte: req.query.from };
      if (isoDay.test(req.query.to || '')) q.date = { ...(q.date || {}), $lte: req.query.to };
      if (req.query.party) q.party = req.query.party;
      res.json(await coll().find(q).sort({ date: 1, createdAt: 1 }).toArray());
    }));
    app.post(B.path, auth(...B.roles), wrap(async (req, res) => {
      const b = entryInput.parse(req.body);
      const r = await coll().insertOne({ ...scope(req.user), ...B.fields(req.user), ...b, createdAt: new Date() });
      await audit(db, undefined, req.user, `${name}.create`, { id: r.insertedId, type: b.type, amount: b.amount });
      res.status(201).json({ id: r.insertedId });
    }));
    app.put(`${B.path}/:id`, auth(...B.roles), wrap(async (req, res) => {
      const b = entryInput.partial().parse(req.body);
      const r = await coll().updateOne({ _id: oidOf(req.params.id), ...scope(req.user), ...B.match(req.user) }, { $set: { ...b, updatedAt: new Date(), edited: true } });
      if (!r.matchedCount) throw httpError(404, 'Entry not found');
      await audit(db, undefined, req.user, `${name}.update`, { id: req.params.id });
      res.json({ ok: true });
    }));
    app.delete(`${B.path}/:id`, auth(...B.roles), wrap(async (req, res) => {
      const r = await coll().deleteOne({ _id: oidOf(req.params.id), ...scope(req.user), ...B.match(req.user) });
      if (!r.deletedCount) throw httpError(404, 'Entry not found');
      await audit(db, undefined, req.user, `${name}.delete`, { id: req.params.id });
      res.json({ ok: true });
    }));
  }
}

// A purchase (GRN) posts to its supplier's party account automatically, and follows edits/deletes.
export async function syncGrnToParty(db, session, user, grn) {
  const c = db.collection('personalEntries');
  const s = scope(user);
  const supplier = String(grn?.supplierName || '').trim();
  // deleted, or an old record without a supplier name: nothing to post (remove any earlier posting)
  if (!grn || grn.deleted || !supplier) { await c.deleteOne({ ...s, book: 'parties', grnId: grn?._id }, { session }); return; }
  const day = new Date(new Date(grn.date).getTime() + 5 * 3600e3).toISOString().slice(0, 10);
  // older records may name things differently or miss the total: work it out
  const item = grn.item || 'coal';
  const party = supplier;
  const amount = Number(grn.landedTotal) || +(Number(grn.qty || 0) * Number(grn.rate || 0) + Number(grn.freight || 0)).toFixed(2);
  if (!(amount > 0)) return;
  await c.updateOne({ ...s, book: 'parties', grnId: grn._id }, {
    $set: { party, type: 'purchase', direction: 'in', amount, mode: 'other',
      note: `${item} ${grn.qty} × ${grn.rate}${Number(grn.freight) ? ` + freight ${grn.freight}` : ''}${grn.vehicleNo ? ` (${grn.vehicleNo})` : ''}${grn.description ? ` — ${grn.description}` : ''}`, date: day, updatedAt: new Date() },
    $setOnInsert: { ...s, book: 'parties', grnId: grn._id, createdAt: new Date() },
  }, { upsert: true, session });
}

// Purchases entered before party accounts existed: post any GRN that has no party entry yet.
async function backfillGrns(db, user) {
  const s = scope(user);
  const done = new Set((await db.collection('personalEntries').find({ ...s, book: 'parties', grnId: { $ne: null } }, { projection: { grnId: 1 } }).toArray()).map((e) => String(e.grnId)));
  // clear postings made from old records that had no supplier name
  await db.collection('personalEntries').deleteMany({ ...s, book: 'parties', grnId: { $ne: null }, party: '—' });
  const grns = await db.collection('grns').find({ ...s, supplierName: { $nin: [null, ''] } }).toArray();
  for (const g of grns) if (!done.has(String(g._id))) await syncGrnToParty(db, undefined, user, g);
}
