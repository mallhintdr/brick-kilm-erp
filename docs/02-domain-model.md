# Phase 2 — Domain Model for Punjab Brick Kilns

Builds on `docs/01-audit.md`. Pakistani-law/rate figures are marked **VERIFY** — none are implemented or confirmed; check with Punjab Labour Department, EOBI, PESSI, EPD and FBR/PRA as noted.

## 1. Glossary (Urdu term / English / meaning)

| Urdu | Transliteration | English | Meaning in this system |
|---|---|---|---|
| بھٹہ | Bhatta | Kiln | The whole brick kiln operation/site; one `kilns` document |
| اینٹ | Eint | Brick | The product |
| مٹی | Matti | Clay/soil | Raw material for moulding |
| پتھائی | Pathai | Moulding | Shaping wet clay into green (kacha) bricks |
| پتھیرا | Pathera | Moulder | Worker who moulds bricks, paid per 1,000 |
| کچی اینٹ | Kachi eint | Green/raw brick | Unfired, sun-dried brick |
| پکی اینٹ | Pakki eint | Fired brick | Brick that has been through the kiln |
| بھرائی | Bharai | Loading | Carrying dry green bricks into a kiln section/chamber, stacking in zig-zag pattern |
| جلائی | Jalai | Firing | Feeding coal/fuel, running the kiln 24/7 |
| نکاسی | Nikasi | Unloading | Removing fired bricks from a cooled section, sorting by grade |
| منشی | Munshi | Manager/clerk | Day-to-day data entry, cash handling, labour relations |
| جمعدار | Jamadar | Labour contractor | Recruits/manages a team (jora), may hold advances, earns commission |
| جوڑا | Jora | Team/pair | A labour team/group, often family-based |
| پیشگی | Peshgi | Advance | Cash advanced to a worker/family against future production |
| خرچی / خرچہ | Kharchi / Kharcha | Weekly allowance | Cash paid out weekly after recovery deduction |
| اول | Awwal | Grade A | Best-quality fired brick |
| دوم | Doem | Grade B | Second-quality fired brick |
| کھنگر | Khangar | Over-burnt brick | Used for soling/foundations, not structural |
| روڑا | Rora / Roara | Broken brick | Broken/rejected pieces, sold cheap |
| خراب / خرابہ | Kharaba | Wastage/damage | Rain loss or breakage of green or fired stock |
| بھٹے کا چکر | Bhatte ka chakar | Kiln cycle | One load→fire→cool→unload cycle for a section |
| سیکشن / حصہ | Section / Hissa | Chamber/section | One of the kiln's numbered firing chambers |
| موسم | Mausam | Season | The Oct–Mar/Apr firing season |
| چھٹی / بارش کی چھٹی | Chutti / barish ki chutti | Monsoon shutdown | Jul–Sep closure when the kiln cannot fire |
| کوئلہ | Koyla | Coal | Primary fuel |
| لکڑی | Lakri | Wood | Secondary fuel |
| برادہ | Burada | Sawdust | Secondary fuel / fire-starting material |
| ٹرالی | Trolley | Trolley | Small tractor-trailer, common delivery vehicle |
| پرچی | Perchi | Slip/receipt | Printed receipt given to worker or customer |
| کھاتہ | Khata | Ledger/account | A running debit/credit account for a party |
| حساب / میزان | Hisab / Mezan | Settlement/total | Season-end or period settlement |
| اُدھار | Udhaar | Credit sale | Goods sold on credit, payment owed |

## 2. Kiln profile and registration

**Entity: `kilns`** (exists in current system; extend).

