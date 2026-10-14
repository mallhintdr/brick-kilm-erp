import { ObjectId } from 'mongodb';
import {
  workerUpdate, mouldingUpdate, firingUpdate, customerUpdate, grnUpdate, invoiceUpdate, paymentUpdate, expenseUpdate, advanceUpdate,
  SETTING_DEFAULTS, toPaisa,
} from '@kiln/shared';
import { withTransaction } from './db.js';
import { scope, audit, getSetting, oid, reverseBySource, httpError, assertType, postEntry } from './core.js';
import { requirePerm } from './users.js';
import { creditTeam, workDateTime, assertTeamDayFree } from './production.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

// Cash book corrections: anyone who records cash may fix today's entries; past days are owner-only.
// "Today" uses the same UTC day the cash book groups by.
const dayOf = (d) => new Date(d).toISOString().slice(0, 10);
export function assertCashEditable(user, date) {
  if (user.role === 'owner') return;
  if (dayOf(date) !== dayOf(new Date())) throw httpError(403, 'Only the owner can correct entries from past days');
}

// Record edits. Owner-only by default (workers use the per-user permission matrix).
// Every edit stores the before/after in the audit log. Money stays append-only: where an
// edit changes wages, the old wage entries are reversed and fresh ones posted.
export function registerEditRoutes(app, db) {
  const auth = app.locals.auth;

  // Load the record, let `apply` validate and build the $set (plus any side effects), save, audit.
  function editor(path, collName, schema, action, apply, gate = auth('owner')) {
    app.put(path, gate, wrap(async (req, res) => {
      if (!ObjectId.isValid(req.params.id)) throw httpError(400, 'Invalid id');
      const patch = schema.parse(req.body);
      const out = await withTransaction(db, async (session) => {
        const before = await db.collection(collName).findOne({ _id: oid(req.params.id), ...scope(req.user) }, { session });
        if (!before) throw httpError(404, 'Record not found');
        const set = (await apply(before, patch, session, req)) ?? patch;
        if (Object.keys(set).length) {
          await db.collection(collName).updateOne({ _id: before._id }, { $set: { ...set, updatedAt: new Date(), updatedBy: req.user.sub } }, { session });
        }
        await audit(db, session, req.user, action, { id: req.params.id, before, after: set });
        return set;
      });
      res.json({ ok: true, updated: out });
    }));
  }

  editor('/workers/:id', 'workers', workerUpdate, 'worker.update', async (_w, patch, _s, req) => {
    if (patch.category) await assertType(db, req.user, 'workerCategory', patch.category);
    return patch;
  }, [auth(), requirePerm(db, 'workers', 'edit')]);

  editor('/customers/:id', 'customers', customerUpdate, 'customer.update', async (_c, patch, _s, req) => {
    if (patch.type) await assertType(db, req.user, 'customerType', patch.type);
    return patch;
  });

  editor('/moulding/:id', 'mouldingBatches', mouldingUpdate, 'moulding.update', async (b, patch, session, req) => {
    const count = patch.count ?? b.count;
    const kharaba = patch.kharaba ?? b.kharaba;
    if (kharaba > count) throw httpError(422, 'Kharaba cannot exceed the moulded count');
    const date = patch.date ? workDateTime(patch.date) : b.date;
    if (patch.date) await assertTeamDayFree(db, session, req.user, b.teamId, date, b._id);
    const netCount = count - kharaba;
    const wagesChange = netCount !== b.netCount || (patch.date && date.getTime() !== new Date(b.date).getTime());
    if (wagesChange) {
      if (!b.ledgerRef) throw httpError(422, 'This older batch has no wage link; delete and re-enter it instead');
      await reverseBySource(db, session, req.user, b.ledgerRef, 'moulding batch edited');
      const rate = await getSetting(db, req.user, 'ratePathera', SETTING_DEFAULTS, session);
      const gross = ((netCount / 1000) * Number(rate)).toFixed(2);
      await creditTeam(db, session, req.user, b.teamId, gross, 'moulding_credit', b.ledgerRef, `${b.ledgerRef}-edit-${Date.now()}`, date);
    }
    return { count, kharaba, netCount, date };
  });

  // Firing wages are a flat per-shift rate, so these fields never change pay.
  editor('/firing-logs/:id', 'firingLogs', firingUpdate, 'firing.update', async (_f, patch) => patch);

  editor('/grns/:id', 'grns', grnUpdate, 'grn.update', async (g, patch, session, req) => {
    const qty = patch.qty ?? g.qty;
    const rate = patch.rate ?? g.rate;
    const freight = patch.freight ?? g.freight ?? '0';
    const landedTotal = (qty * Number(rate) + Number(freight)).toFixed(2);
    const landedUnitCost = (Number(landedTotal) / qty).toFixed(2);
    if (g.expenseId) {
      await db.collection('expenses').updateOne(
        { _id: g.expenseId, ...scope(req.user) },
        { $set: { amount: landedTotal, payee: patch.supplierName ?? g.supplierName } }, { session },
      );
    }
    return { ...patch, qty, rate, freight, landedTotal, landedUnitCost };
  });

  const paidOn = async (invoiceId, session, req, excludePaymentId) => {
    const match = { ...scope(req.user), invoiceId };
    if (excludePaymentId) match._id = { $ne: excludePaymentId };
    const [r] = await db.collection('payments').aggregate([
      { $match: match }, { $group: { _id: null, total: { $sum: { $toDouble: '$amount' } } } },
    ], { session }).toArray();
    return r?.total ?? 0;
  };

  editor('/invoices/:id', 'invoices', invoiceUpdate, 'invoice.update', async (inv, patch, session, req) => {
    const qty = patch.qty ?? inv.qty;
    const rate = patch.rate ?? inv.rate;
    const taxPct = patch.taxPct ?? (Number(inv.amount) ? (Number(inv.tax) / Number(inv.amount)) * 100 : 0);
    const amount = ((qty / 1000) * Number(rate)).toFixed(2);
    const tax = (Number(amount) * (taxPct / 100)).toFixed(2);
    const paid = await paidOn(String(inv._id), session, req);
    const total = Number(amount) + Number(tax);
    if (paid > total + 0.005) throw httpError(422, `Payments already received (Rs ${paid.toFixed(2)}) exceed the new total`);
    return { qty, rate: String(rate), amount, tax, status: paid >= total - 0.005 ? 'paid' : 'open' };
  });

  editor('/payments/:id', 'payments', paymentUpdate, 'payment.update', async (p, patch, session, req) => {
    assertCashEditable(req.user, p.date);
    if (patch.mode) await assertType(db, req.user, 'paymentMode', patch.mode);
    if (patch.amount && p.invoiceId) {
      const inv = await db.collection('invoices').findOne({ _id: oid(p.invoiceId), ...scope(req.user) }, { session });
      if (inv) {
        const total = Number(inv.amount) + Number(inv.tax);
        const others = await paidOn(p.invoiceId, session, req, p._id);
        const owed = total - others;
        if (toPaisa(patch.amount) > toPaisa(owed.toFixed(2))) throw httpError(422, `Payment exceeds amount owed (Rs ${owed.toFixed(2)})`);
        const status = others + Number(patch.amount) >= total - 0.005 ? 'paid' : 'open';
        await db.collection('invoices').updateOne({ _id: inv._id }, { $set: { status } }, { session });
      }
    }
    return patch;
  }, auth('owner', 'munshi'));

  // An expense raised by a goods receipt stays in step with it: the GRN's landed cost follows the amount.
  editor('/expenses/:id', 'expenses', expenseUpdate, 'expense.update', async (e, patch, session, req) => {
    assertCashEditable(req.user, e.date);
    const grn = await db.collection('grns').findOne({ expenseId: e._id, ...scope(req.user) }, { session });
    if (grn) {
      const set = {};
      if (patch.payee) set.supplierName = patch.payee;
      if (patch.amount) {
        const freight = Number(grn.freight ?? 0);
        set.landedTotal = Number(patch.amount).toFixed(2);
        set.landedUnitCost = (Number(patch.amount) / grn.qty).toFixed(2);
        set.rate = ((Number(patch.amount) - freight) / grn.qty).toFixed(2);
      }
      if (Object.keys(set).length) await db.collection('grns').updateOne({ _id: grn._id }, { $set: set }, { session });
    }
    return patch;
  }, auth('owner', 'munshi'));

  // Peshgi advances live in the append-only ledger: a correction reverses the original and posts the
  // corrected advance, both on the original day so the cash book for that day stays right.
  app.put('/advances/:id', auth('owner', 'munshi'), wrap(async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) throw httpError(400, 'Invalid id');
    const { amount } = advanceUpdate.parse(req.body);
    const out = await withTransaction(db, async (session) => {
      const orig = await db.collection('ledgerEntries').findOne(
        { _id: oid(req.params.id), ...scope(req.user), account: 'peshgi', type: 'advance' }, { session },
      );
      if (!orig) throw httpError(404, 'Advance not found');
      if (await db.collection('ledgerEntries').findOne({ reversesId: orig._id }, { session })) {
        throw httpError(409, 'This advance was already corrected; edit the newer entry');
      }
      assertCashEditable(req.user, orig.createdAt);
      if (req.user.role !== 'owner' && toPaisa(amount) > toPaisa(orig.debit.toString())) {
        throw httpError(403, 'Only the owner can increase an advance');
      }
      const at = orig.createdAt;
      await postEntry(db, session, req.user, {
        partyType: orig.partyType, partyId: orig.partyId, account: 'peshgi', type: 'advance_reversal',
        debit: '0', credit: orig.debit.toString(), sourceRef: orig.sourceRef, reversesId: orig._id,
        reason: 'advance corrected', clientUuid: `rev-${orig._id}`, at,
      });
      const fresh = await postEntry(db, session, req.user, {
        partyType: orig.partyType, partyId: orig.partyId, account: 'peshgi', type: 'advance',
        debit: amount, sourceRef: orig.sourceRef, reason: 'corrected', clientUuid: `edit-${orig._id}-${Date.now()}`, at,
      });
      await audit(db, session, req.user, 'advance.update', { id: req.params.id, before: orig.debit.toString(), after: amount, newId: fresh._id });
      return fresh._id;
    });
    res.json({ ok: true, id: out });
  }));
}