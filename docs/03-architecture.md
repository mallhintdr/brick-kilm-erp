# Phase 3 — Target Architecture

Builds on `docs/01-audit.md` and `docs/02-domain-model.md`.

## Decisions made (closing Phase 2's open questions)

| # | Question | Decision | Why |
|---|---|---|---|
| 1 | Receivables aging + delivery challans: MVP or v1? | **v1**, not MVP | `brick kiln.md`'s own roadmap (§12) puts labour ledger + cash book first because they "stop the biggest leaks and legal risks." Sales/receivables depth follows once cash discipline exists. |
| 2 | EOBI/PESSI: worth building? | **v1, fields only, never enforced** | Cheap (a few optional worker fields + a dashboard count of unregistered workers, per original design doc). Does not force registration — the owner decides; the software just stops losing the data. |
| 3 | Assets/maintenance | **v2** | No evidence of demand in the five repos or the live competitor product. Revisit if an owner asks. |
| 4 | Bonded-labour flag | **Alert-only, v1** | Confirmed: dashboard flag, never blocks a payment. Matches the brief's "fair, transparent records, flags bonded-labour risk" instruction. |
| 5 | Grade list | **Keep Awwal/Doem/Khangar/Broken**, owner-extendable via `types` | No evidence yet that Sadiqabad-area kilns need the 5-grade Aawal/Chant/Khinger/Doem/Roara split seen in the competitor screenshots. Zero schema-risk either way since `types` already makes this owner-editable — revisit once real sales data exists. |

## Mobile-first, accessible, state-of-the-art dashboard — the user's explicit goal for this phase

**Decision: evolve the current React + Vite PWA. Do not rewrite.**

Why not rewrite: the current system already has (a) Urdu/English i18n with RTL (`apps/pwa/src/i18n.js`), (b) a working offline write-outbox (`apps/pwa/src/api.js`), (c) a 96–102 kB gzipped bundle — far lighter than any Electron (repo1/repo2) or JSP (repo4) alternative, and (d) correct paisa-based money handling already matching the brief. A rewrite would throw away tested, working code to chase a framework, which violates "prefer boring, proven tech."

What changes, concretely:

