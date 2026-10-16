import { typeInput, typeUpdate, TYPE_KINDS } from '@kiln/shared';
import { scope, audit, oid, ensureBuiltinTypes, httpError } from './core.js';
import { withTransaction } from './db.js';
import { requirePerm } from './users.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

// Where each kind is referenced, so we can refuse to delete a type that is in use.
const USAGE = {
  workerCategory: ['workers', 'category'],
  procurementItem: ['grns', 'item'],
  customerType: ['customers', 'type'],
  paymentMode: ['payments', 'mode'],
};

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);

export function registerTypeRoutes(app, db) {
  const auth = app.locals.auth;
  const can = (action) => requirePerm(db, 'types', action);

  app.get('/types', auth(), wrap(async (req, res) => {
    await ensureBuiltinTypes(db, req.user);
    const q = { ...scope(req.user) };
    if (req.query.kind) {
      if (!TYPE_KINDS.includes(req.query.kind)) throw httpError(400, 'Unknown kind');
      q.kind = req.query.kind;
    }
    const rows = await db.collection('types').find(q).sort({ kind: 1, builtin: -1, createdAt: 1 }).toArray();
    res.json(rows);
  }));

  app.post('/types', auth(), can('add'), wrap(async (req, res) => {
    const b = typeInput.parse(req.body);
    const key = b.key ?? (slug(b.label).length >= 2 ? slug(b.label) : `t_${Date.now().toString(36)}`);
    if (!b.labelUr && /[\u0600-\u06FF]/.test(b.label)) b.labelUr = b.label;
    if (key.length < 2) throw httpError(422, 'Could not derive a key from the label; enter one explicitly');
    await ensureBuiltinTypes(db, req.user);
    const r = await withTransaction(db, async (session) => {
      const doc = { ...scope(req.user), kind: b.kind, key, label: b.label, labelUr: b.labelUr ?? '', builtin: false, active: true, createdAt: new Date() };
      const ins = await db.collection('types').insertOne(doc, { session });
      await audit(db, session, req.user, 'type.create', { kind: b.kind, key });
      return ins.insertedId;
    }).catch((e) => {
      if (e.code === 11000) throw httpError(409, `A ${b.kind} with key "${key}" already exists`);
      throw e;
    });
    res.status(201).json({ id: r, key });
  }));

  // Key is immutable (records reference it); labels and the active flag are editable.
  app.put('/types/:id', auth(), can('edit'), wrap(async (req, res) => {
    const b = typeUpdate.parse(req.body);
    const t = await db.collection('types').findOne({ _id: oid(req.params.id), ...scope(req.user) });
    if (!t) throw httpError(404, 'Type not found');
    if (t.builtin && b.active === false) throw httpError(422, 'Built-in types can be renamed but not deactivated');
    await withTransaction(db, async (session) => {
      await db.collection('types').updateOne({ _id: t._id }, { $set: b }, { session });
      await audit(db, session, req.user, 'type.update', { id: req.params.id, ...b });
    });
    res.json({ ok: true });
  }));

  app.delete('/types/:id', auth(), can('delete'), wrap(async (req, res) => {
    const t = await db.collection('types').findOne({ _id: oid(req.params.id), ...scope(req.user) });
    if (!t) throw httpError(404, 'Type not found');
    if (t.builtin) throw httpError(422, 'Built-in types are used by system workflows and cannot be deleted');
    const [coll, field] = USAGE[t.kind];
    const used = await db.collection(coll).countDocuments({ ...scope(req.user), [field]: t.key }, { limit: 1 });
    if (used) throw httpError(409, 'This type is used by existing records. Deactivate it instead of deleting.');
    await withTransaction(db, async (session) => {
      await db.collection('types').deleteOne({ _id: t._id }, { session });
      await audit(db, session, req.user, 'type.delete', { kind: t.kind, key: t.key });
    });
    res.json({ ok: true });
  }));
}
