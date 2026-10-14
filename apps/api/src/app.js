import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';
import {
  workerInput, advanceInput, recoveryInput, settingInput, SETTING_DEFAULTS,
  ageOn, MIN_WORKER_AGE, RECOMMENDED_WORKER_AGE, toPaisa,
} from '@kiln/shared';
import { withTransaction, supportsTransactions } from './db.js';
import { readFileSync } from 'node:fs';

const APP_VERSION = (() => {
  try { return JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')).version; } catch { return 'unknown'; }
})();
import {
  dec, oid, scope, audit, getSetting, postEntry, reverseEntry, balance, httpError, assertType,
} from './core.js';
import { registerProductionRoutes, entryAt } from './production.js';
import { registerTypeRoutes } from './types.js';
import { registerDeleteRoutes } from './deletes.js';
import { registerKharchiRoutes } from './kharchi.js';
import { registerUserRoutes, requirePerm } from './users.js';
import { registerEditRoutes } from './edits.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// Comma-separated list of allowed origins in production (e.g. "https://app.example.com").
// Unset = allow any origin, which is fine for local dev but must be set before a public launch.
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',').map((s) => s.trim());

// Session length. Active users never hit it: any authenticated request made after
// RENEW_AFTER_S gets a fresh token back in the X-Refresh-Token header (sliding session).
const TOKEN_TTL = process.env.TOKEN_TTL || '7d';
const RENEW_AFTER_S = 60 * 60;
const signToken = (claims) => jwt.sign(claims, SECRET, { expiresIn: TOKEN_TTL });

// Only failed attempts count, keyed per IP + username, so one person mistyping a
// password can't lock out everyone else at the kiln who shares the same mobile hotspot.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${req.ip}|${String(req.body?.username || '').trim().toLowerCase()}`,
  message: { error: 'Too many failed login attempts; try again in 15 minutes' },
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

