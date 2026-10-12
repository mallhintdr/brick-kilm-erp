import { MongoClient } from 'mongodb';

let client;
let memory;

// Dev/prod: a real, locally-installed MongoDB (Windows service, replica set "rs0")
// at the default port. Data persists across restarts because it's a real database,
// not a throwaway instance. Override with MONGO_URI for Atlas/other hosts.
const DEV_URI = 'mongodb://localhost:27017';

export async function connect(uri = process.env.MONGO_URI) {
  if (!uri) {
    if (process.env.NODE_ENV === 'test') {
      // Tests want a clean, throwaway replica set every run, isolated from dev data.
      const { MongoMemoryReplSet } = await import('mongodb-memory-server');
      memory = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
      uri = memory.getUri();
    } else {
      uri = DEV_URI;
    }
  }
  client = await new MongoClient(uri).connect();
  const db = client.db(process.env.MONGO_DB || 'brick_kiln');
  await ensureIndexes(db);
  return db;
}

export async function close() {
  await client?.close();
  await memory?.stop();
}

export function withTransaction(db, fn) {
  const session = client.startSession();
  return session
    .withTransaction(() => fn(session))
    .then((r) => r)
    .finally(() => session.endSession());
}

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
