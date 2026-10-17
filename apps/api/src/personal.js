import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { scope, audit, httpError } from './core.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const isoDay = /^\d{4}-\d{2}-\d{2}$/;
const oidOf = (id) => { if (!ObjectId.isValid(id)) throw httpError(400, 'Invalid id'); return new ObjectId(id); };

export const PERSONAL_TYPES = ['borrowed', 'loanGiven', 'repaymentIn', 'repaymentOut', 'cashGiven', 'expense', 'income', 'other'];
const entryInput = z.object({
  date: z.string().regex(isoDay),
  party: z.string().trim().min(1).max(80),
  type: z.enum(PERSONAL_TYPES),
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

  app.get('/personal', auth('owner'), wrap(async (req, res) => {
    const q = { ...scope(req.user), owner: req.user.sub };
    if (isoDay.test(req.query.from || '')) q.date = { ...(q.date || {}), $gte: req.query.from };
    if (isoDay.test(req.query.to || '')) q.date = { ...(q.date || {}), $lte: req.query.to };
    if (req.query.party) q.party = req.query.party;
    res.json(await coll().find(q).sort({ date: 1, createdAt: 1 }).toArray());
  }));

  app.post('/personal', auth('owner'), wrap(async (req, res) => {
    const b = entryInput.parse(req.body);
    const r = await coll().insertOne({ ...scope(req.user), owner: req.user.sub, ...b, createdAt: new Date() });
    await audit(db, undefined, req.user, 'personal.create', { id: r.insertedId, type: b.type, amount: b.amount });
    res.status(201).json({ id: r.insertedId });
  }));

  app.put('/personal/:id', auth('owner'), wrap(async (req, res) => {
    const b = entryInput.partial().parse(req.body);
    const r = await coll().updateOne({ _id: oidOf(req.params.id), ...scope(req.user), owner: req.user.sub }, { $set: { ...b, updatedAt: new Date() } });
    if (!r.matchedCount) throw httpError(404, 'Entry not found');
    await audit(db, undefined, req.user, 'personal.update', { id: req.params.id });
    res.json({ ok: true });
  }));

  app.delete('/personal/:id', auth('owner'), wrap(async (req, res) => {
    const r = await coll().deleteOne({ _id: oidOf(req.params.id), ...scope(req.user), owner: req.user.sub });
    if (!r.deletedCount) throw httpError(404, 'Entry not found');
    await audit(db, undefined, req.user, 'personal.delete', { id: req.params.id });
    res.json({ ok: true });
  }));
}