export function createApp(db) {
  const app = express();
  // Behind a reverse proxy (nginx/Caddy), req.ip is the proxy's address unless Express
  // is told to trust it — which made every user share one login rate-limit bucket.
  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
  const corsOpts = { exposedHeaders: ['X-Refresh-Token'] };
  app.use(cors(corsOpts));
  app.options('*', cors(corsOpts));
  app.use(express.json());

  const auth = (...roles) => (req, res, next) => {
    try {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      req.user = jwt.verify(token, SECRET);
    } catch {
      return next(httpError(401, 'Unauthorized'));
    }
    if (roles.length && !roles.includes(req.user.role)) return next(httpError(403, 'Forbidden'));
    if (Date.now() / 1000 - req.user.iat > RENEW_AFTER_S) {
      const { sub, role, tenantId, kilnId } = req.user;
      res.set('X-Refresh-Token', signToken({ sub, role, tenantId, kilnId }));
    }
    next();
  };
  app.locals.auth = auth;
  const can = (module, action) => requirePerm(db, module, action);

  app.get('/', (_req, res) => res.json({ service: 'Brick Kiln ERP API', status: 'ok' }));
  app.get('/.well-known/*', (_req, res) => res.status(204).end());

  // Which build is running, and whether MongoDB is giving us transactions. Open /api/version to check a deploy.
  app.get('/version', (req, res) => res.json({ version: APP_VERSION, transactions: supportsTransactions() }));

  app.post('/auth/login', loginLimiter, wrap(async (req, res) => {
    const { password } = req.body;
    const username = String(req.body.username || '').trim().toLowerCase();
    const tenantCode = String(req.body.tenantCode || '').trim().toUpperCase();

    let tenantId = null;
    if (tenantCode) {
      const tenant = await db.collection('tenants').findOne({ code: tenantCode });
      if (!tenant) throw httpError(401, 'Invalid credentials');
      tenantId = String(tenant._id);
    }

    let user;
    if (tenantId) {
      user = await db.collection('users').findOne({ tenantId, username });
    } else {
      // No kiln code given: only safe to log in if the username is unique across
      // every tenant on this server. The moment a second tenant shares a username,
      // this refuses and asks for the kiln code instead of guessing which one.
      const matches = await db.collection('users').find({ username }).limit(2).toArray();
      if (matches.length > 1) throw httpError(409, 'More than one kiln uses this username; enter your Kiln Code');
      user = matches[0];
    }
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw httpError(401, 'Invalid credentials');
    const token = signToken({ sub: String(user._id), role: user.role, tenantId: user.tenantId, kilnId: user.kilnId });
    const tenant = await db.collection('tenants').findOne({ _id: oid(user.tenantId) });
    res.json({ token, role: user.role, username: user.username, kilnCode: tenant?.code ?? null });
  }));

  // ---- Settings (owner-editable, versioned, audit-logged) ----
  app.get('/settings', auth(), wrap(async (req, res) => {
    const out = {};
    for (const key of Object.keys(SETTING_DEFAULTS)) out[key] = await getSetting(db, req.user, key, SETTING_DEFAULTS);
    res.json(out);
  }));

  app.put('/settings', auth(), can('settings', 'edit'), wrap(async (req, res) => {
    const s = settingInput.parse(req.body);
    await withTransaction(db, async (session) => {
      await db.collection('settings').insertOne(
        { ...scope(req.user), key: s.key, value: s.value, effectiveFrom: s.effectiveFrom ?? new Date(), createdBy: req.user.sub },
        { session },
      );
      await audit(db, session, req.user, 'setting.update', s);
    });
    res.status(201).json({ ok: true });
  }));

  // ---- Workers (compliance gate: CNIC unique, age >= 14) ----
  app.post('/workers', auth(), can('workers', 'add'), wrap(async (req, res) => {
    const w = workerInput.parse(req.body);
    const age = ageOn(w.dob);
    if (age < MIN_WORKER_AGE) throw httpError(422, `Worker must be at least ${MIN_WORKER_AGE} years old`);
    await assertType(db, req.user, 'workerCategory', w.category);
    const doc = {
      ...scope(req.user), ...w,
      cnic: w.cnic.replace(/-/g, ''),
      peshgiLimit: w.peshgiLimit ? dec(w.peshgiLimit) : null,
      contractSigned: false, status: 'active',
      createdBy: req.user.sub, createdAt: new Date(),
    };
    try {
      const r = await db.collection('workers').insertOne(doc);
      res.status(201).json({
        id: r.insertedId, warning: age < RECOMMENDED_WORKER_AGE ? `Age under ${RECOMMENDED_WORKER_AGE}: not recommended` : undefined,
      });
    } catch (e) {
      if (e.code === 11000) throw httpError(409, 'Duplicate CNIC or clientUuid');
      throw e;
    }
  }));

  app.get('/workers', auth(), wrap(async (req, res) => {
    res.json(await db.collection('workers').find(scope(req.user)).toArray());
  }));

  app.get('/workers/:id', auth(), wrap(async (req, res) => {
    const w = await db.collection('workers').findOne({ _id: oid(req.params.id), ...scope(req.user) });
    if (!w) throw httpError(404, 'Worker not found');
    res.json(w);
  }));

  app.post('/workers/:id/contract-signed', auth('owner', 'munshi'), wrap(async (req, res) => {
    const { signedDocUrl } = req.body;
    if (!signedDocUrl) throw httpError(400, 'signedDocUrl required');
    await db.collection('workers').updateOne(
      { _id: oid(req.params.id), ...scope(req.user) }, { $set: { contractSigned: true, signedDocUrl } });
    res.json({ ok: true });
  }));

  // ---- Peshgi (advance) ----
  app.post('/advances', auth(), can('peshgi', 'add'), wrap(async (req, res) => {
    const a = advanceInput.parse(req.body);
    const worker = await db.collection('workers').findOne({ _id: oid(a.workerId), ...scope(req.user) });
    if (!worker) throw httpError(404, 'Worker not found');
    if (!worker.contractSigned) throw httpError(422, 'Signed contract required before any payment');

    const result = await withTransaction(db, async (session) => {
      const limitStr = worker.peshgiLimit?.toString() ?? await getSetting(db, req.user, 'peshgiLimit', SETTING_DEFAULTS, session);
      const perMunshi = await getSetting(db, req.user, 'munshiAdvanceLimit', SETTING_DEFAULTS, session);
      const outstanding = await balance(db, req.user, a.workerId, 'peshgi', session);
      const after = toPaisa(outstanding) + toPaisa(a.amount);

      let overridden = false;
      if (after > toPaisa(limitStr)) {
        if (req.user.role !== 'owner' || !a.overrideReason) {
          throw httpError(422, `Exceeds peshgi limit of Rs ${limitStr}; owner override with reason required`);
        }
        overridden = true;
      }
      if (req.user.role === 'munshi' && toPaisa(a.amount) > toPaisa(perMunshi)) {
        throw httpError(403, `Above munshi advance limit of Rs ${perMunshi}; owner approval required`);
      }
      const entry = await postEntry(db, session, req.user, {
        partyType: 'worker', partyId: a.workerId, account: 'peshgi', type: 'advance',
        debit: a.amount, reason: a.overrideReason, clientUuid: a.clientUuid, at: entryAt(a.date),
      });
      await audit(db, session, req.user, overridden ? 'advance.override' : 'advance.create', { workerId: a.workerId, amount: a.amount, reason: a.overrideReason });
      return entry;
    });
    res.status(201).json({ id: result._id });
  }));

  app.post('/recoveries', auth(), can('peshgi', 'add'), wrap(async (req, res) => {
    const r = recoveryInput.parse(req.body);
    const entry = await withTransaction(db, async (session) => {
      const e = await postEntry(db, session, req.user, {
        partyType: 'worker', partyId: r.workerId, account: 'peshgi', type: 'recovery',
        credit: r.amount, clientUuid: r.clientUuid, at: entryAt(r.date),
      });
      await audit(db, session, req.user, 'recovery.create', r);
      return e;
    });
    res.status(201).json({ id: entry._id });
  }));

  app.post('/ledger/:id/reverse', auth(), can('peshgi', 'delete'), wrap(async (req, res) => {
    const { reason, clientUuid } = req.body;
    if (!reason || !clientUuid) throw httpError(400, 'reason and clientUuid required');
    const e = await withTransaction(db, async (session) => {
      const rev = await reverseEntry(db, session, req.user, req.params.id, reason, clientUuid);
      await audit(db, session, req.user, 'ledger.reverse', { id: req.params.id, reason });
      return rev;
    });
    res.status(201).json({ id: e._id });
  }));

  app.get('/workers/:id/peshgi', auth(), wrap(async (req, res) => {
    res.json({ outstanding: await balance(db, req.user, req.params.id, 'peshgi') });
  }));

  // ---- Insights / reports (read-only aggregates over seeded or live operational data) ----
  app.get('/insights/summary', auth(), wrap(async (req, res) => {
    const s = scope(req.user);
    const [moulding] = await db.collection('mouldingBatches').aggregate([
      { $match: s }, { $group: { _id: null, moulded: { $sum: '$count' }, kharaba: { $sum: '$kharaba' } } },
    ]).toArray();
    const [unload] = await db.collection('unloadings').aggregate([
      { $match: s }, { $group: { _id: null, awwal: { $sum: '$awwal' }, doem: { $sum: '$doem' }, khangar: { $sum: '$khangar' }, broken: { $sum: '$broken' } } },
    ]).toArray();
    const [coal] = await db.collection('firingLogs').aggregate([
      { $match: s }, { $group: { _id: null, coalKg: { $sum: '$coalKg' }, days: { $sum: 1 }, fanOffDays: { $sum: { $cond: ['$fanOn', 0, 1] } } } },
    ]).toArray();
    const [sales] = await db.collection('invoices').aggregate([
      { $match: s }, { $group: { _id: null, revenue: { $sum: { $toDouble: '$amount' } }, count: { $sum: 1 } } },
    ]).toArray();
    const [paid] = await db.collection('payments').aggregate([
      { $match: { ...s, direction: 'in' } }, { $group: { _id: null, total: { $sum: { $toDouble: '$amount' } } } },
    ]).toArray();
    const [expenses] = await db.collection('expenses').aggregate([
      { $match: s }, { $group: { _id: null, total: { $sum: { $toDouble: '$amount' } } } },
    ]).toArray();
    const [peshgiOut] = await db.collection('ledgerEntries').aggregate([
      { $match: { ...s, account: 'peshgi' } },
      { $group: { _id: null, d: { $sum: { $toDouble: '$debit' } }, c: { $sum: { $toDouble: '$credit' } } } },
    ]).toArray();
    const totalUnloaded = unload ? unload.awwal + unload.doem + unload.khangar + unload.broken : 0;

    res.json({
      moulded: moulding?.moulded ?? 0,
      kharaba: moulding?.kharaba ?? 0,
      wastagePct: moulding?.moulded ? +((moulding.kharaba / moulding.moulded) * 100).toFixed(1) : 0,
      unloaded: unload ?? { awwal: 0, doem: 0, khangar: 0, broken: 0 },
      awwalSharePct: totalUnloaded ? +((unload.awwal / totalUnloaded) * 100).toFixed(1) : 0,
      coalKg: coal?.coalKg ?? 0,
      coalPer1000: totalUnloaded ? +((coal.coalKg / totalUnloaded) * 1000).toFixed(1) : 0,
      fanOffDays: coal?.fanOffDays ?? 0,
      salesRevenue: +(sales?.revenue ?? 0).toFixed(2),
      invoiceCount: sales?.count ?? 0,
      cashReceived: +(paid?.total ?? 0).toFixed(2),
      totalExpenses: +(expenses?.total ?? 0).toFixed(2),
      receivablesOutstanding: +((sales?.revenue ?? 0) - (paid?.total ?? 0)).toFixed(2),
      peshgiOutstanding: peshgiOut ? +(peshgiOut.d - peshgiOut.c).toFixed(2) : 0,
    });
  }));

  app.get('/insights/daily', auth(), wrap(async (req, res) => {
    const s = scope(req.user);
    let dateMatch;
    if (req.query.from && req.query.to) {
      const fromDate = new Date(`${req.query.from}T00:00:00.000Z`);
      const toDate = new Date(`${req.query.to}T23:59:59.999Z`);
      dateMatch = { $gte: fromDate, $lte: toDate };
    } else {
      const days = Math.min(Math.max(Number(req.query.days) || 182, 1), 400);
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      dateMatch = { $gte: since };
    }
    const dateKey = { $dateToString: { format: '%Y-%m-%d', date: '$date' } };

    const moulded = await db.collection('mouldingBatches').aggregate([
      { $match: { ...s, date: dateMatch } },
      { $group: { _id: dateKey, moulded: { $sum: '$count' }, kharaba: { $sum: '$kharaba' } } },
    ]).toArray();
    const unloaded = await db.collection('unloadings').aggregate([
      { $match: { ...s, date: dateMatch } },
      { $group: { _id: dateKey, awwal: { $sum: '$awwal' }, doem: { $sum: '$doem' }, khangar: { $sum: '$khangar' }, broken: { $sum: '$broken' } } },
    ]).toArray();
    const coal = await db.collection('firingLogs').aggregate([
      { $match: { ...s, date: dateMatch } },
      { $group: { _id: dateKey, coalKg: { $sum: '$coalKg' } } },
    ]).toArray();
    const sales = await db.collection('invoices').aggregate([
      { $match: { ...s, date: dateMatch } },
      { $group: { _id: dateKey, revenue: { $sum: { $toDouble: '$amount' } } } },
    ]).toArray();
    const cashIn = await db.collection('payments').aggregate([
      { $match: { ...s, date: dateMatch, direction: 'in' } },
      { $group: { _id: dateKey, amount: { $sum: { $toDouble: '$amount' } } } },
    ]).toArray();
    const cashOut = await db.collection('expenses').aggregate([
      { $match: { ...s, date: dateMatch } },
      { $group: { _id: dateKey, amount: { $sum: { $toDouble: '$amount' } } } },
    ]).toArray();

    const byDate = {};
    const at = (d) => (byDate[d] ??= { date: d, moulded: 0, kharaba: 0, awwal: 0, doem: 0, khangar: 0, broken: 0, coalKg: 0, revenue: 0, cashIn: 0, cashOut: 0 });
    moulded.forEach((r) => { const x = at(r._id); x.moulded += r.moulded; x.kharaba += r.kharaba; });
    unloaded.forEach((r) => { const x = at(r._id); x.awwal += r.awwal; x.doem += r.doem; x.khangar += r.khangar; x.broken += r.broken; });
    coal.forEach((r) => { at(r._id).coalKg += r.coalKg; });
    sales.forEach((r) => { at(r._id).revenue += r.revenue; });
    cashIn.forEach((r) => { at(r._id).cashIn += r.amount; });
    cashOut.forEach((r) => { at(r._id).cashOut += r.amount; });

    res.json(Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)));
  }));

  // ---- Audit log (write path already runs on every create/update/delete/login; this is the read side) ----
  app.get('/audit-logs', auth('owner', 'accountant'), wrap(async (req, res) => {
    const s = scope(req.user);
    const match = { ...s };
    if (req.query.action) match.action = req.query.action;
    if (req.query.from || req.query.to) {
      match.at = {};
      if (req.query.from) match.at.$gte = new Date(`${req.query.from}T00:00:00.000Z`);
      if (req.query.to) match.at.$lte = new Date(`${req.query.to}T23:59:59.999Z`);
    }
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const rows = await db.collection('auditLog').find(match).sort({ at: -1 }).limit(limit).toArray();

    const actorIds = [...new Set(rows.map((r) => r.actor).filter(Boolean))];
    const users = actorIds.length
      ? await db.collection('users').find({ ...s, _id: { $in: actorIds.map((id) => { try { return oid(id); } catch { return null; } }).filter(Boolean) } }).toArray()
      : [];
    const nameOf = Object.fromEntries(users.map((u) => [String(u._id), u.username]));

    const actions = await db.collection('auditLog').distinct('action', s);
    res.json({
      total: rows.length,
      actions,
      entries: rows.map((r) => ({ _id: r._id, at: r.at, actor: nameOf[r.actor] || r.actor, action: r.action, data: r.data })),
    });
  }));

  registerProductionRoutes(app, db);
  registerTypeRoutes(app, db);
  registerDeleteRoutes(app, db);
  registerKharchiRoutes(app, db);
  registerUserRoutes(app, db);
  registerEditRoutes(app, db);

  app.use((err, _req, res, _next) => {
    if (err instanceof ZodError) return res.status(400).json({ error: 'Validation failed', issues: err.issues });
    if (err.code === 11000) return res.status(409).json({ error: 'Duplicate (already posted)' });
    res.status(err.status || 500).json({ error: err.message });
  });
  return app;
}
