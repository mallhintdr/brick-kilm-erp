import { ObjectId } from 'mongodb';
import { SETTING_KEYS } from '@kiln/shared';
import { withTransaction } from './db.js';
import { scope, audit, oid, reverseBySource, httpError } from './core.js';
import { requirePerm } from './users.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

// Owner-only by default (most of these: deleting production/sales records). Stock and cash
// figures are derived from these records, so removing one corrects them automatically. Wage
// credits that a record posted are reversed (never erased), keeping the ledger append-only.
// Every delete stores a snapshot in the audit log.
export function registerDeleteRoutes(app, db) {
  const auth = app.locals.auth;

  // Fetch -> run guards/side effects -> delete -> audit, all in one transaction.
  // `gate` defaults to owner-only; pass a permission middleware to open it to an override.
  function deleter(path, collName, action, prepare, gate = auth('owner')) {
    app.delete(path, gate, wrap(async (req, res) => {
      if (!ObjectId.isValid(req.params.id)) throw httpError(400, 'Invalid id');
      const out = await withTransaction(db, async (session) => {
        const doc = await db.collection(collName).findOne({ _id: oid(req.params.id), ...scope(req.user) }, { session });
        if (!doc) throw httpError(404, 'Record not found');
        const extra = (await prepare?.(doc, session, req)) ?? {};
        await db.collection(collName).deleteOne({ _id: doc._id }, { session });
        await audit(db, session, req.user, action, { snapshot: doc, ...extra });
        return extra;
      });
      res.json({ ok: true, ...out });
    }));
  }

  deleter('/workers/:id', 'workers', 'worker.delete', async (w, session, req) => {
    const hist = await db.collection('ledgerEntries').countDocuments({ ...scope(req.user), partyId: String(w._id) }, { limit: 1, session });
    if (hist) throw httpError(409, 'This worker has ledger history (wages/peshgi). Records with money history cannot be deleted.');
  }, [auth(), requirePerm(db, 'workers', 'delete')]);

  deleter('/customers/:id', 'customers', 'customer.delete', async (c, session, req) => {
    const used = await db.collection('invoices').countDocuments({ ...scope(req.user), customerId: String(c._id) }, { limit: 1, session });
    if (used) throw httpError(409, 'This customer has invoices. Delete those invoices first.');
  });

  deleter('/invoices/:id', 'invoices', 'invoice.delete', async (inv, session, req) => {
    const paid = await db.collection('payments').countDocuments({ ...scope(req.user), invoiceId: String(inv._id) }, { limit: 1, session });
    if (paid) throw httpError(409, 'This invoice has payments. Delete the payments first.');
  });

  deleter('/payments/:id', 'payments', 'payment.delete', async (p, session, req) => {
    // Re-open the invoice: it is no longer fully paid.
    if (p.invoiceId) await db.collection('invoices').updateOne({ _id: oid(p.invoiceId), ...scope(req.user) }, { $set: { status: 'open' } }, { session });
  });

  deleter('/moulding/:id', 'mouldingBatches', 'moulding.delete', async (b, session, req) => {
    const reversed = b.ledgerRef ? await reverseBySource(db, session, req.user, b.ledgerRef, 'moulding batch deleted') : 0;
    return { wageEntriesReversed: reversed, legacyNoLedgerLink: !b.ledgerRef };
  });

  deleter('/firing-logs/:id', 'firingLogs', 'firing.delete', async (f, session, req) => {
    const reversed = f.ledgerRef ? await reverseBySource(db, session, req.user, f.ledgerRef, 'firing log deleted') : 0;
    return { wageEntriesReversed: reversed, legacyNoLedgerLink: !f.ledgerRef };
  });

  deleter('/grns/:id', 'grns', 'grn.delete', async (g, session, req) => {
    if (g.expenseId) await db.collection('expenses').deleteOne({ _id: g.expenseId, ...scope(req.user) }, { session });
    return { expenseRemoved: !!g.expenseId };
  });

  // "Delete" a setting = remove every override so it falls back to the built-in default.
  app.delete('/settings/:key', auth(), requirePerm(db, 'settings', 'delete'), wrap(async (req, res) => {
    if (!SETTING_KEYS.includes(req.params.key)) throw httpError(400, 'Unknown setting');
    const n = await withTransaction(db, async (session) => {
      const r = await db.collection('settings').deleteMany({ ...scope(req.user), key: req.params.key }, { session });
      await audit(db, session, req.user, 'setting.reset', { key: req.params.key, versionsRemoved: r.deletedCount });
      return r.deletedCount;
    });
    res.json({ ok: true, versionsRemoved: n });
  }));
}
