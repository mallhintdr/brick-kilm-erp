# Brick Kiln ERP: Implementation Plan

Derived from `brick kiln.md`. Phases follow the doc's roadmap (MVP, Full ERP, Advanced), broken into buildable milestones.

## 0. Assumptions and pre-work (week 0)

- Stack as specified: React PWA (Vite) + Dexie, Node/Express + Zod, MongoDB replica set (Decimal128), Python (FastAPI + APScheduler) for jobs, S3-compatible storage.
- Monorepo: `apps/pwa` (munshi + owner UI, one codebase, role-based routes), `apps/api`, `apps/workers` (Python), `packages/shared` (Zod schemas, money utils, ledger types).
- Answer the open questions in section 12 of the design doc before Milestone 2; they drive rate plans, jamadar handling and tax scope.
- Verify legal figures with a local labour lawyer (peshgi cap Rs 50,000 and its section, current minimum piece rate, age rule). They live in config tables, so wrong values are a data fix, not a code change.
- Printer testing is deferred by the owner; build slips as PDF/HTML print first and add ESC/POS later.
- The peshgi limit is an owner-editable setting (audit-logged), not a fixed Rs 50,000 cap.

## 1. Foundation (weeks 1-3)

| Item | Detail |
| --- | --- |
| Repo, CI, envs | Lint, tests, staging + prod. Mongo replica set (Atlas M10 or self-hosted) |
| Tenancy | `tenantId`/`kilnId`/`seasonId` on every doc; a Mongoose/driver wrapper that injects them into every query so no query can skip the scope |
| Auth and roles | JWT + refresh, roles Owner/Accountant/Munshi/Mistri/Viewer, permission matrix from section 4 enforced server-side |
| Money and ledger core | `Decimal128` helpers; `ledgerEntries` append-only (no update/delete routes, DB user without those rights on the collection); reversal entries; unique index on `clientUuid`; balance = aggregate + snapshot |
| Transaction helper | One function that writes ledger + stock movement + audit log in a single Mongo transaction |
| Audit log | Immutable, every create/reversal/login with device id |
| Settings | Versioned tables: ratePlans, minimum wages, price list, tax rates, thresholds (with `effectiveFrom`) |
| i18n | Urdu RTL + English from the start; Noto Nastaliq font bundled |

Exit: can create a tenant/kiln/season/user, post and reverse a ledger entry in a transaction, and a duplicate `clientUuid` is rejected.

## 2. Phase 1: MVP (weeks 4-11)

Goal: live before the first advance or moulding day.

**M1. Offline sync engine (weeks 4-5)**
- Dexie outbox of events; `POST /sync/push` (idempotent by `clientUuid`, returns confirmed ids and per-event errors), `GET /sync/pull?since=`.
- Cached reference data: workers, teams, rate plans, prices. Rates apply from their effective date.
- Sync badge (green/yellow/red at 24 h), provisional balances flagged yellow.
- Test with airplane-mode scenarios, duplicate pushes, and out-of-order events. Build this before any feature screen, since every later feature rides on it.

**M2. Workers and compliance gates (weeks 5-6)**
- Worker CRUD with photo, CNIC/Form-B, DOB. Reject age under 14 (warn under 15), unique CNIC index.
- Families, teams (split rules), jamadars, categories.
- Rate plans with `notifiedMinimum` and red warning when below.
- Contract PDF (Urdu + English, Python/WeasyPrint), signed-copy upload; pay blocked until `signedDocUrl` exists.
- EOBI/PESSI fields.

**M3. Wage, peshgi, kharchi engine (weeks 6-8)**
- Advance flow: worker cap, family cap, munshi limit; owner override needs reason + second approval.
- Piece-work credits from moulding/loading/unloading events (Phase 1: moulding count entry and manual credit for other categories, until section workflows arrive in Phase 2).
- Weekly kharchi proposal: `max(gross - r*gross, floor)`, recovery shrinks when floor applies. Unit tests on the section 7 worked example (32,856 / 8,214 / 24,642 / 41,786) plus floor edge cases and rounding.
- Team split to members; jamadar commission posted to the jamadar's own ledger.
- Season-end settlement statement and peshgi register (PDF).

**M4. Slips and printing (weeks 8-9)**
- Server-side or client-side Urdu slip rendering to bitmap, ESC/POS raster print over Web Bluetooth, with reprint and PDF fallback. QR code to a read-only public ledger page (signed, unguessable token, rate limited, no CNIC shown).
- Money-effect confirmation card before every save, then auto-print.

