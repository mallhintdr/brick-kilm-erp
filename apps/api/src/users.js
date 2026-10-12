import bcrypt from 'bcryptjs';
import { userCreateInput, userRoleInput, permissionOverrideInput, PERMISSION_MODULES, DEFAULT_ROLE_PERMS } from '@kiln/shared';
import { withTransaction } from './db.js';
import { scope, audit, oid, httpError } from './core.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

// The role default, overridden per-field by any `permissions` doc for this user+module.
// Owner always passes — matches the "Grant Super Admin Access" pattern from the
// reference screenshots, as a single always-true bypass rather than a settable flag,
// so it can never accidentally be revoked via the matrix.
export async function hasPermission(db, user, module, action) {
  if (user.role === 'owner') return true;
  const fallback = DEFAULT_ROLE_PERMS[user.role]?.[module]?.[action] ?? false;
  const override = await db.collection('permissions').findOne({ ...scope(user), userId: user.sub, module });
  return override && override[action] !== undefined ? !!override[action] : fallback;
}

// Use after auth() (which only checks JWT + role). This adds the per-user override check
// on top, for the four modules in PERMISSION_MODULES — everything else is unaffected.
export function requirePerm(db, module, action) {
  return async (req, res, next) => {
    try {
      if (await hasPermission(db, req.user, module, action)) return next();
      next(httpError(403, `Not permitted: ${module}.${action}`));
    } catch (e) { next(e); }
  };
}

export function registerUserRoutes(app, db) {
  const auth = app.locals.auth;

  app.get('/users', auth('owner'), wrap(async (req, res) => {
    const rows = await db.collection('users').find(scope(req.user)).project({ passwordHash: 0 }).toArray();
    res.json(rows);
  }));

  app.post('/users', auth('owner'), wrap(async (req, res) => {
    const b = userCreateInput.parse(req.body);
    const username = b.username.toLowerCase();
    const passwordHash = await bcrypt.hash(b.password, 10);
    try {
      const r = await db.collection('users').insertOne({ ...scope(req.user), username, role: b.role, passwordHash, createdAt: new Date() });
      await audit(db, undefined, req.user, 'user.create', { username, role: b.role });
      res.status(201).json({ id: r.insertedId });
    } catch (e) {
      if (e.code === 11000) throw httpError(409, 'That username already exists for this kiln');
      throw e;
    }
  }));

  app.put('/users/:id/role', auth('owner'), wrap(async (req, res) => {
    const b = userRoleInput.parse(req.body);
    await withTransaction(db, async (session) => {
      const r = await db.collection('users').updateOne({ _id: oid(req.params.id), ...scope(req.user) }, { $set: { role: b.role } }, { session });
      if (!r.matchedCount) throw httpError(404, 'User not found');
      await audit(db, session, req.user, 'user.role', { userId: req.params.id, role: b.role });
    });
    res.json({ ok: true });
  }));

  // Effective matrix = role default with any stored override layered on top, plus which
  // fields are actually overridden (so the UI can show "custom" vs "default" per cell).
  app.get('/users/:id/permissions', auth('owner'), wrap(async (req, res) => {
    const user = await db.collection('users').findOne({ _id: oid(req.params.id), ...scope(req.user) });
    if (!user) throw httpError(404, 'User not found');
    const overrides = await db.collection('permissions').find({ ...scope(req.user), userId: req.params.id }).toArray();
    const overrideByModule = Object.fromEntries(overrides.map((o) => [o.module, o]));
    const defaults = DEFAULT_ROLE_PERMS[user.role] || {};
    const matrix = Object.fromEntries(PERMISSION_MODULES.map((m) => {
      const def = defaults[m] || { view: false, add: false, edit: false, delete: false };
      const ov = overrideByModule[m];
      const effective = { ...def };
      const overridden = {};
      for (const action of ['view', 'add', 'edit', 'delete']) {
        if (ov && ov[action] !== undefined) { effective[action] = ov[action]; overridden[action] = true; }
      }
      return [m, { default: def, effective, overridden }];
    }));
    res.json({ role: user.role, modules: matrix });
  }));

  app.put('/users/:id/permissions', auth('owner'), wrap(async (req, res) => {
    const b = permissionOverrideInput.parse(req.body);
    const user = await db.collection('users').findOne({ _id: oid(req.params.id), ...scope(req.user) });
    if (!user) throw httpError(404, 'User not found');
    const { module, ...fields } = b;
    const set = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    await withTransaction(db, async (session) => {
      await db.collection('permissions').updateOne(
        { ...scope(req.user), userId: req.params.id, module },
        { $set: set, $setOnInsert: { createdAt: new Date() } },
        { upsert: true, session },
      );
      await audit(db, session, req.user, 'permission.update', { userId: req.params.id, module, ...set });
    });
    res.json({ ok: true });
  }));

  // Clears every override for a module, resetting that user back to their role's default.
  app.delete('/users/:id/permissions/:module', auth('owner'), wrap(async (req, res) => {
    await withTransaction(db, async (session) => {
      await db.collection('permissions').deleteOne({ ...scope(req.user), userId: req.params.id, module: req.params.module }, { session });
      await audit(db, session, req.user, 'permission.reset', { userId: req.params.id, module: req.params.module });
    });
    res.json({ ok: true });
  }));
}
