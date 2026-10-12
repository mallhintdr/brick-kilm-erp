import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';

// Idempotent: safe to call on every server start. Reuses the existing tenant/kiln
// and only creates users that don't already exist, so a `node --watch` restart
// never wipes or duplicates the persistent dev database.
export async function seed(db, { password = 'owner123' } = {}) {
  let tenant = await db.collection('tenants').findOne({ name: 'Sadiqabad Kiln' });
  let kiln;
  if (!tenant) {
    const tenantId = String(new ObjectId());
    const kilnId = String(new ObjectId());
    // A short, owner-visible code (not a DNS subdomain) that disambiguates tenants at
    // login once more than one kiln shares this server. Cheap to add, upgradeable to
    // subdomain-per-tenant later without a data migration.
    const code = 'SAD' + Math.floor(100 + Math.random() * 900);
    tenant = { _id: new ObjectId(tenantId), tenantId, name: 'Sadiqabad Kiln', code };
    await db.collection('tenants').insertOne(tenant);
    kiln = { _id: new ObjectId(kilnId), tenantId, name: 'Sadiqabad Zig-Zag Kiln', sectionCount: 28 };
    await db.collection('kilns').insertOne(kiln);
  } else {
    tenant.tenantId = String(tenant._id);
    kiln = await db.collection('kilns').findOne({ tenantId: tenant.tenantId });
    if (!tenant.code) {
      // Backfill for tenants created before the Kiln Code login fix.
      tenant.code = 'SAD' + Math.floor(100 + Math.random() * 900);
      await db.collection('tenants').updateOne({ _id: tenant._id }, { $set: { code: tenant.code } });
    }
  }
  const tenantId = tenant.tenantId;
  const kilnId = String(kiln._id);
  const passwordHash = await bcrypt.hash(password, 10);
  for (const [username, role] of [['owner', 'owner'], ['munshi', 'munshi']]) {
    const exists = await db.collection('users').findOne({ tenantId, username });
    if (!exists) await db.collection('users').insertOne({ tenantId, kilnId, username, role, passwordHash });
  }

  const sectionCount = await db.collection('kilnSections').countDocuments({ tenantId, kilnId });
  if (sectionCount === 0) {
    const sections = Array.from({ length: kiln.sectionCount || 28 }, (_, i) => ({
      tenantId, kilnId, index: i + 1, capacity: 4000, state: 'Empty', currentLoad: 0,
    }));
    await db.collection('kilnSections').insertMany(sections);
  }

  return { tenantId, kilnId, password, tenantCode: tenant.code };
}
