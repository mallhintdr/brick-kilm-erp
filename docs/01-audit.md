# Phase 1 — Audit

Date: 2026-10-12. Scope: `/apps`, `/packages` (current system), `/repo1`–`/repo5` (reference repos), `/screenshot` (31 PNGs + 1 PDF of a live competitor product, "Digital Munshi", at `a-b-digitalmunshi.pk`).

## a) Current system audit

Source: `apps/api/src/*.js`, `apps/pwa/src/**`, `packages/shared/src/index.js`, `apps/api/test/ledger.test.js`.

### Modules and schemas

| Domain | Collections | Where |
|---|---|---|
| Setup | `tenants`, `kilns`, `kilnSections`, `teams`, `types` | `apps/api/src/seed.js`, `apps/api/src/types.js` |
| Labour | `workers`, `ledgerEntries` (`account`: `peshgi`\|`earnings`) | `apps/api/src/app.js` |
| Production | `mouldingBatches`, `sectionLoads`, `firingLogs`, `unloadings`, `fireAdvances` | `apps/api/src/production.js` |
| Procurement | `grns`, `expenses` | `apps/api/src/production.js` |
| Sales | `customers`, `invoices`, `payments` | `apps/api/src/production.js` |
| System | `users`, `settings`, `auditLog` | `apps/api/src/app.js`, `apps/api/src/core.js` |

Every document carries `tenantId`/`kilnId`; `scope(user)` (`apps/api/src/core.js:8`) injects both into every query, so the multi-tenant isolation pattern is structurally in place.

### Strengths already present

- **Money handling already matches the brief's own requirement** (`docs` instructions ask for "integers in paisa, no float errors"): `packages/shared/src/index.js` `toPaisa`/`fromPaisa` do exact BigInt paisa arithmetic; MongoDB stores `Decimal128` (`apps/api/src/core.js:4`). This is stronger than repo2's schema, which stores money as SQLite `REAL` (float) — **do not copy that part of repo2**.
- **Append-only ledger with reversals**, never edits (`apps/api/src/core.js:27-58`), matches Paper A/B's non-negotiable design and is unit-tested (`apps/api/test/ledger.test.js`, 8 passing tests).
- **Owner-editable "types"** (`apps/api/src/types.js`) generalise worker categories, purchase items, customer types and payment modes into one lookup-list mechanism with built-in/custom distinction — more general than any of the 5 repos' hard-coded enums.
- Urdu+English i18n with RTL (`apps/pwa/src/i18n.js`, `apps/pwa/src/styles.css`) and an offline outbox (`apps/pwa/src/api.js:15-39`, Dexie) are both already started, which the repos mostly lack (repo2 plans Urdu as "Future").

### Gaps and risks found

