# Phase 3 — Gap Analysis

Consolidates `docs/01-audit.md` findings and `docs/02-domain-model.md` gaps against the module tiers set in `docs/03-architecture.md`. One row per concrete gap; "Fix tier" matches the architecture doc's MVP/v1/v2 split.

| Gap | Exists today? | Source | Fix tier | File(s) to touch |
|---|---|---|---|---|
| Multi-tenant login collision risk | No (bug) | `01-audit.md` gap #1 | **MVP** | `apps/api/src/app.js` (`/auth/login`) |
| Hard-coded JWT dev secret, no startup check | No (risk) | `01-audit.md` gap #11 | **MVP** | `apps/api/src/app.js` |
| Open CORS | No (risk) | `01-audit.md` gap #12 | **MVP** | `apps/api/src/app.js` |
| Mobile bottom-nav (replace pill scroll) | No | this phase | **MVP** | `apps/pwa/src/App.jsx`, `styles.css` |
| Offline app-shell caching | No (only write-outbox exists) | `01-audit.md` gap #14 | **MVP** | `apps/pwa/vite.config.js` |
| Daily cash book (roznamcha) screen | No (ledger data exists) | screenshots (Rozana Khata) | **MVP** | new `apps/pwa/src/pages/CashBook.jsx` + API aggregate |
| Inventory stock guard (block over-issue) | No | `01-audit.md` gap #6 | **MVP** | `apps/api/src/production.js` |
| Audit Logs screen | No (data correct, no UI) | `01-audit.md` gap #3; screenshots | v1 | new page + `/audit-logs` endpoint |
| Weekly kharchi settlement run | No | `02-domain-model.md` §5; screenshots (Thursday Khata) | v1 | new `kharchiRuns` collection, routes, page |
| Family-level peshgi | No | `brick kiln.md`; domain model §5 | v1 | new `families` collection |
| Delivery challans | No | domain model §9 | v1 | new `challans` collection, routes, page |
| Receivables aging report | No (only a flat total) | domain model §9; screenshots (Receivable) | v1 | new `/receivables` endpoint |
| EOBI/PESSI optional fields | No | domain model §6 | v1 | `workerInput` schema + Workers page |
| Bonded-labour alert (soft) | No | domain model §5; brief instruction | v1 | `/insights` extension |
| PDF export (slips, reports) | No | `01-audit.md` gap #5; repo1, repo4, screenshots all have it | v1 | new server-side PDF module |
| Excel export | No | brief instruction | v1 | `exceljs` integration |
| RBAC permission matrix (per-user override) | No (role-only) | `01-audit.md` gap #2; screenshots | v1 | new `permissions` collection + `auth()` extension |
| GRN lab fields UI | No (schema field exists, unused) | domain model §7 | v1 | Inventory page form |
| Per-section COGS breakdown | No (only flat KPIs) | domain model §8 | v1 | `/insights` extension |
| Expense category as `types` kind | No (free string) | domain model §10 | v1 | migration script + Settings/Types UI |
| Season-scoped P&L + season close | No | domain model §3, §10 | v1 | new `seasons` close workflow |
| WhatsApp daily summary | No | `brick kiln.md` §9 | v1 | Python script |
| Rate-plan effective-dating, remove hard-coded firing wage | No (`'1200'` literal) | `01-audit.md` gap #8 | v1 | `apps/api/src/production.js:139` |
| Refresh tokens | No (12h access token only) | architecture §9 | v1 | `apps/api/src/app.js` |
| Rate limiting on login | No | architecture §9 | v1 | `express-rate-limit` |
| Soft deletes for non-money records | No (hard delete, correctly reversal-based for money) | architecture §4 | v1 | `workers`, `customers`, `teams` |
| Nightly backup automation | No (documented, not scripted) | `brick kiln.md` §10 | v1 | Python script |
| Assets + maintenance logs | No | domain model §11, decision #3 | v2 | new collection |
| GIS/Leaflet | No | Phase 1 decision | v2 | deferred |
| QA sampling + quality scores | No | `brick kiln.md` §8 | v2 | deferred |
| Forecasting/cash-flow projection | No | `brick kiln.md` §9 | v2 | deferred |
| IoT (weighbridge/temperature) | No | `brick kiln.md` §12 | v2 | deferred |
| Multi-kiln owner view, SaaS billing | No | depends on multi-tenant fix | v2 | deferred |

## What's already strong (no gap, confirmed in Phase 1)

- Append-only ledger, paisa-exact money, reversal-based corrections — tested, correct, stronger than every reference repo.
- Owner-editable `types` mechanism — already solves several v1 gaps above (new fuel items, expense categories, grades) with zero schema change once the UI points at it.
- CNIC/age/contract compliance gate — tested.
- Kiln section state machine — tested end-to-end manually this session.
- Urdu/English i18n + RTL — functional, just needs polish (numerals/Hijri, both opt-in v1).

## Output

- `docs/03-gap-analysis.md` (this file)
