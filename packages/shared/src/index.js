import { z } from 'zod';

// Money is handled as integer paisa (BigInt) in code and stored as Decimal128 in MongoDB.
export function toPaisa(value) {
  const s = String(value?.toString?.() ?? value).trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) throw new Error(`Invalid money amount: ${s}`);
  const neg = s.startsWith('-');
  const [r, p = ''] = s.replace('-', '').split('.');
  const paisa = BigInt(r) * 100n + BigInt(p.padEnd(2, '0'));
  return neg ? -paisa : paisa;
}

export function fromPaisa(paisa) {
  const neg = paisa < 0n;
  const abs = neg ? -paisa : paisa;
  const s = `${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
  return neg ? `-${s}` : s;
}

export const moneyString = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), 'Invalid amount')
  .refine((v) => toPaisa(v) > 0n, 'Amount must be positive');

// Like moneyString but allows 0 — needed for per-worker rows in a kharchi run where a
// worker legitimately earned nothing (or is fully owed as kharchi with no recovery) that week.
export const nonNegMoneyString = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), 'Invalid amount')
  .refine((v) => toPaisa(v) >= 0n, 'Amount cannot be negative');

export const ROLES = ['owner', 'accountant', 'munshi', 'mistri', 'viewer'];

// Per-user permission overrides, applied on top of the role defaults below. Covers the
// four modules where fine-grained control matters most (docs/03-architecture.md §3); every
// other route still uses the simpler role-only gate it always has.
export const PERMISSION_MODULES = ['workers', 'peshgi', 'settings', 'types'];
export const PERMISSION_ACTIONS = ['view', 'add', 'edit', 'delete'];

const allOf = (v) => ({ view: v, add: v, edit: v, delete: v });
const viewOnly = () => ({ view: true, add: false, edit: false, delete: false });

// Mirrors the auth(...) role lists already on each route, as of the v1 permission-matrix
// build. Owner always has every permission and bypasses this table entirely.
export const DEFAULT_ROLE_PERMS = {
  owner: { workers: allOf(true), peshgi: allOf(true), settings: allOf(true), types: allOf(true) },
  munshi: {
    workers: { view: true, add: true, edit: true, delete: false },
    peshgi: { view: true, add: true, edit: false, delete: false },
    settings: viewOnly(),
    types: viewOnly(),
  },
  accountant: {
    workers: viewOnly(),
    peshgi: { view: true, add: true, edit: false, delete: true }, // delete here = reverse a ledger entry
    settings: viewOnly(),
    types: viewOnly(),
  },
  mistri: { workers: viewOnly(), peshgi: viewOnly(), settings: viewOnly(), types: viewOnly() },
  viewer: { workers: viewOnly(), peshgi: viewOnly(), settings: viewOnly(), types: viewOnly() },
};

export const userCreateInput = z.object({
  username: z.string().trim().min(2).max(40),
  password: z.string().min(6),
  role: z.enum(ROLES),
  clientUuid: z.string().uuid(),
});

export const userRoleInput = z.object({ role: z.enum(ROLES) });

export const permissionOverrideInput = z.object({
  module: z.enum(PERMISSION_MODULES),
  view: z.boolean().optional(),
  add: z.boolean().optional(),
  edit: z.boolean().optional(),
  delete: z.boolean().optional(),
});

export const WORKER_CATEGORIES = [
  'manager', 'supervisor', 'pathera', 'bharai', 'jalai', 'sealer',
  'nikasi', 'repairer', 'driver', 'jamadar',
];

// Owner-editable "types" (lookup lists). Built-ins seed each tenant; the keys the
// business logic depends on are locked (cannot be deleted), custom ones are free.
export const TYPE_KINDS = ['workerCategory', 'procurementItem', 'customerType', 'paymentMode'];

export const BUILTIN_TYPES = {
  workerCategory: [
    ['manager', 'Manager', 'منشی'], ['supervisor', 'Supervisor', 'مستری'], ['pathera', 'Moulder', 'پتھیرا'],
    ['bharai', 'Loader', 'بھرائی'], ['jalai', 'Fireman', 'جلائی'], ['sealer', 'Sealer', 'کیری والا'],
    ['nikasi', 'Unloader', 'نکاسی'], ['repairer', 'Repairer', 'مرمت'], ['driver', 'Driver', 'ڈرائیور'],
    ['jamadar', 'Jamadar', 'جمعدار'],
  ],
  procurementItem: [
    ['coal', 'Coal', 'کوئلہ'], ['wood', 'Wood', 'لکڑی'], ['diesel', 'Diesel', 'ڈیزل'], ['soil', 'Soil', 'مٹی'],
    ['sand', 'Sand', 'ریت'], ['shopper', 'Shopper', 'شاپر'], ['kalab', 'Kalab', 'کلب'], ['electric', 'Electric goods', 'برقی سامان'],
    ['spare', 'Spare parts', 'پرزہ جات'], ['furniture', 'Office furniture', 'دفتری فرنیچر'], ['cctv', 'CCTV', 'سی سی ٹی وی'],
    ['solar', 'Solar panels', 'سولر پینل'], ['misc', 'Miscellaneous', 'متفرق'],
  ],
  customerType: [['individual', 'Cash buyer', 'نقد گاہک'], ['registered', 'Registered customer', 'رجسٹرڈ گاہک']],
  paymentMode: [['cash', 'Cash', 'نقد'], ['bank', 'Bank', 'بینک'], ['jazzcash', 'JazzCash', 'جیز کیش']],
};

export const typeInput = z.object({
  kind: z.enum(TYPE_KINDS),
  key: z.string().regex(/^[a-z0-9_]{2,30}$/, 'Key: 2-30 lowercase letters, digits or _').optional(),
  label: z.string().min(1).max(60),
  labelUr: z.string().max(60).optional(),
});

export const typeUpdate = z.object({
  label: z.string().min(1).max(60).optional(),
  labelUr: z.string().max(60).optional(),
  active: z.boolean().optional(),
});

export const MIN_WORKER_AGE = 14;
export const RECOMMENDED_WORKER_AGE = 15;

export function ageOn(dob, on = new Date()) {
  const d = new Date(dob);
  let age = on.getFullYear() - d.getFullYear();
  const m = on.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && on.getDate() < d.getDate())) age--;
  return age;
}

const cnic = z.string().regex(/^\d{5}-?\d{7}-?\d$/, 'CNIC/Form-B must be 13 digits');

export const workerInput = z.object({
  // piece-work terms agreed with this worker (blank = the kiln's standard rate / cut)
  ratePerThousand: nonNegMoneyString.optional(),
  cutPerThousand: nonNegMoneyString.optional(),
  openingPeshgi: nonNegMoneyString.optional(), // advance already given when they join
  dailyBricks: z.coerce.number().int().min(0).max(1000000).optional(), // bricks per day agreed with the worker
  reference: z.string().trim().max(100).optional(), // who brought them: jamadar or reference person
  name: z.string().min(2),
  fatherName: z.string().trim().min(2), // tells apart workers who share a common name
  cnic,
  dob: z.coerce.date(),
  category: z.string().min(1), // validated against the owner-editable workerCategory types on the server
  phone: z.string().optional(),
  teamId: z.string().optional(),
  familyId: z.string().optional(),
  jamadarId: z.string().optional(),
  eobiNo: z.string().optional(),
  pessiNo: z.string().optional(),
  peshgiLimit: moneyString.optional(), // optional per-worker override of the kiln default
  clientUuid: z.string().uuid().optional(),
});

const workDate = z.coerce.date().refine((d) => d.getTime() <= Date.now() + 24 * 60 * 60 * 1000, 'Date cannot be in the future');

export const advanceInput = z.object({
  date: workDate.optional(), // back-dated entry; defaults to now
  workerId: z.string(),
  amount: moneyString,
  overrideReason: z.string().min(3).optional(),
  clientUuid: z.string().uuid(),
});

export const recoveryInput = z.object({
  date: workDate.optional(), // back-dated entry; defaults to now
  workerId: z.string(),
  amount: moneyString,
  clientUuid: z.string().uuid(),
});

export const SETTING_KEYS = [
  'peshgiLimit', 'munshiAdvanceLimit', 'recoveryPct', 'kharchiFloor',
  'ratePathera', 'rateBharai', 'rateNikasi', 'rateJalai', 'priceAwwal', 'priceDoem', 'priceKhangar',
  'allowNegativeStock', 'kilnUnit', 'kilnLineCount',
  'cutPathera', 'cutBharai', 'cutNikasi',
  'kilnLat', 'kilnLon', 'kilnPlace', 'hotLines', 'lockedUntil', 'govRatePathera', 'govRateBharai', 'govRateNikasi', 'govRateCheck',
];

export const settingInput = z.object({
  key: z.enum(SETTING_KEYS),
  value: z.union([z.string(), z.number()]).transform(String),
  effectiveFrom: z.coerce.date().optional(),
});

// Defaults only seed the settings table; the owner can edit every value.
// rate* = Rs per 1,000 pieces for piece-work categories; price* = Rs per 1,000 bricks sold.
export const SETTING_DEFAULTS = {
  lockedUntil: '', // days up to and including this date are closed: only the owner can add or change entries
  peshgiLimit: '50000',
  munshiAdvanceLimit: '10000',
  recoveryPct: '25',
  kharchiFloor: '5000',
  ratePathera: '1400', // Rs per 1,000 kachi bricks moulded
  rateBharai: '510', // Rs per 1,000 kachi bricks loaded into the kiln
  rateNikasi: '250', // Rs per 1,000 fired bricks unloaded (awwal, doem, khangar alike)
  // Peshgi cut taken from each week's wages, Rs per 1,000 bricks (a worker can have their own)
  cutPathera: '400',
  cutBharai: '50',
  cutNikasi: '0',
  // kiln location for the weather advisory, set by the owner (decimal degrees)
  hotLines: '30', // lines behind the fire still too hot for nikasi
  kilnLat: '',
  kilnLon: '',
  kilnPlace: '',
  rateJalai: '1200', // Rs per shift (day/night), not per 1,000 — firemen are paid by shift, not piece-rate
  priceAwwal: '17500',
  priceDoem: '12500',
  priceKhangar: '9500',
  // '0' = refuse to load more green bricks than exist, or fire with no coal in stock.
  // '1' = allow it (a real kiln sometimes runs ahead of its own stock records on paper).
  allowNegativeStock: '0',
  // How this kiln counts bharai, firing and nikasi: 'chamber' (the chamber board) or 'line'.
  kilnUnit: 'line',
  kilnLineCount: '240', // lines in the kiln, split evenly between its two sides
};

const positiveInt = z.coerce.number().int().positive();
const nonNegInt = z.coerce.number().int().nonnegative();

export const GRADES = ['awwal', 'doem', 'khangar', 'broken'];
export const KILN_STATES = ['Empty', 'Loading', 'Preheating', 'Firing', 'Cooling', 'Unloading'];

// A work date (YYYY-MM-DD) lets a whole week be entered at once; it can't be in the future.

export const mouldingInput = z.object({
  teamId: z.string().optional(),
  workerId: z.string().optional(), // a moulder picked by name: their own one-person team is used
  count: positiveInt,
  kharaba: nonNegInt.default(0),
  deductionPct: z.coerce.number().min(0).max(25).default(0), // breakage (tot phot) cut, usually 2%
  quality: z.enum(['poor', 'satisfactory', 'good']).optional(),
  date: workDate.optional(),
  clientUuid: z.string().uuid(),
}).refine((b) => b.teamId || b.workerId, { message: 'Choose a moulder or a team' });

// Owner/permitted edits. Fields are optional: only what's sent is changed.
export const mouldingUpdate = z.object({ count: positiveInt.optional(), kharaba: nonNegInt.optional(), date: workDate.optional() });
export const firingUpdate = z.object({
  shift: z.enum(['day', 'night']).optional(),
  coalKg: positiveInt.optional(),
  tempC: z.coerce.number().int().min(0).max(2000).optional(),
  fanOn: z.boolean().optional(),
  genHours: z.coerce.number().min(0).max(24).optional(),
});
export const workerUpdate = z.object({
  reference: z.string().trim().max(100).optional(),
  ratePerThousand: z.union([nonNegMoneyString, z.literal('')]).optional(),
  dailyBricks: z.union([z.coerce.number().int().min(0).max(1000000), z.literal('')]).optional(),
  cutPerThousand: z.union([nonNegMoneyString, z.literal('')]).optional(),
  name: z.string().min(2).optional(),
  fatherName: z.string().trim().min(2).optional(),
  category: z.string().min(1).optional(),
  phone: z.string().optional(),
  eobiNo: z.string().optional(),
  pessiNo: z.string().optional(),
});
export const customerUpdate = z.object({ name: z.string().min(2).optional(), type: z.string().min(1).optional(), phone: z.string().optional() });
export const grnUpdate = z.object({
  supplierName: z.string().min(2).optional(),
  vehicleNo: z.string().optional(),
  qty: z.coerce.number().positive().optional(),
  rate: moneyString.optional(),
  freight: nonNegMoneyString.optional(),
});
export const invoiceUpdate = z.object({ qty: positiveInt.optional(), rate: moneyString.optional(), taxPct: z.coerce.number().min(0).max(100).optional() });
export const paymentUpdate = z.object({ amount: moneyString.optional(), mode: z.string().min(1).optional() });
export const expenseUpdate = z.object({ amount: moneyString.optional(), payee: z.string().trim().min(1).optional() });
export const advanceUpdate = z.object({ amount: moneyString });

export const sectionLoadInput = z.object({
  sectionIndex: positiveInt,
  teamId: z.string().optional(),
  workerId: z.string().optional(), // a loader picked by name: their own one-person team is used
  date: workDate.optional(), // day the bharai was done (back-dating allowed)
  count: positiveInt,
  clientUuid: z.string().uuid(),
});

// Running notes for one chamber/line's current cycle: coal burnt and what went wrong (and why).
// Cash a worker takes during the week (dasti kharcha), settled against the weekly kharchi.
export const kharchaInput = z.object({
  workerId: z.string(),
  amount: moneyString,
  date: z.coerce.date().refine((d) => d.getTime() <= Date.now() + 24 * 60 * 60 * 1000, 'Date cannot be in the future').optional(),
  note: z.string().max(300).optional(),
  clientUuid: z.string().uuid(),
});

export const kilnNoteInput = z.object({
  coalKg: z.coerce.number().min(0).max(1000000).optional(),
  issues: z.string().max(5000).optional(),
});

export const fireAdvanceInput = z.object({
  unit: z.enum(['chamber', 'line']).default('chamber'),
  steps: z.coerce.number().int().min(1).max(40).default(1), // lines (or chambers) the fire moves on
  at: z.coerce.date().refine((d) => d.getTime() <= Date.now() + 5 * 60 * 1000, 'Date cannot be in the future').optional(), // when the fire moved (back-dated for old records); defaults to now
  clientUuid: z.string().uuid(),
});

export const firingLogInput = z.object({
  shift: z.enum(['day', 'night']),
  teamId: z.string().optional(),
  workerIds: z.array(z.string()).max(20).optional(), // firemen picked by name (one or more)
  coalKg: positiveInt,
  tempC: z.coerce.number().int().min(0).max(2000),
  fanOn: z.boolean().default(true), // zig-zag kilns have no ID fan; kept for older logs
  genHours: z.coerce.number().min(0).max(24).default(0),
  date: workDate.optional(), // day of the shift (back-dating allowed)
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(), // Pakistan time of the reading, HH:MM
  lineIndex: z.coerce.number().int().positive().optional(), // line being fired / preheated
  clientUuid: z.string().uuid(),
});

export const unloadStartInput = z.object({
  sectionIndex: positiveInt,
  teamId: z.string().optional(),
  workerId: z.string().optional(), // an unloader picked by name
  date: workDate.optional(), // day nikasi started
  clientUuid: z.string().uuid(),
});

export const unloadCompleteInput = z.object({
  sectionIndex: positiveInt,
  date: workDate.optional(), // day the nikasi was done
  awwal: nonNegInt,
  doem: nonNegInt,
  khangar: nonNegInt,
  broken: nonNegInt,
  clientUuid: z.string().uuid(),
});

export const customerInput = z.object({
  name: z.string().min(2),
  type: z.string().min(1).default('individual'),
  phone: z.string().optional(),
  creditLimit: moneyString.optional(),
  clientUuid: z.string().uuid(),
});

export const invoiceInput = z.object({
  date: workDate.optional(), // back-dated entry; defaults to now
  customerId: z.string(),
  grade: z.enum(['awwal', 'doem', 'khangar']),
  qty: positiveInt,
  rate: moneyString.optional(), // defaults to the grade's price-list setting if omitted
  taxPct: z.coerce.number().min(0).max(100).default(0),
  // delivery challan: which truck/trolley took the bricks, where, and against which booking
  vehicleNo: z.string().trim().max(30).optional(),
  driver: z.string().trim().max(60).optional(),
  destination: z.string().trim().max(120).optional(),
  freight: z.string().trim().max(60).optional(),
  bookingId: z.string().optional(),
  clientUuid: z.string().uuid(),
});
// advance booking (parchi): customer books bricks now, lifts them over time
export const bookingInput = z.object({
  date: workDate.optional(),
  customerId: z.string(),
  grade: z.enum(['awwal', 'doem', 'khangar']),
  qty: positiveInt,
  rate: moneyString.optional(),
  advance: z.coerce.number().min(0).default(0),
  mode: z.string().optional().default('cash'),
  note: z.string().trim().max(300).optional().default(''),
  clientUuid: z.string().uuid(),
});

export const paymentInput = z.object({
  date: workDate.optional(), // back-dated entry; defaults to now
  invoiceId: z.string(),
  amount: moneyString,
  mode: z.string().min(1).default('cash'),
  clientUuid: z.string().uuid(),
});

export const kharchiProposeInput = z.object({
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  category: z.string().min(1),
});

export const kharchiRunInput = z.object({
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  category: z.string().min(1),
  items: z.array(z.object({
    workerId: z.string(),
    gross: nonNegMoneyString,
    kharchi: nonNegMoneyString,
  })).min(1),
  clientUuid: z.string().uuid(),
});

export const grnInput = z.object({
  date: workDate.optional(), // back-dated entry; defaults to now
  item: z.string().min(1),
  supplierName: z.string().min(2),
  vehicleNo: z.string().optional(),
  description: z.string().max(500).optional(), // what was bought (items other than coal)
  qty: z.coerce.number().positive(), // tonnes for coal/soil, litres for diesel
  rate: moneyString, // per tonne / per litre
  freight: nonNegMoneyString.optional(), // 0 = delivered free
  labFields: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  clientUuid: z.string().uuid(),
});
