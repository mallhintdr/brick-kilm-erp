import { MongoClient } from 'mongodb';

let client;
let memory;
// Multi-document transactions need a replica set (or mongos). A standalone server can't run them,
// so there we fall back to running the same writes without a transaction.
let transactions = true;

// Dev/prod: a real, locally-installed MongoDB (Windows service, replica set "rs0")
// at the default port. Data persists across restarts because it's a real database,
// not a throwaway instance. Override with MONGO_URI for Atlas/other hosts.
const DEV_URI = 'mongodb://localhost:27017';

export async function connect(uri = process.env.MONGO_URI) {
  if (!uri) {
    if (process.env.NODE_ENV === 'test') {
      // Tests want a clean, throwaway database every run, isolated from dev data: a replica set by
      // default, or a standalone server (like many production hosts) with TEST_STANDALONE=1.
      const { MongoMemoryReplSet, MongoMemoryServer } = await import('mongodb-memory-server');
      memory = process.env.TEST_STANDALONE === '1'
        ? await MongoMemoryServer.create()
        : await MongoMemoryReplSet.create({ replSet: { count: 1 } });
      uri = memory.getUri();
    } else {
      uri = DEV_URI;
    }
  }
  client = await new MongoClient(uri).connect();
  const db = client.db(process.env.MONGO_DB || 'brick_kiln');
  const hello = await db.admin().command({ hello: 1 }).catch(() => ({}));
  transactions = Boolean(hello.setName || hello.msg === 'isdbgrid');
  // test hook: pretend the server claims transaction support, to exercise the runtime fallback
  if (process.env.NODE_ENV === 'test' && process.env.TEST_FORCE_TX === '1') transactions = true;
  if (!transactions) {
    console.warn('[db] MongoDB is a standalone server: transactions are off. Run it as a replica set for all-or-nothing writes.');
  }
  await ensureIndexes(db);
  return db;
}

export async function close() {
  await client?.close();
  await memory?.stop();
}

export const supportsTransactions = () => transactions;

export function withTransaction(db, fn) {
  // Standalone server: run the steps directly (`session` undefined = ordinary writes).
  if (!transactions) return Promise.resolve().then(() => fn(undefined));
  const session = client.startSession();
  return session
    .withTransaction(() => fn(session))
    .then((r) => r)
    .catch((err) => {
      // The server said it was a replica set but refused the transaction (e.g. started with --replSet
      // but never initiated). It refuses before the first write, so nothing landed: switch off and redo.
      if (isNoTransactionsError(err)) {
        transactions = false;
        console.warn('[db] transactions refused by MongoDB; continuing without them:', err.message);
        return fn(undefined);
      }
      throw err;
    })
    .finally(() => session.endSession());
}

const isNoTransactionsError = (err) => /Transaction numbers are only allowed|Transactions are not supported/i.test(String(err?.message));

async function ensureIndexes(db) {
  await db.collection('tenants').createIndex({ code: 1 }, { unique: true, sparse: true });
  await db.collection('users').createIndex({ tenantId: 1, username: 1 }, { unique: true });
  await db.collection('workers').createIndex({ tenantId: 1, cnic: 1 }, { unique: true });
  await db.collection('workers').createIndex({ clientUuid: 1 }, { unique: true, sparse: true });
  await db.collection('ledgerEntries').createIndex({ clientUuid: 1 }, { unique: true });
  await db.collection('ledgerEntries').createIndex({ tenantId: 1, partyId: 1, account: 1 });
  await db.collection('settings').createIndex({ tenantId: 1, kilnId: 1, key: 1, effectiveFrom: -1 });
  await db.collection('auditLog').createIndex({ tenantId: 1, at: -1 });
  await db.collection('kilnSections').createIndex({ tenantId: 1, kilnId: 1, index: 1 }, { unique: true });
  await db.collection('kilnLines').createIndex({ tenantId: 1, kilnId: 1, index: 1 }, { unique: true });
  await db.collection('mouldingBatches').createIndex({ tenantId: 1, date: -1 });
  await db.collection('firingLogs').createIndex({ tenantId: 1, date: -1 });
  await db.collection('unloadings').createIndex({ tenantId: 1, date: -1 });
  await db.collection('grns').createIndex({ tenantId: 1, date: -1 });
  await db.collection('types').createIndex({ tenantId: 1, kilnId: 1, kind: 1, key: 1 }, { unique: true });
  await db.collection('invoices').createIndex({ tenantId: 1, date: -1 });
  await db.collection('payments').createIndex({ tenantId: 1, date: -1 });
  await db.collection('payments').createIndex({ tenantId: 1, invoiceId: 1 });
  await db.collection('kharchiRuns').createIndex({ tenantId: 1, kilnId: 1, category: 1, periodStart: 1 });
  await db.collection('permissions').createIndex({ tenantId: 1, kilnId: 1, userId: 1, module: 1 }, { unique: true });
}
