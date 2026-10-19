import { scope, oid, httpError } from './core.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const num = (d) => Number(d?.toString?.() ?? d ?? 0);
const dayRange = (q) => {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(q || '') ? q : new Date().toISOString().slice(0, 10);
  // a Pakistan day (UTC+5), so entries made after midnight or before 5 am land on the right day
  return { day, start: new Date(`${day}T00:00:00.000+05:00`), end: new Date(`${day}T23:59:59.999+05:00`) };
};
const fmt = (x) => Number(x || 0).toLocaleString(); // old records may miss a number
const WAGE_LABEL = {
  moulding_credit: 'Moulding wages', loading_credit: 'Bharai wages', unloading_credit: 'Nikasi wages', shift_credit: 'Firing shift wages',
};

export function registerJournalRoutes(app, db) {
  const auth = app.locals.auth;

  // ---- Khata (general ledger) of one worker, day one to today ----
  // Naam = money given to the worker (peshgi, dasti, cash on settlement); Jama = what they earned
  // (wages) or paid back. Baqaya (balance) = naam - jama = what the worker owes the kiln.
  app.get('/khata/:workerId', auth(), wrap(async (req, res) => {
    const s = scope(req.user);
    const id = req.params.workerId;
    const worker = await db.collection('workers').findOne({ _id: oid(id), ...s });
    if (!worker) throw httpError(404, 'Worker not found');

    const [entries, dasti, runs] = await Promise.all([
      db.collection('ledgerEntries').find({ ...s, partyId: id }).toArray(),
      db.collection('kharchaEntries').find({ ...s, workerId: id }).toArray(),
      db.collection('kharchiRuns').find({ ...s, 'items.workerId': id }).toArray(),
    ]);
    const rows = [];
    for (const e of entries) {
      const d = num(e.debit); const c = num(e.credit);
      if (e.account === 'peshgi') {
        if (e.type === 'advance') rows.push({ at: e.createdAt, detail: e.reason || 'Peshgi advance', naam: d, jama: 0 });
        else if (e.type === 'advance_reversal') rows.push({ at: e.createdAt, detail: 'Peshgi correction', naam: -c, jama: 0 });
        // the weekly cut is shown on the settlement row below, not twice
        else if (e.type === 'recovery' && !String(e.sourceRef || '').startsWith('kharchiRun:')) rows.push({ at: e.createdAt, detail: 'Peshgi paid back', naam: 0, jama: c });
        else if (e.type === 'recovery_reversal') rows.push({ at: e.createdAt, detail: 'Peshgi return corrected', naam: 0, jama: -d });
      } else if (e.account === 'earnings') {
        if (WAGE_LABEL[e.type]) {
          const bricks = e.qty ? ` — ${Math.round(e.qty).toLocaleString()} bricks` : '';
          rows.push({ at: e.createdAt, detail: `${WAGE_LABEL[e.type]}${bricks}`, naam: 0, jama: d });
        } else if (String(e.type).endsWith('_credit_reversal')) {
          rows.push({ at: e.createdAt, detail: 'Wages corrected', naam: 0, jama: -c });
        }
      }
    }
    for (const k of dasti) rows.push({ at: k.date, detail: k.note ? `Dasti — ${k.note}` : 'Dasti (weekly kharcha)', naam: num(k.amount), jama: 0 });
    for (const run of runs) {
      const it = run.items.find((x) => x.workerId === id);
      if (!it) continue;
      // cash handed over = kharchi - dasti already taken in that week
      const taken = dasti.filter((k) => k.date >= run.periodStart && k.date <= run.periodEnd).reduce((a, k) => a + num(k.amount), 0);
      const cash = Math.max(0, num(it.kharchi) - taken);
      const cut = num(it.recovery);
      rows.push({ at: run.createdAt, detail: `Thursday settlement — cash paid${cut ? ` (peshgi cut ${cut.toLocaleString()})` : ''}`, naam: cash, jama: 0 });
    }
    rows.sort((a, b) => new Date(a.at) - new Date(b.at));
    let bal = 0;
    const out = rows.map((r, i) => { bal += r.naam - r.jama; return { no: i + 1, ...r, balance: +bal.toFixed(2) }; });
    res.json({
      worker: { _id: worker._id, name: worker.name, fatherName: worker.fatherName, category: worker.category, cnic: worker.cnic, phone: worker.phone },
      rows: out,
      totals: { naam: out.reduce((a, r) => a + r.naam, 0), jama: out.reduce((a, r) => a + r.jama, 0), balance: bal },
    });
  }));

  // ---- Roznamcha: everything that happened on one day ----
  app.get('/roznamcha', auth(), wrap(async (req, res) => {
    const s = scope(req.user);
    const { day, start, end } = dayRange(req.query.date);
    const range = { $gte: start, $lte: end };
    const [teams, workers, customers, moulding, loads, unloads, invoices, payments, grns, firing, advances, dasti, notes] = await Promise.all([
      db.collection('teams').find(s).toArray(),
      db.collection('workers').find(s, { projection: { name: 1 } }).toArray(),
      db.collection('customers').find(s, { projection: { name: 1 } }).toArray(),
      db.collection('mouldingBatches').find({ ...s, date: range }).toArray(),
      db.collection('sectionLoads').find({ ...s, date: range }).toArray(),
      db.collection('unloadings').find({ ...s, date: range }).toArray(),
      db.collection('invoices').find({ ...s, date: range }).toArray(),
      db.collection('payments').find({ ...s, date: range }).toArray(),
      db.collection('grns').find({ ...s, date: range }).toArray(),
      db.collection('firingLogs').find({ ...s, date: range }).toArray(),
      db.collection('ledgerEntries').find({ ...s, account: 'peshgi', type: 'advance', createdAt: range }).toArray(),
      db.collection('kharchaEntries').find({ ...s, date: range }).toArray(),
      db.collection('auditLog').find({ ...s, action: { $in: ['line.notes', 'chamber.notes'] }, at: range }).toArray(),
    ]);
    const marks = await db.collection('attendance').find({ ...s, date: day, status: { $in: ['absent', 'leave'] } }).toArray();
    const team = Object.fromEntries(teams.map((t) => [String(t._id), t.label]));
    const wname = Object.fromEntries(workers.map((w) => [String(w._id), w.name]));
    const cname = Object.fromEntries(customers.map((c) => [String(c._id), c.name]));
    const unitName = (r) => (r.unit === 'grid' ? 'Weekly entry' : `${r.unit === 'line' ? 'Line' : 'Chamber'} ${r.sectionIndex}`);
    const ev = [];
    for (const m of moulding) ev.push({ at: m.date, type: 'moulding', detail: `${team[m.teamId] || '—'}: ${fmt(m.count)} moulded, net ${fmt(m.netCount)}${m.quality ? ` (${m.quality})` : ''}`, qty: m.netCount });
    for (const l of loads) ev.push({ at: l.date, type: 'bharai', detail: `${unitName(l)} loaded by ${team[l.teamId] || '—'}: ${fmt(l.count)} kachi bricks`, qty: l.count });
    for (const u of unloads) ev.push({ at: u.date, type: 'nikasi', detail: `${unitName(u)} by ${team[u.nikasiTeamId] || '—'}: awwal ${fmt(u.awwal)}, doem ${fmt(u.doem)}, khangar ${fmt(u.khangar)}, broken ${fmt(u.broken)}`, qty: (u.awwal || 0) + (u.doem || 0) + (u.khangar || 0) });
    for (const i of invoices) ev.push({ at: i.date, type: 'sale', detail: `${cname[i.customerId] || '—'}: ${fmt(i.qty)} ${i.grade}`, amount: num(i.amount) + num(i.tax) });
    for (const p of payments) ev.push({ at: p.date, type: 'payment', detail: `Received from ${cname[p.partyId] || '—'} (${p.mode})`, amount: num(p.amount) });
    for (const g of grns) ev.push({ at: g.date, type: g.item === 'coal' ? 'coalArrival' : 'purchase', detail: `${g.item}: ${g.qty} from ${g.supplierName || '—'}${g.vehicleNo ? ` (${g.vehicleNo})` : ''}`, amount: num(g.landedTotal) });
    for (const f of firing) ev.push({ at: f.date, type: 'coalUse', detail: `${f.shift} shift, ${team[f.teamId] || '—'}: ${fmt(f.coalKg)} kg coal, ${f.tempC ?? '—'} °C${f.lineIndex ? `, line ${f.lineIndex}` : ''}`, qty: f.coalKg });
    for (const a of advances) ev.push({ at: a.createdAt, type: 'peshgi', detail: `Peshgi to ${wname[a.partyId] || '—'}${a.reason ? ` — ${a.reason}` : ''}`, amount: num(a.debit) });
    for (const k of dasti) ev.push({ at: k.date, type: 'dasti', detail: `Dasti to ${wname[k.workerId] || '—'}`, amount: num(k.amount) });
    for (const n of notes) {
      if (n.data?.coalKg) ev.push({ at: n.at, type: 'coalUse', detail: `${n.action.startsWith('line') ? 'Line' : 'Chamber'} ${n.data.index}: ${Number(n.data.coalKg).toLocaleString()} kg coal`, qty: Number(n.data.coalKg) });
      if (n.data?.issues) ev.push({ at: n.at, type: 'issue', detail: `${n.action.startsWith('line') ? 'Line' : 'Chamber'} ${n.data.index}: ${n.data.issues}` });
    }
    for (const a of marks) ev.push({ at: start, type: 'absent', detail: `${wname[a.workerId] || '—'}: ${a.status === 'leave' ? 'on leave' : 'absent'}` });
    ev.sort((a, b) => new Date(a.at) - new Date(b.at));
    res.json({ date: day, rows: ev.map((e, i) => ({ no: i + 1, ...e })) });
  }));
}
