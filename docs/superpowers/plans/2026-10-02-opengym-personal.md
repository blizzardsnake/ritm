# openGym Personal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the complete personal Android fork described in the accepted project, including nutrition, shared history, available watch data, achievements and a reviewable weekly exchange.

**Architecture:** Extend the existing React/Zustand state with pure, Node-loadable personal modules. Keep native ingestion in a Capacitor Health Connect plugin with an atomic mailbox. Share report calculations between screens, exports and MCP. Preserve original workout behavior, backups and optional server synchronization.

**Tech Stack:** React 19, Zustand 5, Vite 8, Capacitor 7, Vitest 4, Node 24, Java 21, Android Gradle; stable Health Connect 1.1.0 and WorkManager.

**Spec:** ../specs/2026-10-02-opengym-personal-design.md and its five linked module specs.

## Global Constraints

- Baseline v1.3.9, e6c920eb0a657e57139798f60da40c934aec9301. Keep AGPL attribution and original functions.
- App name openGym Personal, applicationId local.opengym.personal, separate Documents/openGymPersonal directory and persistent private signing key. Disable original APK updater.
- State sections personalProfile, nutrition, health, progressGoals, weeklyReviews; record IDs, createdAt, updatedAt and deletion tombstones. Unknown values are null, grams and kcal never converted with barbell units.
- Meals preserve snapshots; each event records UTC instant, local date, timezone and offset. Never invent old timestamps or off-wrist status.
- At least 50 Russian foods from identifiable USDA records. Open Food Facts explicit queries, native User-Agent, cache and rate limits; no diary upload.
- Watch reads are permission-specific and source-filtered; re-read the last seven days, avoid duplicate totals, retain history and provenance. Worker writes mailbox, never overwrites React state.
- Analysis format opengym-personal-analysis with version, profile, timestamps, watermark, checksum and four prior weeks of context. No credentials in reports. Active and total energy are separate.
- Proposals affect future plans only, are validated, previewed through the real session engine and explicitly applied. Journal before/after and support conflict-aware undo.
- Manual reporting works immediately. Schedule weekly automation only after a real phone-to-PC fresh snapshot transfer. Real Mi Fitness coverage requires phone acceptance.
- Use the dedicated clean clone on branch personal. User's “делай давай” authorizes plan and implementation; no further routine process approvals.

## Review Focus

1. Food-only profiles surviving logout, merge, reset and native restart (tasks 1 and 3 integration tests).
2. Day boundaries and gaps: meals crossing midnight, sleep ending next morning, DST/offset shifts and partial nutrition (tasks 1, 4 and 5).
3. Interrupted file transfer, corrupt checksum, wrong profile and stale suggestions (tasks 4, 7 and 8).
4. Edited/deleted history revoking achievement status without duplicate award notifications; warmups and excluded progression sets (task 6).
5. Actual next-session weights after accepting advice, including history overriding routine defaults, unit changes and undo after manual edits (task 7).

## Task 1: Versioned state and nutrition calculations

**Files:** Create frontend/src/lib/personal/{state,nutrition}.js and tests. Update sync-merge.js, sync-changes.js, units.js, store/useStore.js and their tests in task 3 after the pure contracts are stable.

**Interfaces:** `migratePersonalState(state, {now, profileId}={}) -> state`; `mergePersonalState(a,b) -> sections`; `personalHasData(state) -> boolean`; `parseAmount(value,{allowZero=false}={}) -> number`; `normalizeNutrients(value) -> {kcal,protein,fat,carbs}`; `portionNutrients(per100g,grams) -> nutrients`; `recipeNutrients(ingredients,finalGrams) -> per100g`; `snapshotMealItem(food,grams) -> item`; `summarizeNutritionDay(nutrition,date) -> {totals,missing,itemCount,complete}`. Inputs never mutate.

- [ ] Write tests with literal expectations: 37.5g at 200kcal/100g = 75kcal; decimal comma; null versus zero; NaN/negative/infinite rejection; 1200kcal/800g recipe gives 300kcal at 200g; food edited after recording leaves meal unchanged.
- [ ] Write state tests for idempotent migration, preserved original workouts, food-only hasData, tombstone vs older live version, unrelated records retained, new sections independent of kg/lb.
- [ ] Run `node frontend/node_modules/vitest/vitest.mjs run src/lib/personal` from frontend. Expected: missing module failures before implementation.
- [ ] Implement interfaces above, explicit nullable totals, stable profile and per-record version merges.
- [ ] Run the same focused tests, then full frontend suite. Expected: all pass; baseline failures, if any, are separately identified.
- [ ] Commit: `feat: add versioned personal state and nutrition calculations`.

## Task 2: Free food catalogue and product lookup

**Files:** frontend/src/lib/personal/{food-catalogue.json,food-search.js,food-search.test.js}; scripts/build-food-catalogue.mjs; docs food provenance.

**Interfaces:** `normalizeOffProduct(product) -> food`; `searchCatalogue(query) -> food[]`; `createFoodLookup({request,now,cache}) -> {search(query),barcode(code)}`; request method supports Capacitor native HTTP and browser fetch. Catalogue items expose source.dataset, source.fdcId, source.originalName and preparation.