| Field | Type | Notes |
|---|---|---|
| name | string | e.g. "Sadiqabad Zig-Zag Kiln" |
| techType | enum | `zigzag` \| `fcbtk` \| `clamp` \| `other` — VERIFY: Punjab EPD only permits zigzag/FCBTK for new kilns as of recent notifications; confirm current list with EPD before hard-coding |
| sectionCount | int | already exists, default 28 |
| location | GeoJSON Point | lat/long of the kiln itself |
| boundary | GeoJSON Polygon | site boundary — optional, Phase 3 |
| epdNocNo / epdNocExpiry | string / date | already in schema (`kilns.epdNocNo`) |
| registrationNo | string | provincial/local registration, if any — VERIFY which authority issues this |
| ownerName, ownerCnic | string | for compliance documents |

## 3. Season cycle

| State | Typical window | System behaviour |
|---|---|---|
| Pre-season setup | Aug–Sep | Enter opening stock (green/fired/coal), confirm rate plans for the new season, renew contracts |
| Active firing season | Oct–Mar/Apr | Daily workflows run; "Advance fire" active |
| Monsoon shutdown | Jul–Sep (variable) | No firing; moulding may pause; `closureWindows[]` already modeled in `seasons` per `brick kiln.md` |
| Season close | End of season | Freeze opening/closing stock, run worker settlements, carry forward peshgi balances with signed consent |

**Workflow — season rollover:**
1. Owner marks current season `closed` once final unloadings/settlements are posted.
2. System snapshots closing stock (green, fired-by-grade, coal) and closing peshgi balance per worker.
3. New season document created; closing balances become opening balances (not re-entered).
4. Any carried peshgi balance requires a new signed consent record (per `brick kiln.md` §7) before the new season's first advance.

## 4. Moulding (pathai)

**Entities:** `mouldingBatches` (exists), `teams` (exists), `workers` (exists, category `pathera`).

| Field | Notes |
|---|---|
| count | total moulded that day |
| kharaba | rain/breakage loss, already captured |
| netCount | `count - kharaba`, already computed |
| rate source | `ratePathera` setting, Rs per 1,000 — editable, matches `brick kiln.md` design |

**Gap vs Digital Munshi:** their Pather Khata is a *weekly grid* (one row per worker, one column per weekday, entered in batch). Current system is one POST per batch per team per day. **Recommendation for Phase 3:** add a weekly-grid entry view on top of the same API (no schema change needed — just batches several `/moulding` POSTs from one screen), since munshis are shown to prefer bulk weekly entry.

## 5. Peshgi (advance) system

Already built and tested (`apps/api/test/ledger.test.js`). Extensions for Phase 2/3:

