import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildAnalysis } from '../../frontend/src/lib/personal/report.js'
import { createExchangeSnapshot } from '../../frontend/src/lib/personal/exchange.js'
import { migratePersonalState } from '../../frontend/src/lib/personal/state.js'

let dir, file, S, snapshot
const now = Date.parse('2026-10-03T12:00:00Z')
beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers({ now, toFake: ['Date'] })
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ritm-mcp-test-')); file = path.join(dir, 'analysis.json')
  vi.stubEnv('OPENGYM_ANALYSIS_FILE', file); vi.stubEnv('OPENGYM_PROFILE_ID', 'owner-test')
  vi.stubEnv('OPENGYM_DATA', path.join(dir, 'no-db'))
  S = migratePersonalState({ unit: 'kg', workouts: [], routines: [], bodyweight: [], customEx: [], week: {}, dayPlan: {} }, { now, profileId: 'owner-test' })
  S.nutrition.meals = [{ id: 'food-day', date: '2026-10-02', at: now - 86400000, items: [{ name: 'Rice', grams: 100, nutrients: { kcal: 130, protein: 3, fat: 1, carbs: 28 } }] }]
  S.nutrition.dayCompleteness = [{ id: 'complete-day', date: '2026-10-02', complete: true }]
  S.health.config.origins = ['watch']; S.health.daily = [{ id: 'steps-day', date: '2026-10-02', origin: 'watch', metrics: { steps: 0 }, completedMetrics: ['steps'] }]
  snapshot = await createExchangeSnapshot(buildAnalysis(S, { from: '2026-10-02', to: '2026-10-03', now }))
  fs.writeFileSync(file, JSON.stringify(snapshot))
})
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); fs.rmSync(dir, { recursive: true, force: true }) })
const load = async () => {
  const state = await import('../src/state.js'); const { TOOLS } = await import('../src/tools.js')
  return { state, tools: Object.fromEntries(TOOLS.map(t => [t.name, t.handler])) }
}
test('starts with the analysis file and no database; every personal tool returns the exact phone summaries', async () => {
  const { state, tools } = await load(); state.init()
  expect(state.getUser().id).toBe('owner-test')
  const full = tools.get_personal_report({ profile_id: 'owner-test' })
  expect(full.report).toEqual(snapshot.payload)
  expect(full.source).toMatchObject({ mode: 'file', checksum: snapshot.checksum, generatedAt: now, verifiedCurrent: true })
  expect(tools.get_nutrition_days({}).days).toEqual(snapshot.payload.summaries.nutrition)
  expect(tools.get_health_history({}).daily).toEqual(snapshot.payload.summaries.health)
  expect(tools.get_record_quality({}).quality).toEqual(snapshot.payload.quality)
  expect(tools.get_record_quality({}).window).toEqual(snapshot.payload.window)
  expect(() => tools.list_workouts({})).toThrow(/report|snapshot/i)
})
test('rejects corrupt, modified, foreign-profile, stale and future files on the very next call', async () => {
  const { tools } = await load(); expect(tools.get_personal_report({}).report.profileId).toBe('owner-test')
  fs.writeFileSync(file, '{'); expect(() => tools.get_personal_report({})).toThrow()
  const bad = structuredClone(snapshot); bad.payload.summaries.workouts.count = 99
  fs.writeFileSync(file, JSON.stringify(bad)); expect(() => tools.get_personal_report({})).toThrow(/checksum/i)
  fs.writeFileSync(file, JSON.stringify(snapshot)); expect(() => tools.get_personal_report({ profile_id: 'other' })).toThrow(/profile/i)
  vi.setSystemTime(now + 8 * 86400000); expect(() => tools.get_personal_report({})).toThrow(/stale/i)
  vi.setSystemTime(now - 600000); expect(() => tools.get_personal_report({})).toThrow(/future/i)
  vi.setSystemTime(now); expect(tools.get_personal_report({}).report).toEqual(snapshot.payload)
})
test('pins configured profile and rejects invalid size/configuration, rather than silently answering for another owner', async () => {
  vi.stubEnv('OPENGYM_PROFILE_ID', 'foreign')
  const { tools } = await load(); expect(() => tools.get_record_quality({})).toThrow(/profile/i)
  vi.stubEnv('OPENGYM_PROFILE_ID', 'owner-test'); vi.stubEnv('OPENGYM_ANALYSIS_MAX_AGE_HOURS', 'bad')
  expect(() => tools.get_personal_report({})).toThrow(/age/i)
  vi.stubEnv('OPENGYM_ANALYSIS_MAX_AGE_HOURS', '168')
  fs.writeFileSync(file, ' '.repeat(16 * 1024 * 1024 + 1)); expect(() => tools.get_personal_report({})).toThrow(/size|large/i)
})
test('database mode retains all original tools and uses the same report calculator for new tools without changing disk', async () => {
  vi.stubEnv('OPENGYM_ANALYSIS_FILE', '')
  const { state, tools } = await load(); state._seedStateForTests(S)
  expect(tools.list_routines({}).routines).toEqual([])
  const report = tools.get_personal_report({ profile_id: 'owner-test', from: '2026-10-02', to: '2026-10-03' })
  expect(report.report).toEqual(snapshot.payload)
  expect(report.source.mode).toBe('database')
  expect(tools.get_nutrition_days({ from: '2026-10-02', to: '2026-10-03' }).days).toEqual(snapshot.payload.summaries.nutrition)
  expect(fs.readFileSync(file, 'utf8')).toBe(JSON.stringify(snapshot))
  expect(() => tools.get_personal_report({ profile_id: 'foreign' })).toThrow(/profile/i)
})
test('date requests outside a file snapshot are refused; a narrower range preserves unknowns and completeness', async () => {
  const { tools } = await load()
  expect(() => tools.get_health_history({ from: '2020-01-01', to: '2026-10-03' })).toThrow(/window|range/i)
  const day = tools.get_nutrition_days({ from: '2026-10-03', to: '2026-10-03' }).days
  expect(day).toEqual(snapshot.payload.summaries.nutrition.filter(d => d.date === '2026-10-03'))
  expect(day[0].complete).toBe(false)
  const missing = tools.get_health_history({ from: '2026-10-03', to: '2026-10-03' }).daily[0]
  expect(missing.steps).toBeNull()
})