- [ ] Download official USDA bulk data to work; map at least 50 common foods, preserve actual source values and IDs, include raw/cooked distinctions. Expected: generator emits reproducible JSON and provenance.
- [ ] Test kcal/kJ fallback (418.4kJ = 100kcal), missing fields, prepared nutrition, serving-only labels rejected as per100g, 429 backoff, cached offline lookup and throttled explicit requests.
- [ ] Run focused test. Expected: RED for absent lookup implementation.
- [ ] Implement native User-Agent, no background/autocomplete requests, product <=15/min and search <=10/min, catalogue search and cache.
- [ ] Run focused tests and full frontend suite. Expected: GREEN.
- [ ] Commit: `feat: add offline foods and free product lookup`.

## Task 3: Persistent diary and integration with original storage

**Files:** frontend/src/views/{Nutrition,PersonalHealth,WeeklyReview}.jsx (the last two initially route consumers added in later tasks); components personal form primitives; lib/personal/store-actions.js; store/useStore.js; App.jsx; views/Home.jsx; locales and styling; sync-merge.js, sync-changes.js, units.js, mobile.js.

**Interfaces:** state action `updatePersonal(mutator)` uses original persistence and timestamp flow; meal/product/recipe CRUD use snapshots and tombstones; native backup root is openGymPersonal. New routes /nutrition, /health and /weekly retain original five-tab navigation.

- [ ] Integration tests restore old backup, add/edit/delete meal, merge older backup, food-only logout protection, reset all new sections, convert kg/lb without touching food grams, restart native mirror, JSON round trip.
- [ ] Run integration tests. Expected: RED on missing new-section preservation.
- [ ] Integrate migration/merge/hasData/change tracking/reset; implement selected-day diary, meal times/notes, grams, manual foods, catalogue/OFF search/barcode, favourites, recipe final mass, copy/edit/delete and day completeness/targets.
- [ ] Run full frontend/API/MCP suites and production build. Expected: GREEN; manually exercise diary and recipe in browser, persistence after reload, both themes.
- [ ] Commit: `feat: integrate persistent food diary into openGym`.

## Task 4: Unified history and safe reports

**Files:** frontend/src/lib/personal/{time,report,exchange}.js and tests; finish-workout.js, workout recording actions, Settings.jsx; shared UI report actions.

**Interfaces:** `eventTime(instant,{timezone}={}) -> {at,date,timezone,offsetMinutes}`; `buildAnalysis(state,{from,to,now}) -> envelope`; `renderAnalysisMarkdown(envelope) -> string`; `createExchangeSnapshot(envelope) -> Promise<snapshot>`; `verifyExchangeSnapshot(snapshot,{profileId}={}) -> Promise<envelope>`. Hash canonical JSON via browser WebCrypto/Node-compatible SHA-256.

- [ ] Test two workouts/day, midnight, old unknown set times, warmup/working sets, RPE/RIR, partial-day totals, secret fields excluded recursively, previous four weeks and no double addition of total/active calories.
- [ ] Test checksum rejects a changed byte, partial files, wrong profile and inconsistent watermark; interrupted write preserves the previous file.
- [ ] Run focused tests. Expected: RED.
- [ ] Implement shared summaries, raw safe whitelisted history, report export JSON/Markdown and atomic native exchange writer. Add timestamps to newly completed sets and timezone metadata to new sessions.
- [ ] Run focused/full suites and build. Expected: GREEN; export/import full state with media preserves original structure.
- [ ] Commit: `feat: export unified training nutrition and recovery history`.

## Task 5: Health Connect import and background mailbox

**Files:** native PersonalHealthPlugin and Kotlin reader/worker/mailbox, Android manifest/Gradle; frontend/src/lib/personal/{health,health-native}.js and tests; PersonalHealth.jsx and Home cards.

**Interfaces:** native `getStatus`, `requestPermissions`, `readSnapshot({origins,days})`, `scheduleSync`, `readMailbox`, `ackMailbox({generation})`, `openSettings`; `mergeHealthSnapshot(health,snapshot) -> health`; snapshot includes permissions, metric statuses, data origins, daily selected-origin aggregates, sleep intervals/stages, heart rate samples, exercises and ingestion timestamps.

- [ ] Test replay does not double steps, origin change, corrected/deleted days, unknown vs zero, midnight sleep wake-date, no stages, revoked single permission and acknowledgement race.
- [ ] Run JS tests. Expected: RED.
- [ ] Implement stable HC feature checks, granular permissions, pagination/selected origins, past-seven-day replacement and native atomic mailbox. Schedule hourly worker only with available granted background permission; launch/resume manual reads always supported.
- [ ] Implement status/source selector, last sync/permission/errors and metric cards, including explicit unavailable data and unknown off-wrist state.
- [ ] Build Android debug; run focused/full JS tests and instrumentation where feasible. Expected: GREEN; exercise denied/unavailable emulator paths. Record Mi Fitness hardware acceptance as pending.
- [ ] Commit: `feat: import Health Connect history with source and quality metadata`.

## Task 6: Progress, goals and achievements

