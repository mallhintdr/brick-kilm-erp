import { z } from 'zod';
import { SETTING_DEFAULTS } from '@kiln/shared';
import { withTransaction } from './db.js';
import { scope, audit, getSetting, httpError } from './core.js';
import { creditTeam, soloTeamFor, entryAt } from './production.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const notFuture = (d) => d <= new Date(Date.now() + 86400000).toISOString().slice(0, 10);

const attendanceInput = z.object({
  date: isoDay.refine(notFuture, 'Date cannot be in the future'),
  entries: z.array(z.object({ workerId: z.string(), status: z.enum(['present', 'absent', 'leave', 'half']) })).max(2000),
});
const workEntryInput = z.object({
  kind: z.enum(['bharai', 'nikasi']),
  workerId: z.string(),
  date: z.coerce.date().refine((d) => d.getTime() <= Date.now() + 86400000, 'Date cannot be in the future'),
  count: z.coerce.number().int().positive().max(10000000),
  grade: z.enum(['awwal', 'doem', 'khangar']).optional(), // nikasi only
  clientUuid: z.string().uuid(),
});

export function registerAttendanceRoutes(app, db) {
  const auth = app.locals.auth;

  // ---- Attendance: one mark per worker per day ----
  app.get('/attendance', auth(), wrap(async (req, res) => {
    const date = isoDay.safeParse(req.query.date).success ? req.query.date : new Date().toISOString().slice(0, 10);
    res.json(await db.collection('attendance').find({ ...scope(req.user), date }).toArray());
  }));

  // One worker's marks over a period (newest first), for the week / 15 days / month view.
  app.get('/attendance/worker/:id', auth(), wrap(async (req, res) => {
    const to = isoDay.safeParse(req.query.to).success ? req.query.to : new Date().toISOString().slice(0, 10);
    const from = isoDay.safeParse(req.query.from).success ? req.query.from : to;
    res.json(await db.collection('attendance').find({ ...scope(req.user), workerId: req.params.id, date: { $gte: from, $lte: to } }).sort({ date: -1 }).toArray());
  }));

  app.put('/attendance', auth('owner', 'munshi'), wrap(async (req, res) => {
    const b = attendanceInput.parse(req.body);
    const s = scope(req.user);
    if (b.entries.length) {
      await db.collection('attendance').bulkWrite(b.entries.map((e) => ({
        updateOne: {
          filter: { ...s, date: b.date, workerId: e.workerId },
          update: { $set: { status: e.status, by: req.user.sub, updatedAt: new Date() }, $setOnInsert: { ...s, date: b.date, workerId: e.workerId } },
          upsert: true,
        },
      })));
    }
    await audit(db, undefined, req.user, 'attendance.save', { date: b.date, count: b.entries.length, absent: b.entries.filter((e) => e.status === 'absent').length });
    res.json({ ok: true, saved: b.entries.length });
  }));

  // ---- Weekly grid entries for bharai (loading) and nikasi (unloading), not tied to a line ----
  app.post('/work-entries', auth('owner', 'munshi'), wrap(async (req, res) => {
    const b = workEntryInput.parse(req.body);
    if (b.kind === 'nikasi' && !b.grade) throw httpError(400, 'Choose the brick grade');
    const teamId = await soloTeamFor(db, undefined, req.user, b.workerId, b.kind);
    const at = entryAt(b.date);
    await withTransaction(db, async (session) => {
      const s = scope(req.user);
      if (b.kind === 'bharai') {
        await db.collection('sectionLoads').insertOne({ ...s, unit: 'grid', sectionIndex: null, teamId, count: b.count, date: at }, { session });
        const rate = await getSetting(db, req.user, 'rateBharai', SETTING_DEFAULTS, session);
        await creditTeam(db, session, req.user, teamId, ((b.count / 1000) * Number(rate)).toFixed(2), 'loading_credit', `gridLoad:${b.clientUuid}`, b.clientUuid, at, { bricks: b.count, rate });
      } else {
        const g = { awwal: 0, doem: 0, khangar: 0, [b.grade]: b.count };
        await db.collection('unloadings').insertOne({ ...s, unit: 'grid', sectionIndex: null, nikasiTeamId: teamId, ...g, broken: 0, date: at }, { session });
        const rate = await getSetting(db, req.user, 'rateNikasi', SETTING_DEFAULTS, session);
        await creditTeam(db, session, req.user, teamId, ((b.count / 1000) * Number(rate)).toFixed(2), 'unloading_credit', `gridUnload:${b.clientUuid}`, b.clientUuid, at, { bricks: b.count, rate });
      }
      await audit(db, session, req.user, `${b.kind}.grid`, { workerId: b.workerId, count: b.count, grade: b.grade, date: at });
    });
    res.status(201).json({ ok: true });
  }));

  // What each worker did per day in a range: [{ workerId, date, count }] (solo teams only).
  // bharai counts every load (lines, chambers, grid); nikasi counts the chosen grade.
  app.get('/work-week', auth(), wrap(async (req, res) => {
    const kind = req.query.kind === 'nikasi' ? 'nikasi' : 'bharai';
    const grade = ['awwal', 'doem', 'khangar'].includes(req.query.grade) ? req.query.grade : null;
    if (!isoDay.safeParse(req.query.from).success || !isoDay.safeParse(req.query.to).success) throw httpError(400, 'from and to dates required');
    const s = scope(req.user);
    const range = { $gte: new Date(`${req.query.from}T00:00:00.000Z`), $lte: new Date(`${req.query.to}T23:59:59.999Z`) };
    const teams = await db.collection('teams').find({ ...s, category: kind, solo: true }).toArray();
    const memberOf = Object.fromEntries(teams.map((t) => [String(t._id), t.memberIds[0]]));
    const coll = kind === 'bharai' ? 'sectionLoads' : 'unloadings';
    const teamField = kind === 'bharai' ? '$teamId' : '$nikasiTeamId';
    const value = kind === 'bharai' ? '$count' : grade ? `$${grade}` : { $add: ['$awwal', '$doem', '$khangar'] };
    const rows = await db.collection(coll).aggregate([
      { $match: { ...s, date: range } },
      { $group: { _id: { team: teamField, day: { $dateToString: { format: '%Y-%m-%d', date: '$date' } } }, count: { $sum: value } } },
    ]).toArray();
    res.json(rows.filter((r) => memberOf[r._id.team] && r.count > 0)
      .map((r) => ({ workerId: memberOf[r._id.team], date: r._id.day, count: r.count })));
  }));
}