| # | Issue | File | Severity |
|---|---|---|---|
| 1 | **Multi-tenant login bug**: `/auth/login` looks up `{ username }` globally when `tenantId` is omitted (`apps/api/src/app.js:42-46`). With one tenant this is fine; the moment a second kiln/tenant is onboarded, usernames collide across tenants and a user could log into the wrong tenant if usernames match. | `apps/api/src/app.js:42` | High (blocks SaaS multi-tenant goal) |
| 2 | No RBAC permission matrix. Roles are a fixed 5-value enum checked per-route (`auth('owner','munshi',...)` calls scattered through `app.js`/`production.js`). The competitor screenshots show a full module×(view/add/edit/delete) permission grid per user (`screencapture...users-21_09_35.png`). Current system cannot express "munshi can add Daily Khata but not delete" without a code change. | `apps/api/src/app.js` (every route) | Medium |
| 3 | No audit log **screen** — `auditLog` is written (`apps/api/src/core.js:10-15`) but nothing in `apps/pwa` reads it. Competitor has a full Audit Logs page with IP/location (`screencapture...audit-logs...png`). | missing | Medium |
| 4 | No GIS/Leaflet anything, despite the original design doc (`brick kiln.md`) specifying it for yards/clay pits/delivery points. Not present in the competitor screenshots either — **de-risked**: not table stakes for this market, can stay Phase 2/3. | missing | Low |
| 5 | No PDF/Excel export anywhere in the PWA. Competitor has PDF buttons on nearly every screen (Labor Register, Staff Salary Khata, Brick Stock Report, System Settings branding for "perchi" receipts). | missing | High (sales-blocking: owners expect printable Urdu slips) |
| 6 | Inventory is informational only — no block on loading more green bricks than exist, or firing with no coal (flagged honestly to the user already in a prior session, `apps/api/src/production.js` has no stock-guard). | `apps/api/src/production.js` | Medium |
| 7 | Sales model has no delivery challan, vehicle/driver, or receivables-aging report — competitor's "Party Receivable Report" (`screencapture...08_17.png`... actually `07_38.png`) buckets receivable vs payable live; current system only computes a flat `receivablesOutstanding` number in `/insights/summary`. | `apps/api/src/production.js` (`/invoices`, `/payments`) | Medium |
| 8 | Piece rates are flat per category (`ratePathera`, `rateBharai`, `rateNikasi` settings keys) with no effective-dating beyond the generic `settings` versioning, and firing wage is a **hard-coded** `'1200'` placeholder (`apps/api/src/production.js:139`, comment admits it: "TODO: move to a per-category rate plan"). | `apps/api/src/production.js:139` | Medium |
| 9 | No EOBI/PESSI fields, no child-labour red-flag beyond the age-14 gate, no contract PDF generation, no minimum-wage redline against the Punjab notified rate. Section 3 of `brick kiln.md` (the original design doc) specified these; none are built. | missing | High (legal/compliance exposure for the owner) |
| 10 | Zero frontend tests; 8 backend tests cover only the ledger/types/delete module. No tests for production routes (moulding/firing/unloading/kiln-board state machine), sales, or settings. | `apps/api/test/` | Medium |
| 11 | JWT secret falls back to a hard-coded dev string (`apps/api/src/app.js:17` `'dev-secret-change-me'`) with no startup check that a real secret is set in production. No refresh tokens, no rate limiting on `/auth/login`, no account lockout. | `apps/api/src/app.js:17` | High (must fix before any public deployment) |
| 12 | `cors()` called with no options (`apps/api/src/app.js:21`) — allows any origin. Fine for localhost dev, unsafe as shipped. | `apps/api/src/app.js:21` | Medium |
| 13 | Single 300-line `production.js` file holding kiln-board + moulding + firing + sales + inventory + activity feed. Works, but will get harder to navigate as sales/purchase grow — worth splitting before Phase 2 build-out. | `apps/api/src/production.js` | Low (tech debt, not a bug) |
| 14 | No real `vite-plugin-pwa` / service-worker shell caching despite the PWA name — `apps/pwa/vite.config.js` has no PWA plugin. The Dexie outbox queues **writes**, but a true offline app shell (so the UI itself loads with no network) is not configured. | `apps/pwa/vite.config.js` | Medium |

### Module ratings (1 = weak/missing, 5 = production-ready)