**Files:** frontend/src/lib/personal/progress.js and tests; Stats.jsx and personal statistics components.

**Interfaces:** `calculatePersonalProgress(state,{now}) -> {nutrition,recovery,goals,achievements}`; `reconcileAwards(previous,calculated,{historicalImport}) -> awards`. Uses original 1RM/eligible-set and scheduling helpers.

- [ ] Test workout boundaries 1/10/25/50, two workouts in a day, weekly plan/rest/reschedule, warmup exclusion, 7 complete food days, 7 observed step-goal days, repeated import and source deletion revoking current qualification while retaining first award.
- [ ] Run focused test. Expected: RED.
- [ ] Implement shared progress calculations, manual goals and additional statistics sections without replacing original charts; historical imports suppress notifications.
- [ ] Run focused/full suites and browser checks. Expected: GREEN and matching exported progress values.
- [ ] Commit: `feat: add nutrition recovery goals and achievements`.

## Task 7: Weekly proposals, preview, apply and undo

**Files:** frontend/src/lib/personal/{weekly,proposal}.js and tests; WeeklyReview.jsx; session-start.js/store action consumer integration.

**Interfaces:** `planFingerprint(state) -> string`; `validateProposal(doc,state,snapshot) -> proposal`; `previewProposal(state,proposal,selectedIds) -> {before,after,nextSessions,conflicts}`; `applyProposal(state,proposal,selectedIds,{now}) -> state`; `undoProposal(state,reviewId,{now}) -> {state,conflicts}`. Allowed changes identify routine/exercise and weights/sets/reps or nutrition targets; future overrides are explicit inputs to the real session builder.

- [ ] Test wrong profile, duplicate ID, unknown changes/fields, bad units/nonfinite values, stale plan, history overriding base weight, only selected changes applied, historic data untouched, and undo detecting intervening manual edits.
- [ ] Run tests. Expected: RED.
- [ ] Implement validation, preview with actual progression, journal and conflict-aware undo. Build manual weekly report and proposal import UI with before/after, reasons and explicit Apply.
- [ ] Run focused/full suites and browser end-to-end proposal cycle. Expected: GREEN; future session shown in preview matches actual start.
- [ ] Commit: `feat: support reviewable weekly recommendations and undo`.

## Task 8: MCP file exchange for complete analysis

**Files:** mcp/src/{state,tools,index}.js and tests; mcp README; frontend native exchange suggestion picker; optional PC runner scripts and setup documentation.

**Interfaces:** `OPENGYM_ANALYSIS_FILE` chooses validated envelope file mode without db.json; existing database mode remains. New read-only tools nutrition days, health history, quality and combined weekly report expose profile/freshness. Wrong requested profile returns error.

- [ ] Test Node imports, original database compatibility, report-only startup, corrupt/checksum/wrong-profile/stale files and real tool output matching phone calculations.
- [ ] Run tests. Expected: RED.
- [ ] Implement file reader, shared reports and tools; document Data phone-to-PC/Suggestions PC-to-phone folder pairing, offline queue and fresh-data prerequisite for automation.
- [ ] Run MCP tests, node-loadable, frontend/API tests. Expected: GREEN. Automatic scheduling remains gated on an actual paired phone transfer, not inferred from fixture files.
- [ ] Commit: `feat: extend MCP with personal reports and file exchange`.

## Task 9: Personal Android identity, signing and build

**Files:** capacitor.config, Android build.gradle/strings/manifest, update.js; portable build scripts, build/migration/phone-check docs. Secrets/toolchain live outside source.

- [ ] Verify original updater cannot request/install upstream APK in personal app, personal backup directory stays distinct, import/ZIP media retains data.
- [ ] Configure app ID/name, version, supported SDK and production assets; retain original Java namespace when safe. Prepare portable JDK/SDK and a durable unique signing key outside source, with private owner delivery.
- [ ] Build signed release APK and debug/emulator app. Expected: successful Gradle output, verified apksigner signature, own app ID and version, install alongside original and same-key upgrade preserves profile.
- [ ] Verify offline launch and restore, nutrition/recipes, reports, permission handling, achievements and proposal round trip on emulator; preserve screenshots and receipts.
- [ ] Run all three test suites and mobile build. Expected: GREEN.
- [ ] Commit: `build: package signed openGym Personal Android fork`.

## Task 10: Fresh review and owner delivery

**Files:** outputs APK/source archive/checksums/private signing recovery/instructions and validation report; no secrets in source archive.

- [ ] Request one fresh whole-branch review with the accepted specs, this plan, Review Focus and execution ledger. Resolve important findings with failing regression test then passing suite.
- [ ] Verify source package license/history, APK/checksum/signature, reproducible build instructions and migration instructions against actual artifacts.
- [ ] Deliver installable APK, full source/history and private key recovery separately. List actual tests and phone-only checks accurately.
- [ ] With owner on phone, test each Mi Fitness metric and real bidirectional exchange; configure agreed weekly schedule after fresh-data confirmation. Expected: actual hardware receipts, or explicitly incomplete external setup with active goal.
- [ ] Mark full goal complete only after required hardware/data-pipeline checks; never certify fixture data as a real watch connection.