**M5. Cash book and basic sales (weeks 9-10)**
- Roznamcha: opening cash, receipts, payments, physical count, variance with mandatory reason.
- Customers, price list, orders, challans, invoices with tax lines by customer type (tax rates table), udhaar and payments.
- Phase 1 stock is simple: fired stock by grade adjusted manually until Phase 2 production flow.

**M6. Owner surface and hardening (weeks 10-11)**
- Owner web dashboard: cash, peshgi outstanding, compliance gaps, dual-approval inbox.
- WhatsApp Cloud API daily summary (template message approval takes time, so submit early; SMS fallback).
- Nightly encrypted backup + restore test, pilot on real data with the munshi, bug bash.

Exit criteria: a full week of simulated kharchi cycles reconciles to the rupee between ledger, slips and cash book; offline day syncs with zero duplicates; printed Urdu slip readable in sunlight.

## 3. Phase 2: Full ERP (first season, ~weeks 12-24)

Ship in this order, each behind a feature flag so the kiln can adopt gradually.

1. **Kiln board and state machine (12-13):** `kilnSections` with Empty→Loading→Preheating→Firing→Cooling→Unloading transitions validated server-side, "Advance fire" daily action, SVG board, configurable section count. Guard against invalid transitions.
2. **Production workflows (13-16):** moulding batches with kharaba, section loads (multi-batch per section), firing logs with shift handover, unloadings by grade. Each posts stock movements + labour credits in one transaction; this replaces Phase 1 manual credits.
3. **Inventory and GRN (15-17):** items, stockMovements, GRN with weighbridge photo, freight, landed cost, optional lab fields, supplier payables.
4. **Section COGS view (17-18):** derived aggregation (do not store), closes on unloading. Cost per saleable brick, coal per 1,000.
5. **Receivables/payables aging, expenses, repair orders (18-20).**
6. **Alerts (fan stop over N minutes → WhatsApp, low cash, NOC expiry, peshgi near cap).** Python scheduler owns these.
7. **Compliance module (20-21):** EPD log and Smog report, EOBI/PESSI monthly report, FBR tax summary, minimum-wage check.
8. **Reports (21-23):** daily/weekly/monthly PDF + Excel via Python; scheduling.
9. **Leaflet map (23-24):** GeoJSON sections, yards, clay pits, delivery pins.

Risk to manage: Phase 2 changes how credits arise. Keep the ledger interface (`sourceRef`) stable so Phase 1 data and Phase 2 data mix cleanly.

## 4. Phase 3: Advanced (season 2+)

- QA sampling by mistri and quality score (traceability with proportional attribution by batch share; nikasi vs sample gap), dispute window, bonus per 1,000.
- Forecasting (coal price, demand, cash flow) in Python from own data.
- Weighbridge and temperature/fan IoT integration (MQTT or HTTP ingest endpoint).
- Multi-kiln reporting, SaaS billing/onboarding, carbon-credit data pack if a programme fits.
- Add Redis or read replicas only if measured load requires it.

## 5. Cross-cutting

| Area | Plan |
| --- | --- |
| Testing | Unit tests for engine and ledger (property tests: balances equal sum of entries; reversals net to zero). Integration tests against a real Mongo replica set. E2E for offline sync. Golden-file tests for slips/PDFs |
| Security | Server-side enforcement of every limit; two-person approvals; rate-limit public QR page; encrypt PII (CNIC) at rest; secrets in env manager |
| Data migration | Import existing worker lists and opening balances as dated opening ledger entries, never as edited balances |
| Observability | Structured logs, Sentry, sync-failure dashboard, backup success alert |
| Training | Urdu video/paper guide, one-week parallel run with the paper register before cutover |
| Ops | Staging mirrors prod; tablet kiosk setup checklist; printer pairing guide |

## 6. Key risks

| Risk | Mitigation |
| --- | --- |
| Web Bluetooth printing unreliable on the chosen tablet/browser | Test hardware in week 0; fallback to a small native wrapper (Capacitor) if needed |
| Sync bugs corrupt trust in balances | Build and stress-test sync first; provisional-balance UI; server is authoritative |
| Legal values wrong or change | All limits in versioned config; lawyer review before go-live |
| Low connectivity at site | Offline-first; nothing blocks on network except approvals (queue them) |
| Munshi adoption | Big-button Urdu UI, photo picking, user testing every milestone |
| Scope creep from the 30-collection model | Build collections only when their milestone starts |
| WhatsApp template approval delay | Submit in week 4; SMS fallback |

## 7. Suggested team and timeline

One full-stack dev (you) plus part-time Python help: MVP in about 11 weeks, Phase 2 across the first season. Adjust if the kiln's start date is earlier; if so, cut M5's invoicing and M6's WhatsApp to a later drop and keep M1-M4 (sync, workers, wage engine, slips) as the non-negotiable core.