| Module | Rating | Why |
|---|---|---|
| Ledger engine (append-only, reversals, paisa money) | 4 | Correct, tested, matches brief's money rule. Docked 1 for no reconciliation/export view. |
| Worker & compliance gate (CNIC/age/contract) | 4 | Solid gate logic, tested. No EOBI/PESSI, no contract PDF. |
| Types (owner-editable lookups) | 4 | General, tested, audit-logged. Only 4 kinds wired so far (not grades/ratePlans). |
| Kiln board / production state machine | 3 | Correct transitions, tested manually end-to-end. No capacity/stock guard, flat wages. |
| Inventory | 2 | Derived correctly but purely informational; no raw-material breadth (wood/sawdust). |
| Sales | 2 | Basic invoice/payment only; no challan, vehicle, aging report, credit-limit enforcement. |
| Settings | 3 | Versioned and editable; no rate-plan-by-date-range, no compliance redline. |
| Insights / reports | 2 | In-app charts only; no PDF/Excel, no season P&L, no worker settlement sheet. |
| Auth / RBAC | 2 | Works for 5 fixed roles; no permission matrix, no lockout, no refresh tokens. |
| Multi-tenancy | 2 | Schema-ready; login bug (#1) and no tenant onboarding UI. |
| GIS / Leaflet | 1 | Not built. Not present in competitor either — low priority. |
| Offline PWA | 3 | Write-outbox works; no app-shell caching, no documented conflict policy beyond dedupe. |
| Compliance (child labour, wages, EOBI) | 2 | Age/CNIC only; the Punjab-specific rules from the original design doc are unbuilt. |
| Testing | 2 | 8 backend tests, 0 frontend, 0 e2e. |
| Code quality / structure | 3 | Clean, consistent, well-commented; one oversized route file; no TypeScript, no lint config found. |

## b) Repo-by-repo

| | repo1 Bahata Bricks Kiln (Tanzeel175) | repo2 brick-kiln-erp (mohsin-rasheedbaga) | repo3 brick-kiln-management-sys (pksvv) | repo4 Smart Brick Kiln (itsom0228) | repo5 Bricks-Management-System (TuheedAfzaal) |
|---|---|---|---|---|---|
| **Purpose** | Desktop ERP for one kiln | Desktop ERP for one kiln, most feature-complete of the five | Looks like a public-facing price/order site, not an ERP | A **sales/marketing site + admin console** for one brick business ("Dipak Sarpane Brick Industries"), not a kiln-floor ERP | Simple PHP ordering/complaint web app for one brick business |
| **Stack** | Python 3 + PySide6 (Qt desktop) + SQLite, layered repositories/services/validators (`repo1/app/`) | Electron 32 + React 18 + TS 5 + Vite + Tailwind + better-sqlite3 | Create-React-App (React 16, 2020-era, unmaintained `react-scripts 3.4.1`) | Java 21 + Spring Boot 3.2.5 + JSP + MySQL 8 + OpenPDF + Apache POI | PHP + MySQL/MariaDB + Bootstrap 4, no framework |
| **Licence** | **None declared** (README explicitly: "No license... if intended to be open source, MIT can be added in future"). Default = all rights reserved. | **MIT** (`repo2/LICENSE`, confirmed in `package.json.license`) | **None declared** (no `license` field, no LICENSE file; CRA boilerplate README) | Not checked — no LICENSE file found; **VERIFY** before reuse | **None declared** by the author (one-line README). The only LICENSE files present belong to bundled third-party assets (Bootstrap 4, an admin theme in `repo5/package/`, SweetAlert2) — **not** a licence for Tuheed Afzaal's own PHP code. |
| **3 best ideas** | 1) Clean layered architecture: `repositories/` → `services/` → `ui/` → `validators/`, directly mirrors good separation-of-concerns we should keep evolving toward. 2) `ledger_service.py` computes opening balance / period transactions / running balance / closing balance generically for *both* customers and labourers from one method — worth mirroring as a single `/ledger` query shape instead of per-module balance endpoints. 3) `SUPPORTED_CATEGORIES` list (Pathera, Bahri Wala, Nakkasi Wala, Jamadar, Pathera Jamadar, Nakkasi Jamadar, Transporter, Driver, Mutfariq Expenses/Income, Cashier, Fixed Assets...) is a more complete real-world chart-of-accounts-style party list than our current `types` seed — good source for expanding `workerCategory`/new `partyType` kind. | 1) **Best data model of the five** — `schema.sql` (832 lines) covers payroll runs with per-worker snapshot items, investor equity/profit-share, cloud-sync state, void (not delete) on every money table with `void_reason`/`voided_by`/`voided_at`. Directly reusable *design*, MIT-licensed so **directly reusable code/SQL** too. 2) `allow_negative_stock` / `allow_overpayment` as **settings flags** rather than hard rules — lets an owner temporarily relax a guard instead of the system just refusing. 3) `custom_permissions` JSON column on `workers` to override role permissions per-worker — cheap way to do the one-off exception without a full permission-matrix UI. | None found of value — the actual application code (`display.js`, `search.js`, `home.js`) is a thin, generic product-display/search page unrelated to kiln operations; looks like a bootcamp exercise reusing a CRA template. | 1) `DatabaseSeeder.java` pattern for deterministic demo data (mirrors our own `seedHistory.js` approach — validates that choice). 2) Apache POI for Excel + OpenPDF for PDF, both mature Java libs — not directly reusable in our Node stack, but confirms "PDF + Excel export" is universally expected (see gap #5 above). 3) i18n via Spring's cookie-based locale interceptor supporting en/hi/mr — validates the multi-language-via-cookie pattern, though it's a consumer storefront, not a kiln-floor tool. | 1) `sale_bricks.php` / `order.php` / `all_order.php` separation shows the minimum viable order-to-sale flow a very small kiln actually wants — useful as a lower bound for MVP scope. 2) Nothing else of technical merit: `admin` table stores a **plaintext or MD5 password** (`pass varchar(32)`, seeded value literally `'admin'`), confirming this is not production-grade. |
| **3 weaknesses** | 1) Desktop-only (PySide6/SQLite) — cannot be the multi-tenant SaaS dashboard the user wants; single-machine, single-kiln by construction. 2) No licence — cannot copy any code into a commercial product without contacting the author. 3) "Status: Active Development", README says structure "may evolve" — not a stable reference. | 1) Also desktop/Electron, single SQLite file — same "not a SaaS dashboard" problem as repo1; would need a full backend rewrite to serve many tenants over the web. 2) Money as SQLite `REAL` (float) — the exact bug class our own system already avoids; do not import this part. 3) Phases 2–10 (sales, kilns/batches, reports, Urdu) are explicitly marked "Future"/"🚧 Next" — the polished part is only auth/RBAC/workers/production, not a finished ERP. | 1) 2020-era CRA, React 16, deprecated `react-scripts` — security-dead dependency tree. 2) No licence. 3) Not actually a kiln ERP in substance. | 1) Architecturally a **marketing website with an admin console**, not a kiln-floor production/labour tool — wrong shape for our use case (no moulding/firing/nikasi, no labour ledger). 2) JSP + server-rendered pages is a much heavier/older stack to adopt than our current MERN choice. 3) Hard-coded demo DB credentials in `application.properties` committed to the repo (`root` / `Python@123`) — a real security smell even as a reference. | 1) No parameterised queries visible in file names like `action.php`/`ajax.php` — high likelihood of SQL injection; do not reuse any PHP. 2) Weak auth (`pass varchar(32)`, seeded plaintext `'admin'`). 3) No licence — and the bundled admin theme in `repo5/package/` may itself be a commercial template whose own licence restricts resale; **VERIFY** before even looking at its markup for inspiration. |
| **Borrow or skip** | **Borrow the ideas** (layered services, generic ledger query, category list). **Skip the code** (no licence). | **Borrow ideas and code** (MIT) — the schema is the single best reference asset found; worth diffing our `packages/shared`/Mongo collections against it table-by-table in Phase 2. Skip the Electron/SQLite shell entirely. | **Skip entirely.** | **Borrow the observation** that PDF+Excel export matters; **skip the code and stack.** | **Skip entirely** — no licence, weak security, not representative of good practice. |