| Area | Current state | Change |
|---|---|---|
| Navigation | Horizontal pill bar, `overflow-x: auto` (`apps/pwa/src/App.jsx`, `.tabs` in `styles.css`) | **Replace with a bottom tab bar on mobile** (≤768px) showing 5 primary destinations (Home/Kiln Board, Production, Money, Sales, More) + a "More" sheet for the rest. Audit finding: Digital Munshi's 10-tab horizontal scroll was flagged as clumsy for the target device (cheap Android phones) — don't repeat it. |
| Layout | `main { max-width: 900px; margin: 0 auto }` — single column, already reasonably mobile-safe | Keep single-column as the default; add a 2-column layout only at ≥1024px for owner desktop use (forms/tables don't need to stretch full-width on a monitor). |
| Touch targets | `button`/`input { min-height: 44px }` already set | Good — matches WCAG 2.1 target size (2.5.5) and Apple/Google HIG. Audit every custom interactive element (kiln diagram chamber tiles, `.badge`, table row delete buttons) against the same 44px minimum; the kiln diagram's SVG chambers are currently ~40–58px drawn size scaled by viewport — verify real touch size ≥44px CSS px on a 360px-wide phone, not just visually. |
| Color contrast | Brand amber `#b45309` on white, tinted banners added this session | Run against WCAG AA (4.5:1 text, 3:1 large text/UI) before v1 ships; the `--warn` amber-on-tint combination is the one to check first. |
| Keyboard/screen-reader | Partial — `role="button"`/`tabIndex`/`aria-label`/`aria-pressed` already on the kiln diagram chambers; most buttons are native `<button>` (good, free semantics) | Add: skip-to-content link, `aria-live="polite"` region for save/error messages (currently plain `<p>` banners with no live-region announcement — a screen-reader user entering a kharchi amount won't hear "Saved"), visible focus ring already present via `input:focus`/button hover but not confirmed on every custom control (kiln chambers have `.kc:focus-visible` — confirmed present). |
| Charts | Hand-rolled SVG (`LineChart.jsx`, `BarChart.jsx`), no library | Keep — zero dependency weight, but add `<title>`/`<desc>` SVG elements and a visually-hidden data table fallback for screen readers (currently charts are decorative-only to assistive tech). |
| Offline shell | Dexie write-outbox only; no app-shell caching | Add `vite-plugin-pwa` (workbox) so the UI itself loads with no network, not just queued writes — genuine offline-tolerant, matching the brief's "mobile-first and offline-tolerant data entry for the munshi." |
| Numerals/dates | `fmtDateTime` uses `toLocaleString()` (browser default locale formatting) | Add an explicit Eastern Arabic-Indic numeral toggle (۰۱۲۳...) as a Settings option — off by default (most munshis read Western digits fine; this is a nice-to-have, not assumed). Hijri date display: optional secondary line next to Gregorian, off by default, per brief's "optional Hijri display." |
| Design tokens | CSS custom properties already exist (`:root { --bg, --ink, --brand, ... }` in `styles.css`) | Formalize into a documented token set (color, spacing, radius, shadow scale) so new screens stay consistent without copy-pasting values — no new library needed, this is discipline, not tooling. |

**Explicitly rejected:** Tailwind, MUI, Ant Design, or any component-library rewrite. The existing hand-written CSS is already small (8.6 kB), token-based, and RTL-correct. Pulling in a utility framework now would mean re-theming every screen for marginal gain — not "boring and proven" relative to what's already working.

## 1. Module list — MVP / v1 / v2

Mapped against current system (`apps/`), the five repos, and the Digital Munshi screenshots.

### MVP (must exist before first real kiln goes live — mirrors `brick kiln.md` §12 Phase 1 intent)

| Module | Status | Source |
|---|---|---|
| Multi-tenant auth + RBAC (role-based, not yet full matrix) | **Built, has a bug** (login tenant-scoping, audit gap #1) — fix before anything else | current system |
| Worker + compliance gate (CNIC/age/contract) | Built | current system |
| Types (owner-editable lookups) | Built | current system |
| Peshgi/ledger engine (append-only, reversals, editable limit) | Built | current system |
| Kiln board + moulding/loading/firing/unloading | Built | current system |
| Inventory (derived) | Built, needs stock guard | current system |
| Basic sales (customer/invoice/payment) | Built | current system |
| Daily cash book (roznamcha) screen | **Gap** — ledger data exists, no dedicated screen | screenshots (Rozana Khata) |
| Delete-with-reversal, audit log (data layer) | Built | current system |
| Settings (rates/prices/peshgi limit, versioned) | Built | current system |
| Mobile-first responsive shell + bottom nav | **Gap** — see above | this phase's decision |
| Offline app-shell (not just write-outbox) | **Gap** | this phase's decision |

### v1 (first full season)

| Module | Status | Source |
|---|---|---|
| Audit Logs screen (data exists, no UI) | Gap | audit #3 |
| Weekly kharchi settlement run (`kharchiRuns`) | Gap, designed in `02-domain-model.md` §5 | adapted from repo2 (MIT) payroll-run pattern + screenshots (Thursday Khata) |
| Family-level peshgi | Gap | `brick kiln.md`, domain model §5 |
| Delivery challans, receivables aging | Gap | domain model §9, decision #1 above |
| EOBI/PESSI optional fields | Gap | decision #2 above |
| Bonded-labour alert (soft) | Gap | decision #4 above |
| PDF/Excel export (slips, reports) | Gap — biggest single gap vs. every reference (repo1, repo4, Digital Munshi all have it) | audit gap #5 |
| RBAC permission matrix (module × view/add/edit/delete) | Gap | screenshots (Create New User modal) |
| GRN lab fields UI (coal calorific/ash, soil silica/alumina) | Gap — schema field exists | domain model §7 |
| Per-section COGS breakdown | Gap | domain model §8 |
| Chart-of-accounts breadth (`expenseCategory` as a `types` kind) | Gap | domain model §10, screenshots (Main Khata 7 groups) |
| Season-scoped P&L + season close workflow | Gap | domain model §3, §10 |
| WhatsApp daily summary | Gap | `brick kiln.md` §9 |
| Rate-plan effective-dating per category (replace hard-coded firing wage) | Gap | audit gap #8 |

### v2 (second season onward)

| Module | Status | Source |
|---|---|---|
| Assets + maintenance logs | Gap | decision #3 above |
| GIS/Leaflet (yards, clay pits, delivery heatmap) | Deferred | Phase 1 decision |
| QA sampling + quality scores | Gap | `brick kiln.md` §8 |
| Forecasting, cash-flow projection | Gap | `brick kiln.md` §9 |
| Weighbridge/temperature IoT integration | Gap | `brick kiln.md` §12 |
| Multi-kiln owner view, SaaS billing | Gap | depends on multi-tenant fix being proven first |
| Carbon-credit data pack | Deferred (Phase 3 option in original doc) | `brick kiln.md` §1 |

## 2. Multi-tenant design

**Fix first (blocks everything else):** `apps/api/src/app.js:42` must require `tenantId` at login once more than one tenant exists, or derive it from a per-tenant subdomain/slug. Recommended approach for a SaaS product: `{slug}.yourdomain.com` → resolve `tenantId` server-side from the slug, so the munshi never has to type or remember a tenant ID on a small phone screen. Username remains unique *within* a tenant (already enforced: `users` index is `{tenantId, username}` unique in `apps/api/src/db.js`).

**Isolation:** already structurally sound — `scope(user)` (`core.js:8`) injects `{tenantId, kilnId}` into every query; keep this as the one and only path to the database (no route should query a collection without going through `scope()`).

**Per-tenant plan/limits:** add a `tenants.plan` field (already present per `seed.js`) and a middleware that checks worker-count/kiln-count against plan limits — not built yet, v1.

**Hosting:** single MongoDB Atlas cluster (shared, tenant-isolated by `tenantId`, not by database-per-tenant — keeps the "small MongoDB Atlas tier" cost target from the brief) + a single small VPS or App Platform instance for the Node API, with the PWA served as static files (same origin or a CDN). No Kubernetes, no microservices — one Express process scales to dozens of small kilns.

## 3. RBAC

v1 target, informed by the screenshots' permission-matrix UI:

- Keep the 5 fixed roles (`owner, accountant, munshi, mistri, viewer`) as **defaults**, but add a `permissions` collection (`{tenantId, kilnId, userId, module, view, add, edit, delete}`) that can override the role default per user — mirrors repo2's `custom_permissions` JSON-on-worker idea and the screenshots' explicit matrix, without discarding the simpler role model most tenants will just use as-is.
- `auth(...roles)` middleware (`app.js`) extended to also check the permission override when present; falls back to role defaults otherwise. Backward-compatible — no route needs to change its call signature.

## 4. Audit trail and soft deletes

- Audit log **write path already correct** (`core.js` `audit()`); **missing: read UI**. Build an `/audit-logs` endpoint (filter by user/action/date/module, paginated) + a screen, modeled on the screenshots' Audit Logs page (KPIs + filters + table), v1.
- Soft deletes: current deletes are **hard deletes with compensating ledger reversals** (`apps/api/src/deletes.js`) — this is correct for money records (never silently lose a financial trail) but should become genuinely soft (`deletedAt` field, excluded from queries, recoverable) for non-money records like `workers` and `customers` where a mis-click shouldn't be unrecoverable. v1 change: add `deletedAt` to `workers`/`customers`/`teams`, filter in `scope()`-based queries, keep the existing guard logic (still refuse delete if money history exists) unchanged.

## 5. Data model — Mongoose schemas, relationships, indexes, money

**Decision: adopt Mongoose as a thin layer over the existing driver code, not a rewrite.** Current code uses the raw MongoDB driver directly (`apps/api/src/db.js`), which is fine and fast but gives no schema validation at the application layer (relies entirely on Zod at the API boundary, which is good, but doesn't protect direct DB scripts like `seedHistory.js` from drifting). Given the brief explicitly asks for "Mongoose schemas with relationships, indexes," the pragmatic move is:

- Define Mongoose schemas **matching the collections that already exist**, used only for validation/typing in new v1 code (the existing raw-driver routes keep working unchanged — no big-bang migration).
- Relationships are reference-based (`ObjectId` + manual `populate`-style lookups, as already done, e.g. `creditTeam` resolving `teams._id`), not embedded — correct choice given the append-only-ledger design (ledger entries must stay flat and independently queryable).
- Indexes: current ones in `db.js` are good; add per domain-model additions: `families` (`{tenantId, headWorkerId}`), `kharchiRuns` (`{tenantId, kilnId, periodStart}` unique), `challans` (`{tenantId, invoiceId}`).
- **Money: no change needed.** `Decimal128` + paisa-BigInt arithmetic (`packages/shared/src/index.js`) already satisfies the brief's "integers in paisa, no float errors" requirement and is stronger than repo2's float-based schema. Keep as the one and only money-handling path; never introduce a second one (e.g. a Mongoose schema declaring a money field as `Number`).

## 6. Urdu + English UI, RTL, numerals, dates

Already built: `i18n.js` (ur/en dictionaries), `dir="rtl"`/`dir="ltr"` toggle, Noto Nastaliq Urdu font, `.kiln-scroll { direction: ltr }` override so the kiln diagram stays left-to-right fire-flow even in Urdu mode (a deliberate, already-correct exception). v1 additions: Eastern Arabic-Indic numeral toggle, optional Hijri secondary date — both opt-in settings, not defaults (per decision above, avoid guessing what munshis actually prefer; ship both off, let the owner enable).

## 7. Mobile-first, offline-tolerant PWA + printable receipts

- `vite-plugin-pwa` added for app-shell caching (MVP gap above).
- Printable Urdu slip: **decision — server-side PDF via a Node PDF library (e.g. PDFKit), not client-side.** Rationale: Urdu text shaping is unreliable in browser-side canvas/PDF generation (same risk flagged for WeasyPrint vs. JS libraries in the original `brick kiln.md` recommendation); doing it server-side in Node keeps the stack single-language (the brief's own Phase 4 instruction mentions "Python automation scripts" for summaries/backups — PDF generation can stay Node since it's request-time, not a batch job, but the Python scripts remain for WhatsApp/Excel/backup per the brief). QR code on the slip links to the existing read-only ledger view, rate-limited, no CNIC shown (per original design doc's privacy note).
- Bluetooth ESC/POS printing remains explicitly deferred per the user's own earlier instruction this project — PDF/print-dialog first, hardware later.

## 8. Reports, dashboards, exports

- Dashboard: keep the existing `Insights.jsx` as the desktop/tablet view; on mobile, surface the same data as a scrollable KPI-card stack (already responsive via `.kpi-grid { grid-template-columns: repeat(auto-fit, minmax(170px,1fr)) }`) rather than the ten-tab pattern criticized in Phase 1.
- Exports: PDF (server-side, per §7) and Excel (`exceljs` — pure JS, no native binary dependency, keeps hosting simple) for: worker settlement sheets, season summary, receivables aging, stock position, compliance gaps.

## 9. API design, security, logging, deployment

| Area | Decision |
|---|---|
| Validation | Keep Zod at every route boundary (already consistent) |
| Auth | JWT access token (short-lived, e.g. 1h) + refresh token (httpOnly cookie, rotated) — **current system has no refresh token at all** (`app.js` issues one 12h token); this is a v1 fix, not MVP-blocking for a single pilot kiln but required before public SaaS launch |
| Secrets | `JWT_SECRET` must be required (fail startup if unset) in any non-dev `NODE_ENV`, closing audit gap #11 |
| Rate limiting | `express-rate-limit` on `/auth/login` (5 attempts / 15 min / IP), closing part of gap #11 |
| CORS | Restrict to the known PWA origin(s) via env var, closing audit gap #12 |
| Logging | Structured logs (`pino`) to stdout, shipped to the hosting platform's log aggregation — no new infra |
| Backups | Nightly `mongodump` to S3-compatible storage via a small Node or Python script (brief allows either; Python chosen for consistency with the other brief-mandated Python scripts), monthly restore test per `brick kiln.md` §10 |
| Deployment | Single small VPS (or managed Node host) running the API behind a reverse proxy (Caddy/nginx) with automatic HTTPS; MongoDB Atlas free/M10 tier; PWA built as static files served by the same proxy. No containorchestration needed at this scale. |

## 10. Migration plan (current data → v1 schema)

1. **No breaking changes to existing collections** — all v1 additions are new collections (`families`, `kharchiRuns`, `challans`, `permissions`, `assets`) or additive fields (`deletedAt`, EOBI/PESSI fields on `workers`, `labFields` already present on `grns`). Existing data needs no transformation.
2. `expenses.category` free-string → `expenseCategory` type: one-time script maps existing distinct category strings to new `types` rows (`kind: 'expenseCategory'`), then back-fills nothing (the string field stays authoritative until all expense-entry forms are switched to the new dropdown).
3. Audit log UI ships reading the *existing* `auditLog` collection as-is — no migration needed, it was always written correctly.
4. Opening-stock baseline (per domain model §4's note on Digital Munshi's "Opening Stock Setup" pattern): for any kiln onboarding mid-season, provide a one-time manual-entry screen for green/fired/coal opening balances dated at go-live, exactly as the competitor does — this is new UI, not a data migration, since the current system has no prior data to migrate from for a brand-new pilot kiln.

---

## Output

- `docs/03-architecture.md` (this file)
- `docs/03-gap-analysis.md`
- `docs/03-roadmap.md`

## Decisions I need from you (max 5)

1. Confirm the bottom-tab-bar mobile nav redesign (replacing the current horizontal pill bar) — this is a real UI change to screens you've already seen, not just new screens.
2. Confirm server-side Node PDF generation (not a client-side library) for printable slips/reports.
3. Confirm subdomain-per-tenant (`{slug}.yourdomain.com`) as the multi-tenant login fix, vs. a manual tenant-picker screen — subdomain is better for munshis (nothing to remember) but needs DNS/wildcard-certificate setup on hosting.
4. Confirm Mongoose-as-validation-layer-only (not a full rewrite of existing raw-driver routes) is the right level of effort for this phase.
5. OK to keep Eastern Arabic-Indic numerals and Hijri date as opt-in (off by default) rather than guessing the target users' preference?

## Risks

- The multi-tenant login fix (§2) is the single highest-priority item before any second tenant is onboarded — current behavior would let two tenants' usernames collide.
- Mongoose-as-overlay (§5) risks two sources of truth (Zod schemas + Mongoose schemas) if not disciplined — mitigate by generating one from the other where practical, or by documenting clearly which layer owns which rule (Zod = input shape, Mongoose = storage shape).
- PDF generation server-side adds a new dependency and request-time cost; needs load-testing once worker/invoice counts grow per tenant.
