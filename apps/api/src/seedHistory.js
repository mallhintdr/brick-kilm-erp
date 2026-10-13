import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import { connect, close, withTransaction } from './db.js';
import { seed } from './seed.js';
import { postEntry } from './core.js';

// Deterministic RNG so re-running produces the same 6-month history (mulberry32).
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260101);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (lo, hi) => lo + rand() * (hi - lo);
const int = (lo, hi) => Math.round(between(lo, hi));
const days = (n) => n * 24 * 60 * 60 * 1000;

const GRADE_RATE = { awwal: '17500', doem: '12500', khangar: '9500' }; // Rs per 1000, seed price list
const PIECE_RATE = { pathera: '2738', bharai: '1800', nikasi: '1900' }; // Rs per 1000, notified-minimum-based
const SECTION_COUNT = 28;
const CYCLE_DAYS = 16; // load -> preheat -> fire -> cool -> unload, roughly

async function main() {
  const db = await connect();
  const { tenantId, kilnId } = await seed(db);
  const scope = { tenantId, kilnId };

  console.log('Clearing prior seeded history for this kiln...');
  const histCollections = [
    'workers', 'teams', 'jamadars', 'kilnSections', 'mouldingBatches', 'sectionLoads',
    'firingLogs', 'unloadings', 'ledgerEntries', 'salesOrders', 'invoices', 'payments',
    'expenses', 'grns', 'customers', 'settings', 'auditLog',
  ];
  for (const c of histCollections) await db.collection(c).deleteMany(scope);

  // --- Reference data -------------------------------------------------
  const passwordHash = await bcrypt.hash('owner123', 10);
  const jamadarId = new ObjectId();
  await db.collection('jamadars').insertOne({
    _id: jamadarId, ...scope, name: 'Rehmat Jamadar', cnic: '3120199990001', commissionPer1000: '150',
  });

  const teamDefs = [
    { key: 'pathera1', category: 'pathera', label: 'Pathera Team A', size: 4 },
    { key: 'pathera2', category: 'pathera', label: 'Pathera Team B', size: 3 },
    { key: 'pathera3', category: 'pathera', label: 'Pathera Team C', size: 4 },
    { key: 'bharai1', category: 'bharai', label: 'Bharai Team A', size: 5 },
    { key: 'bharai2', category: 'bharai', label: 'Bharai Team B', size: 4 },
    { key: 'nikasi1', category: 'nikasi', label: 'Nikasi Team A', size: 5 },
    { key: 'nikasi2', category: 'nikasi', label: 'Nikasi Team B', size: 4 },
    { key: 'jalaiA', category: 'jalai', label: 'Jalai Shift Day', size: 2 },
    { key: 'jalaiB', category: 'jalai', label: 'Jalai Shift Night', size: 2 },
  ];

  const teams = {};
  const workers = {}; // teamKey -> [workerIds]
  let cnicSeq = 3120200000000;
  const names = ['Akram', 'Bashir', 'Chiragh', 'Dilawar', 'Ehsan', 'Fazal', 'Ghulam', 'Hameed', 'Iqbal', 'Javed',
    'Karam', 'Liaqat', 'Munir', 'Nazir', 'Owais', 'Pervaiz', 'Qasim', 'Rasheed', 'Sarwar', 'Tariq'];
  let nameIdx = 0;

  for (const t of teamDefs) {
    const teamId = new ObjectId();
    teams[t.key] = teamId;
    workers[t.key] = [];
    for (let i = 0; i < t.size; i++) {
      const workerId = new ObjectId();
      const dob = new Date(1975 + int(0, 20), int(0, 11), int(1, 28));
      await db.collection('workers').insertOne({
        _id: workerId, ...scope, name: `${names[nameIdx++ % names.length]} ${t.label.split(' ')[0]}`,
        cnic: String(cnicSeq++), dob, category: t.category, teamId: String(teamId),
        jamadarId: t.category === 'pathera' ? String(jamadarId) : null,
        contractSigned: true, signedDocUrl: 'seed-placeholder', status: 'active', createdAt: new Date(),
      });
      workers[t.key].push(workerId);
    }
    await db.collection('teams').insertOne({
      _id: teamId, ...scope, category: t.category, label: t.label, memberIds: workers[t.key].map(String), splitRule: 'equal',
    });
  }
  for (let i = 1; i <= SECTION_COUNT; i++) {
    await db.collection('kilnSections').insertOne({ ...scope, index: i, capacity: 4000, state: 'Empty', currentLoad: 0 });
  }
  const customerId = new ObjectId();
  await db.collection('customers').insertOne({ _id: customerId, ...scope, name: 'Al-Rehman Construction', type: 'registered', creditLimit: '500000' });
  const cashCustomerId = new ObjectId();
  await db.collection('customers').insertOne({ _id: cashCustomerId, ...scope, name: 'Walk-in cash buyer', type: 'individual', creditLimit: '0' });

  // --- Simulation state -------------------------------------------------
  const START = new Date();
  START.setDate(START.getDate() - 182); // ~6 months back
  const TODAY = new Date();

  let greenStock = 0;
  let firedStock = { awwal: 0, doem: 0, khangar: 0, broken: 0 };
  const sections = Array.from({ length: SECTION_COUNT }, (_, i) => ({ index: i + 1, state: 'Empty', loadedAt: null }));
  let cursor = 0; // which section is next to load

  async function credit(session, partyId, account, amountRs, type, sourceRef, clientUuid) {
    await postEntry(db, session, { sub: 'seed', ...scope }, {
      partyType: 'worker', partyId: String(partyId), account, type, debit: amountRs, sourceRef, clientUuid,
    });
  }
  async function debit(session, partyId, account, amountRs, type, sourceRef, clientUuid) {
    await postEntry(db, session, { sub: 'seed', ...scope }, {
      partyType: 'worker', partyId: String(partyId), account, type, credit: amountRs, sourceRef, clientUuid,
    });
  }

  let uuidSeq = 0;
  const nextUuid = () => `seed-${(uuidSeq++).toString(36)}-${rand().toString(36).slice(2, 8)}`;

  // Tracks each worker's running peshgi balance so seeded recoveries never
  // exceed what's actually outstanding (a real recovery can't go negative).
  const peshgiBalance = {};
  const advance = async (session, w, amountRs, type, ref) => {
    const key = String(w);
    peshgiBalance[key] = (peshgiBalance[key] || 0) + Number(amountRs);
    await credit(session, w, 'peshgi', amountRs, type, ref, nextUuid());
  };
  const recover = async (session, w, amountRs, type, ref) => {
    const key = String(w);
    const outstanding = peshgiBalance[key] || 0;
    const amt = Math.min(Number(amountRs), outstanding);
    if (amt <= 0) return;
    peshgiBalance[key] = outstanding - amt;
    await debit(session, w, 'peshgi', amt.toFixed(2), type, ref, nextUuid());
  };

  let dayCount = 0;
  for (let t = START.getTime(); t <= TODAY.getTime(); t += days(1)) {
    const date = new Date(t);
    const dow = date.getDay(); // 0 = Sunday
    dayCount++;

    await withTransaction(db, async (session) => {
      // Moulding (skip occasional rain days)
      const rainDay = rand() < 0.06;
      for (const key of ['pathera1', 'pathera2', 'pathera3']) {
        const teamId = teams[key];
        const count = int(1600, 2400);
        const kharaba = rainDay ? Math.round(count * between(0.05, 0.18)) : Math.round(count * between(0, 0.02));
        const net = count - kharaba;
        greenStock += net;
        await db.collection('mouldingBatches').insertOne({
          ...scope, teamId: String(teamId), date, count, kharaba, netCount: net, status: 'drying',
        });
        const gross = (net / 1000) * Number(PIECE_RATE.pathera);
        for (const w of workers[key]) await credit(session, w, 'earnings', (gross / workers[key].length).toFixed(2), 'moulding_credit', 'mouldingBatch', nextUuid());
      }

      // Loading: once a week move dried green stock into the next empty section
      if (dow === 1 && greenStock > 3000) {
        const sec = sections[cursor % SECTION_COUNT];
        if (sec.state === 'Empty') {
          const loadCount = Math.min(greenStock, int(60000, 90000));
          greenStock -= loadCount;
          sec.state = 'Firing'; // simplified: skip Loading/Preheating states for the seed
          sec.loadedAt = date;
          sec.unloadAt = new Date(t + days(CYCLE_DAYS));
          sec.loadCount = loadCount;
          await db.collection('sectionLoads').insertOne({ ...scope, sectionIndex: sec.index, count: loadCount, bharaiTeamId: String(teams.bharai1), date });
          const gross = (loadCount / 1000) * Number(PIECE_RATE.bharai);
          for (const w of workers.bharai1) await credit(session, w, 'earnings', (gross / workers.bharai1.length).toFixed(2), 'loading_credit', 'sectionLoad', nextUuid());
          cursor++;
        }
      }

      // Firing: every section currently "Firing" burns coal today
      const firingSections = sections.filter((s) => s.state === 'Firing');
      for (const shiftKey of ['jalaiA', 'jalaiB']) {
        if (!firingSections.length) continue;
        const coalKg = int(1800, 2600) * firingSections.length / Math.max(1, firingSections.length);
        const fanOn = rand() > 0.03;
        await db.collection('firingLogs').insertOne({
          ...scope, shift: shiftKey === 'jalaiA' ? 'day' : 'night', date, coalKg: int(1700, 2400),
          tempC: int(950, 1080), fanOn, genHours: fanOn ? 0 : int(2, 6),
        });
        const dailyWage = 1200;
        for (const w of workers[shiftKey]) await credit(session, w, 'earnings', dailyWage.toFixed(2), 'shift_credit', 'firingLog', nextUuid());
      }

      // Unloading: sections whose cycle finished today
      for (const sec of sections) {
        if (sec.state === 'Firing' && sec.unloadAt && sec.unloadAt <= date) {
          const total = sec.loadCount;
          const awwalPct = between(0.85, 0.91);
          const doemPct = between(0.06, 0.1);
          const khangarPct = between(0.02, 0.04);
          const grades = {
            awwal: Math.round(total * awwalPct),
            doem: Math.round(total * doemPct),
            khangar: Math.round(total * khangarPct),
          };
          grades.broken = Math.max(0, total - grades.awwal - grades.doem - grades.khangar);
          firedStock.awwal += grades.awwal; firedStock.doem += grades.doem;
          firedStock.khangar += grades.khangar; firedStock.broken += grades.broken;
          await db.collection('unloadings').insertOne({
            ...scope, sectionIndex: sec.index, nikasiTeamId: String(teams.nikasi1), date, ...grades,
          });
          const nikasiGross = (total / 1000) * Number(PIECE_RATE.nikasi);
          for (const w of workers.nikasi1) await credit(session, w, 'earnings', (nikasiGross / workers.nikasi1.length).toFixed(2), 'unloading_credit', 'unloading', nextUuid());
          sec.state = 'Empty'; sec.loadCount = 0; sec.unloadAt = null;
        }
      }

      // Weekly recovery against peshgi, Saturday: 25% of each worker's earnings credited
      // this week is recovered against any outstanding advance (capped at what they have coming).
      if (dow === 6) {
        for (const key of Object.keys(workers)) {
          for (const w of workers[key]) {
            if (rand() < 0.5) continue; // not every worker gets recovery attention this week
            await recover(session, w, int(500, 4000), 'recovery', 'weekly-kharchi');
          }
        }
      }

      // Occasional peshgi advance (about twice a week across the whole workforce)
      if (rand() < 0.28) {
        const key = pick(Object.keys(workers));
        const w = pick(workers[key]);
        await advance(session, w, int(3000, 20000), 'advance', 'seed-advance');
      }

      // GRN (coal/soil) roughly every 9 days, and a diesel expense weekly
      if (dayCount % 9 === 0) {
        const qtyT = between(8, 14);
        const rate = int(28000, 34000);
        await db.collection('grns').insertOne({
          ...scope, supplierId: 'coal-supplier-1', vehicleNo: `TLA-${int(100, 999)}`, qty: qtyT.toFixed(2),
          rate: String(rate), freight: String(int(3000, 6000)), date,
          landedUnitCost: String(rate + int(300, 600)),
        });
        await db.collection('expenses').insertOne({ ...scope, category: 'coal', amount: (qtyT * rate).toFixed(2), payee: 'coal-supplier-1', date });
      }
      if (dow === 3) {
        await db.collection('expenses').insertOne({ ...scope, category: 'diesel', amount: String(int(4000, 9000)), payee: 'generator', date });
      }

      // Sales: sell from fired stock every few days
      if (rand() < 0.35 && (firedStock.awwal + firedStock.doem + firedStock.khangar) > 5000) {
        const grade = pick(['awwal', 'doem', 'khangar']);
        const qty = Math.min(firedStock[grade], int(3000, 12000));
        firedStock[grade] -= qty;
        const rate = GRADE_RATE[grade];
        const amount = ((qty / 1000) * Number(rate)).toFixed(2);
        const customer = rand() < 0.4 ? customerId : cashCustomerId;
        const invoiceId = new ObjectId();
        const taxPct = customer.equals(customerId) ? 0.03 : 0;
        const tax = (Number(amount) * taxPct).toFixed(2);
        await db.collection('invoices').insertOne({
          _id: invoiceId, ...scope, customerId: String(customer), grade, qty, rate, amount, tax: String(tax), date, status: 'open',
        });
        // most cash customers pay immediately; registered buyers run udhaar
        if (customer.equals(cashCustomerId) || rand() < 0.6) {
          const paid = customer.equals(cashCustomerId) ? amount : (Number(amount) * between(0.4, 1)).toFixed(2);
          await db.collection('payments').insertOne({
            ...scope, direction: 'in', partyId: String(customer), amount: paid, mode: 'cash', date, allocations: [String(invoiceId)],
          });
        }
      }
    });

    if (dayCount % 30 === 0) console.log(`  seeded day ${dayCount} (${date.toISOString().slice(0, 10)})`);
  }

  console.log(`Done. Simulated ${dayCount} operating days from ${START.toISOString().slice(0, 10)} to ${TODAY.toISOString().slice(0, 10)}.`);
  console.log(`Final green stock: ${greenStock}, fired stock:`, firedStock);
  await close();
}

main().catch((e) => { console.error(e); process.exit(1); });