## c) Screenshot inventory

Written to `docs/01-form-inventory.csv` (31 screenshots reviewed; 2 were exact duplicates of others at the same timestamp and excluded). Summary of what the product ("Digital Munshi", bilingual Urdu/English, pink-brick-pattern theme) covers:

**Modules seen:** Account Dashboard (Analytics / Monthly P&L / Bhata Estimation / Balance Summary / Brick Stock Report / Sales Analysis / Labor Ledger / Receivable / Production / Staff Ledger — 10 sub-tabs in one horizontally-scrolling pill bar), Daily Ledger (Rozana Khata), Labor Ledger, Daily Production (Pather/Bharai/Nikasi/Opening Stock/Kiln Cycles — 5 inner tabs), Thursday Ledger (weekly settlement), Sale Ledger, Main Ledger (Parties/Buyers/Carriage/Material/Expenses/Control/Capital — 7 account groups), Salary Ledger, User Management (with a full module×view/add/edit/delete permission grid), Settings (General/Email/Appearance), Audit Logs.

**What's good (worth adopting):**
- A **single master Account Dashboard** with sub-tab navigation across almost every report — our Insights page is one screen; theirs is ten. Our `Activity.jsx` (built earlier this session) is the closest equivalent but less specialised.
- **Thursday Ledger** = exactly the "weekly kharchi settlement" from the original design doc (`brick kiln.md` §7), with per-labourer rate, advance/dasti, paid/naqad, jamadari (commission), and a "Save & Settle" action that posts to account — more complete than our current Peshgi page, which has no weekly batch-settlement UI.
- **Kiln Cycles / Gates** screen: names a batch, type (Bharai/Nikasi/Loss), tracks it through phases — close to our `fireAdvance` but exposed as a first-class named-batch workflow with a loss column, which we don't have.
- **Opening Stock Setup**: explicit manual starting-balance screen for 7 stock items (Field/In-Bhata/Pile kachi, Aawal/Chant/Khinger/Doem/Roara paki) dated "as of Jan 1". Confirms our `GRADES` enum is incomplete — they track 5 fired grades (Aawal, Chant, Khinger, Doem, Roara) vs our 3 configurable (Awwal/Doem/Khangar) plus a flat Broken bucket.
- **Bhata Estimation / reconciliation report**: pick a batch + an expense ledger account, "Generate Recon Report" — a formal bharai→nikasi→sold→stock reconciliation we only approximate via `/inventory/summary`.
- **Party Receivable Report**: one screen, two numbers (Receivable / Payable / Net Position), searchable by party, typed (Receivable/Payable) — simpler and clearer than building this out of raw invoice/payment aggregates as we do now.
- **User Management permission grid** (module × View/Add/Edit/Delete, with a separate "Grant Super Admin Access" override) is exactly gap #2 above — a concrete UI pattern to copy the *shape* of (not the code; screenshots carry no licence and are the user's own competitive research material, not a repo to copy from).
- **Audit Logs page** with totals (logins/unique users/activities/period), filters (user/action/date range/location), and a location/IP column per entry — directly answers gap #3.
- **System Settings → Email Configuration**: toggle "send an email on every delete" — cheap, high-trust feature (owner gets notified the moment a record is deleted) worth adding given our own delete-with-reversal feature from this session.
- Rozana Khata (Daily Ledger) shows **opening cash auto-carried from yesterday's close** plus searchable Aamad/Kharch tables — matches `brick kiln.md` §5.9 (daily close / roznamcha) which our current system has not built as its own screen yet (we only have the ledger entries, not a cash-book view).

