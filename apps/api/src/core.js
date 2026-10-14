import { Decimal128, ObjectId } from 'mongodb';
import { toPaisa, fromPaisa, BUILTIN_TYPES } from '@kiln/shared';

export const dec = (str) => Decimal128.fromString(String(str));
export const oid = (s) => new ObjectId(s);

// Every query is scoped to the caller's tenant and kiln.
export const scope = (user) => ({ tenantId: user.tenantId, kilnId: user.kilnId });

export async function audit(db, session, user, action, data = {}) {
  await db.collection('auditLog').insertOne(
    { ...scope(user), actor: user.sub, action, data, at: new Date() },
    { session },
  );
}

// Most recent setting whose effectiveFrom is not in the future.
export async function getSetting(db, user, key, defaults, session) {
  const row = await db.collection('settings').findOne(
    { ...scope(user), key, effectiveFrom: { $lte: new Date() } },
    { sort: { effectiveFrom: -1 }, session },
  );
  return row ? row.value : defaults[key];
}

// Append-only: entries are never updated. Corrections are reversals.
export async function postEntry(db, session, user, entry) {
  const doc = {
    ...scope(user),
    debit: dec(entry.debit ?? '0'),
    credit: dec(entry.credit ?? '0'),
    partyType: entry.partyType,
    partyId: entry.partyId,
    account: entry.account, // 'peshgi' | 'earnings'
    type: entry.type,
    sourceRef: entry.sourceRef ?? null,
    reversesId: entry.reversesId ?? null,
    reason: entry.reason ?? null,
    clientUuid: entry.clientUuid,
    createdBy: user.sub,
    createdAt: entry.at ?? new Date(),
  };
  const r = await db.collection('ledgerEntries').insertOne(doc, { session });
  return { _id: r.insertedId, ...doc };
}

export async function reverseEntry(db, session, user, entryId, reason, clientUuid) {
  const orig = await db.collection('ledgerEntries').findOne({ _id: oid(entryId), ...scope(user) }, { session });
  if (!orig) throw httpError(404, 'Entry not found');
  if (orig.reversesId) throw httpError(400, 'Cannot reverse a reversal');
  const already = await db.collection('ledgerEntries').findOne({ reversesId: orig._id }, { session });
  if (already) throw httpError(409, 'Entry already reversed');
  return postEntry(db, session, user, {
    partyType: orig.partyType, partyId: orig.partyId, account: orig.account,
    type: `${orig.type}_reversal`, debit: orig.credit.toString(), credit: orig.debit.toString(),
    reversesId: orig._id, reason, clientUuid,
  });
}

// Posts a reversing entry for every not-yet-reversed ledger row that came from `sourceRef`.
// Returns how many rows were reversed (0 for legacy records that carry no sourceRef link).
export async function reverseBySource(db, session, user, sourceRef, reason) {
  const rows = await db.collection('ledgerEntries').find({ ...scope(user), sourceRef, reversesId: null }, { session }).toArray();
  let n = 0;
  for (const orig of rows) {
    if (await db.collection('ledgerEntries').findOne({ reversesId: orig._id }, { session })) continue;
    await postEntry(db, session, user, {
      partyType: orig.partyType, partyId: orig.partyId, account: orig.account,
      type: `${orig.type}_reversal`, debit: orig.credit.toString(), credit: orig.debit.toString(),
      sourceRef, reversesId: orig._id, reason, clientUuid: `rev-${orig._id}`,
    });
    n++;
  }
  return n;
}

// Balance = sum(debit) - sum(credit), always computed from entries.
export async function balance(db, user, partyId, account, session) {
  const [r] = await db.collection('ledgerEntries').aggregate([
    { $match: { ...scope(user), partyId, account } },
    { $group: { _id: null, d: { $sum: '$debit' }, c: { $sum: '$credit' } } },
  ], { session }).toArray();
  if (!r) return '0.00';
  return fromPaisa(toPaisa(r.d.toString()) - toPaisa(r.c.toString()));
}

// Owner-editable lookup lists ("types"). Built-ins are created lazily per tenant/kiln
// so existing installs pick them up without a migration.
const typesReady = new Set();
export async function ensureBuiltinTypes(db, user) {
  const s = scope(user);
  // once per kiln per server run; new built-ins added in an update reach existing kilns too
  const k = `${s.tenantId}:${s.kilnId}`;
  if (typesReady.has(k)) return;
  typesReady.add(k);
  const docs = [];
  for (const [kind, rows] of Object.entries(BUILTIN_TYPES)) {
    for (const [key, label, labelUr] of rows) docs.push({ ...s, kind, key, label, labelUr, builtin: true, active: true, createdAt: new Date() });
  }
  await db.collection('types').insertMany(docs, { ordered: false }).catch((e) => { if (e.code !== 11000) throw e; });
}

// Throws 422 unless `key` is an active type of `kind` for this kiln.
export async function assertType(db, user, kind, key, session) {
  await ensureBuiltinTypes(db, user);
  const t = await db.collection('types').findOne({ ...scope(user), kind, key, active: true }, { session });
  if (!t) throw httpError(422, `Unknown or inactive ${kind}: "${key}". Add it under Settings → Types.`);
  return t;
}

export function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
