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
    ['coal', 'Coal', 'کوئلہ'], ['soil', 'Soil', 'مٹی'], ['diesel', 'Diesel', 'ڈیزل'], ['spare', 'Spare part', 'پرزہ جات'],
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
  name: z.string().min(2),
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

export const advanceInput = z.object({
  workerId: z.string(),
  amount: moneyString,
  overrideReason: z.string().min(3).optional(),
  clientUuid: z.string().uuid(),
});

export const recoveryInput = z.object({
  workerId: z.string(),
  amount: moneyString,
  clientUuid: z.string().uuid(),
});

export const SETTING_KEYS = [
  'peshgiLimit', 'munshiAdvanceLimit', 'recoveryPct', 'kharchiFloor',
  'ratePathera', 'rateBharai', 'rateNikasi', 'rateJalai', 'priceAwwal', 'priceDoem', 'priceKhangar',
  'allowNegativeStock',
];

export const settingInput = z.object({
  key: z.enum(SETTING_KEYS),
  value: z.union([z.string(), z.number()]).transform(String),
  effectiveFrom: z.coerce.date().optional(),
});

// Defaults only seed the settings table; the owner can edit every value.
// rate* = Rs per 1,000 pieces for piece-work categories; price* = Rs per 1,000 bricks sold.
export const SETTING_DEFAULTS = {
  peshgiLimit: '50000',
  munshiAdvanceLimit: '10000',
  recoveryPct: '25',
  kharchiFloor: '5000',
  ratePathera: '2738',
  rateBharai: '1800',
  rateNikasi: '1900',
  rateJalai: '1200', // Rs per shift (day/night), not per 1,000 — firemen are paid by shift, not piece-rate
  priceAwwal: '17500',
  priceDoem: '12500',
  priceKhangar: '9500',
  // '0' = refuse to load more green bricks than exist, or fire with no coal in stock.
  // '1' = allow it (a real kiln sometimes runs ahead of its own stock records on paper).
  allowNegativeStock: '0',
};

const positiveInt = z.coerce.number().int().positive();
const nonNegInt = z.coerce.number().int().nonnegative();

export const GRADES = ['awwal', 'doem', 'khangar', 'broken'];
export const KILN_STATES = ['Empty', 'Loading', 'Preheating', 'Firing', 'Cooling', 'Unloading'];

export const mouldingInput = z.object({
  teamId: z.string(),
  count: positiveInt,
  kharaba: nonNegInt.default(0),
  clientUuid: z.string().uuid(),
});

export const sectionLoadInput = z.object({
  sectionIndex: positiveInt,
  teamId: z.string(),
  count: positiveInt,
  clientUuid: z.string().uuid(),
});

export const fireAdvanceInput = z.object({
  clientUuid: z.string().uuid(),
});

export const firingLogInput = z.object({
  shift: z.enum(['day', 'night']),
  teamId: z.string(),
  coalKg: positiveInt,
  tempC: z.coerce.number().int().min(0).max(2000),
  fanOn: z.boolean(),
  genHours: z.coerce.number().min(0).max(24).default(0),
  clientUuid: z.string().uuid(),
});

export const unloadStartInput = z.object({
  sectionIndex: positiveInt,
  teamId: z.string(),
  clientUuid: z.string().uuid(),
});

export const unloadCompleteInput = z.object({
  sectionIndex: positiveInt,
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
  customerId: z.string(),
  grade: z.enum(['awwal', 'doem', 'khangar']),
  qty: positiveInt,
  rate: moneyString.optional(), // defaults to the grade's price-list setting if omitted
  taxPct: z.coerce.number().min(0).max(100).default(0),
  clientUuid: z.string().uuid(),
});

export const paymentInput = z.object({
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
  item: z.string().min(1),
  supplierName: z.string().min(2),
  vehicleNo: z.string().optional(),
  qty: z.coerce.number().positive(), // tonnes for coal/soil, litres for diesel
  rate: moneyString, // per tonne / per litre
  freight: moneyString.optional(),
  labFields: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  clientUuid: z.string().uuid(),
});