**What's clumsy (avoid):**
- Ten-tab horizontally-scrolling pill navigation on the dashboard (`< Summary | Brick Stock Report | Sales Analysis | Labor Ledger | Receivable ... >`) is hard to scan and would be worse on the "cheap Android phone" target device named in the brief — a left-side drawer or a 2-row grid would suit semi-literate munshis better.
- Many screens show "Rs 0" / empty states across the board (this looks like a fresh demo tenant) — can't fully judge real-data layout from these, but the zero-state design itself (large bold "Rs 0" with no guidance on what to do next) is not munshi-friendly; our own empty states (e.g. `Insights.jsx` "No data yet") are closer to adequate but also minimal.
- Settings → Email Configuration exposes "SMTP settings are managed securely via backend system configuration" as a dead-end message with no way to actually configure SMTP from the UI — an incomplete feature shipped visibly.
- "Grant Super Admin Access" is a single toggle that **bypasses the entire granular grid**, shown on the same modal — easy to misclick and over-grant; should probably be a separate, more deliberate action (e.g. require typing the user's name to confirm).

## d) Output

- `docs/01-audit.md` (this file)
- `docs/01-form-inventory.csv`

---

## Questions for Masoom

1. Do you have write access to or ownership confirmation for repo2 (MIT) and intend to actually import code/SQL from it, or only study it? (Changes what I do in Phase 2/4.)
2. Is "Digital Munshi" (the screenshot source) a competitor you're benchmarking against, or a product you have some access/relationship to? This changes how directly we can mirror its screen *names* and *flows* versus just the UX lessons.
3. For repo4 and repo5, since no LICENSE was found, do you want me to just note "no reuse" and move on, or actually email/contact either author to ask? (I'd default to no reuse and move on.)
4. The grade list mismatch (your current system: Awwal/Doem/Khangar + Broken; Digital Munshi: Aawal/Chant/Khinger/Doem/Roara) — which set matches what Sadiqabad-area kilns actually sell? This affects the domain model in Phase 2.
5. Should Phase 2 keep GIS/Leaflet as a documented-but-deferred Phase 3 item, given neither the five repos nor the live competitor product uses it?

## Risks

- **Legal**: repo1, repo3, repo4, repo5 all lack a usable licence. The audit above already avoids recommending code reuse from them — ideas only. repo4's committed DB credentials, if that pattern is ever copied, would itself be a security incident.
- **Compliance**: none of the Punjab labour-law figures (peshgi cap had already been made owner-editable per a standing preference, minimum wage, EOBI/PESSI) are implemented or verified against a current government source anywhere in the current system or the five repos. Flagged for Phase 2's "VERIFY" list, to be checked against Punjab Labour Department / EOBI / PESSI directly, not against any of this code.
- **Security**: items #11 and #12 in the current-system gap table (hard-coded JWT dev secret, open CORS) must not reach a public deployment unchanged.
