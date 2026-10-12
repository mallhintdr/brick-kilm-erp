# Phase 3 — Roadmap

Effort estimates are **days for one developer** (you), building on the existing `apps/api`/`apps/pwa` codebase — not from scratch. Assumes familiarity gained building the current system. Each line is a vertical slice per the brief's Phase 4 working rule (schema + API + UI + tests + seed data + short note), so estimates include testing, not just happy-path code.

## MVP — before a second real tenant/kiln goes live

| # | Item | Days | Depends on |
|---|---|---|---|
| 1 | Fix multi-tenant login (require `tenantId` or subdomain resolution) | 1 | — |
| 2 | JWT secret startup check + refresh tokens | 1 | #1 |
| 3 | Rate limiting on login + restrict CORS to known origins | 0.5 | — |
| 4 | Mobile bottom-nav redesign (replace pill bar) | 1.5 | — |
| 5 | `vite-plugin-pwa` app-shell offline caching | 1 | — |
| 6 | Daily cash book (roznamcha) screen + aggregate endpoint | 2 | — |
| 7 | Inventory stock guard (configurable, not hard-blocking by default) | 1 | — |
| 8 | Accessibility pass (aria-live on save/error banners, SVG chart fallback table, contrast check, confirm touch targets) | 2 | #4 |
| **MVP subtotal** | | **10 days** | |

## v1 — first full season

| # | Item | Days | Depends on |
|---|---|---|---|
| 9 | Audit Logs screen + endpoint | 1.5 | — |
| 10 | RBAC permission-matrix (per-user override collection + UI) | 3 | — |
| 11 | Weekly kharchi settlement run (`kharchiRuns`) | 4 | MVP #6 |
| 12 | Family-level peshgi (`families`) | 2 | #11 |
| 13 | Delivery challans | 2 | — |
| 14 | Receivables aging report | 1.5 | #13 |
| 15 | EOBI/PESSI optional fields | 1 | — |
| 16 | Bonded-labour soft alert | 1 | #11 |
| 17 | Server-side PDF export (slips + core reports) | 4 | — |
| 18 | Excel export (`exceljs`) | 2 | #17 (shares report-data layer) |
| 19 | GRN lab fields UI | 1 | — |
| 20 | Per-section COGS breakdown | 2 | — |
| 21 | Expense category as `types` kind + migration script | 1.5 | — |
| 22 | Season-scoped P&L + season close workflow | 3 | #20 |
| 23 | WhatsApp daily summary (Python) | 2 | — |
| 24 | Rate-plan effective-dating; remove hard-coded firing wage | 2 | — |
| 25 | Soft deletes for `workers`/`customers`/`teams` | 1.5 | — |
| 26 | Nightly backup automation + monthly restore test doc (Python) | 1.5 | — |
| 27 | Numeral/Hijri opt-in settings | 1 | — |
| **v1 subtotal** | | **≈ 34.5 days** | |

## v2 — second season onward

| # | Item | Days (rough) | Depends on |
|---|---|---|---|
| 28 | Assets + maintenance logs | 3 | — |
| 29 | QA sampling + quality scores | 5 | #11 |
| 30 | GIS/Leaflet (yards, clay pits, delivery heatmap) | 6 | — |
| 31 | Forecasting / cash-flow projection | 5 | #22 |
| 32 | IoT integration (weighbridge/temperature) | 5+ | hardware-dependent, estimate uncertain |
| 33 | Multi-kiln owner view + SaaS billing | 8 | MVP #1 proven in production |
| **v2 subtotal** | | **≈ 32+ days** | |

## Suggested sequencing

1. **MVP first, strictly in the order listed** — items #1–3 are security/correctness fixes that should land before anyone else touches the system; #4–5 are the user's explicit mobile-dashboard goal for this phase; #6–8 close the remaining "can't run a real kiln on this yet" gaps.
2. **v1** can run in parallel tracks once MVP ships: money/compliance track (#9, #10, #15, #16, #24–26) and reporting/sales track (#11–14, #17–23, #27) — but #11 (kharchi run) should go early since several other v1 items reference it.
3. **v2** — revisit after one real season's usage data exists; several v2 estimates (IoT especially) are uncertain until real hardware/vendor constraints are known.

## Total estimate

- MVP: **10 days**
- v1: **≈ 34.5 days**
- v2: **≈ 32+ days** (least certain — revisit after MVP+v1 ship)

## Output

- `docs/03-roadmap.md` (this file)

---

## Phase 3 complete — Decisions I need from you (max 5)

(Carried from `docs/03-architecture.md`, repeated here since this closes the phase)

1. Confirm the bottom-tab-bar mobile nav redesign.
2. Confirm server-side Node PDF generation for slips/reports.
3. Confirm subdomain-per-tenant login fix vs. a manual tenant-picker.
4. Confirm Mongoose-as-validation-overlay is the right scope (not a full rewrite).
5. OK to keep numerals/Hijri as opt-in, off by default?

## Risks

- Carried from architecture doc: multi-tenant fix is the highest-priority single item; Mongoose-overlay needs discipline to avoid two sources of truth; PDF generation needs load-testing once usage grows.
- Roadmap risk: v2 estimates (especially IoT, #32) are low-confidence until hardware/vendor decisions are made — do not commit a date to a client based on these numbers without revisiting after v1.