| Gap | Design |
|---|---|
| Family-level peshgi | Add `families` collection (head worker, member workerIds[], combined limit) per `brick kiln.md`; peshgi-limit check sums across family, not just individual, when a family cap is set |
| Weekly settlement batch | New `kharchiRuns` concept (mirrors repo2's `payroll_runs`/`payroll_run_items` MIT-licensed design, adapted to Mongo): one run per week per team-category, snapshot of gross credit / recovery / kharchi paid per worker, "Save & Settle" posts the ledger entries in one transaction |
| Bonded-labour risk flag | Dashboard alert when a worker's peshgi balance has not decreased over N consecutive weeks despite earnings exceeding the kharchi floor — flags for owner review, never auto-blocks (transparency, not punishment) |
| Transparency | Already printable-slip-ready in design (`brick kiln.md` §4, §7); QR-to-ledger page not yet built — Phase 3 |

**Recovery formula (unchanged, already implemented):**
```
Weekly kharchi = max(gross credits − r × gross credits, kharchi floor)
Recovery = gross credits − weekly kharchi
```

## 6. Labour

Categories already modeled via owner-editable `types` (`workerCategory` kind): manager, supervisor, pathera, bharai, jalai, sealer, nikasi, repairer, driver, jamadar.

| Compliance field | Status | VERIFY |
|---|---|---|
| CNIC / Form-B, age ≥ 14 | Built, tested | Punjab Prohibition of Child Labour at Brick Kilns Act 2016 — confirm minimum age is still 14 and whether 2026 amendments changed it |
| Written contract before pay | Built (`contractSigned` gate) | — |
| Peshgi cap | Built, **owner-editable** per standing preference (not hard-coded) | Confirm whether a statutory cap still applies at all, or whether it's now left to contract; if a cap exists, it's a *default*, not a *limit the software enforces against the owner's own setting* |
| Piece rate ≥ minimum wage | Not built | Punjab Minimum Wages notification — **VERIFY current year's notified rate for brick-kiln pathera/bharai/nikasi categories** with Punjab Labour Department before building the redline warning |
| EOBI registration | Not built | VERIFY whether piece-rate brick-kiln labour is in scope for EOBI, and current contribution rate |
| PESSI (Social Security) | Not built | VERIFY same as above for Punjab Employees Social Security |
| Attendance | Partial (shift field on firingLogs only) | Extend to a dedicated `attendance` collection per `brick kiln.md` §6 |

## 7. Fuel and raw material

Current system's `procurementItem` type kind already covers `coal`, `soil`, `diesel`, `spare` and is owner-extendable (add `wood`, `sawdust`, `water` with no code change — this is the direct payoff of making types editable in the previous session).

| Field | Status |
|---|---|
| GRN with landed cost (qty × rate + freight) | Built |
| Lab fields (coal calorific value/ash/volatile; soil silica/alumina) | Not built — `grnInput.labFields` exists as a free-form record in `packages/shared/src/index.js` but no UI exposes it yet |
| Per-firing consumption | Built (`firingLogs.coalKg`) |
| Cost per 1,000 bricks | Partially built (`coalPer1000` in `/insights/summary`); not yet broken into full per-brick cost (labour+fuel+overhead) |

## 8. Kiln operations

Already built: 6-state section state machine (Empty→Loading→Preheating→Firing→Cooling→Unloading→Empty), visual kiln diagram, fire-advance action.

| Gap | Design |
|---|---|
| Stock guard | Block a load if it would exceed green stock on hand (configurable `allowNegativeStock` setting, borrowing repo2's pattern of making it a toggle, not a hard rule) |
| 5-grade support | Current `GRADES` is 3 configurable + Broken; extend `unloadCompleteInput` to accept an owner-defined grade list once Phase 2 question #3 is answered (default: keep current 3+Broken, confirm with real sales data before adding Chant/Roara) |
| Per-section cost | `brick kiln.md` §6 note: "derived view, do not store by hand" — already the system's philosophy; extend `/insights` with a per-section COGS breakdown (fuel+labour+overhead ÷ saleable bricks) |

## 9. Sales

| Gap | Design |
|---|---|
| Delivery challan | New `challans` collection: vehicle, driver, destination, linked invoice |
| Receivables aging | New `/receivables` endpoint bucketing by 0–30/31–60/61–90/90+ days from invoice date minus payments, modeled on Digital Munshi's simpler "Receivable/Payable/Net Position" card |
| Customer credit limit enforcement | `customers.creditLimit` already exists as a field; not yet enforced at invoice-creation time |
| Tax lines | `invoiceInput.taxPct` already exists, manual entry; FBR/PRA-specific rules — **VERIFY** whether brick kilns are liable for sales tax or a presumptive/turnover-based scheme in Punjab, and whether NTN-vs-cash-buyer distinction changes the applicable rate |

## 10. Accounts

| Gap | Design |
|---|---|
| Cash book (roznamcha) screen | Ledger data exists; no dedicated "opening cash → today's in/out → closing cash" screen yet (Digital Munshi's Rozana Khata is the reference pattern, not its code) |
| Chart of accounts breadth | Digital Munshi groups Parties/Buyers/Carriage/Material/Expenses/Control/Capital; current system's `expenses.category` is a free string — formalize as its own `types` kind (`expenseCategory`) reusing the existing mechanism |
| Season P&L | `/insights/summary` gives running totals; not yet season-scoped or exportable |

## 11. Assets

Not built. New `assets` collection: type (vehicle/tractor/generator/machinery), registration/serial, purchase date/cost, status, and `assetMaintenanceLogs` (date, description, cost, next-due). Low priority — no evidence in repos or Digital Munshi that this is commonly used; confirm demand with the owner before building (candidate for the Phase 3 roadmap's v2 tier, not MVP).

## 12. GIS

Deferred per Phase 1 decision (neither the five repos nor Digital Munshi use it). When built: kiln location, customer/delivery points, clay pits as Leaflet + GeoJSON layers, reusing the `location`/`boundary` fields added to `kilns` above.

## 13. Compliance and reporting for owners

| Report | Status |
|---|---|
| Season summary | Not built as one screen; data exists across collections |
| Worker settlement sheet | Not built; depends on the `kharchiRuns` design in §5 |
| Stock position | Built (`/inventory/summary`) |
| Receivables aging | Not built, see §9 |

## 14. Workflows (step lists)

**Daily moulding:**
1. Munshi selects a pathera team.
2. Enters count and kharaba (rain/damage) for the day.
3. System computes `netCount`, credits team members' `earnings` ledger at `ratePathera`.
4. (Phase 3) Slip auto-prints.

**Section load → fire → unload (already built, documented for completeness):**
1. Munshi picks an `Empty` section, assigns a bharai team, enters count → section becomes `Preheating`, team credited at `rateBharai`.
2. Munshi taps "Advance fire" → the `Preheating` section becomes `Firing`, the prior `Firing` section becomes `Cooling`.
3. Once `Cooling`, munshi assigns a nikasi team → section becomes `Unloading`.
4. Munshi (or mistri, for QA) enters grade counts → section becomes `Empty`, nikasi team credited at `rateNikasi`, stock increases by grade.

**Weekly kharchi settlement (new, §5):**
1. System proposes gross credits per worker from the week's moulding/loading/firing/unloading entries.
2. Munshi reviews, applies recovery % (owner-editable) and kharchi floor.
3. Owner or munshi (within limit) approves; system posts recovery + kharchi-paid ledger entries in one transaction, prints slips.
4. Any advance above the limit routes to an owner-approval queue (already built for ad hoc advances; extend to the batch run).

**Season close (new, §3):** as listed above.

**Sale with delivery (new, §9):**
1. Munshi/accountant creates an invoice (grade, qty, rate from price list, customer, tax).
2. Delivery challan recorded: vehicle, driver, destination.
3. Payment recorded against the invoice (already built); receivables aging updates automatically.

---

## Output

- `docs/02-domain-model.md` (this file)

## Decisions I need from you (max 5)

1. §9: should receivables aging and delivery challans be MVP (Phase 2 roadmap) or v1? They weren't in the original current-system build.
2. §6: confirm whether to pursue EOBI/PESSI fields at all for this customer base (many small kilns may not register workers formally) — building the fields doesn't mean forcing registration, but want your read on demand before spending roadmap time.
3. §11 Assets/maintenance — build in MVP/v1, or skip until an owner asks?
4. §5 bonded-labour risk flag — confirm you want this as a soft dashboard alert (never blocking), matching the brief's "fair, transparent... flags bonded-labour risk" instruction.
5. Confirm the grade list decision from Phase 1 (default taken: keep Awwal/Doem/Khangar/Broken) — final answer before Phase 3 locks the `unloadCompleteInput` schema shape.

## Risks

- Every row marked **VERIFY** in §6 and §9 is currently unimplemented and must not be built against assumed figures. Flagging again here because Phase 3's architecture doc will reference these as "config, not code" — the risk is deploying with wrong defaults, not wrong code.
- §5's bonded-labour flag is a sensitive feature: implemented wrong (e.g. auto-blocking a worker from receiving pay) it could itself cause harm. Default design above is alert-only, never blocking — confirm before Phase 3.
