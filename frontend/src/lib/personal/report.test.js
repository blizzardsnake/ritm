import { describe, expect, it } from 'vitest'
import { migratePersonalState } from './state.js'
import { buildAnalysis, renderAnalysisMarkdown } from './report.js'
import { eventTime } from './time.js'
import { stateWatermark } from './report.js'

const now = Date.parse('2026-10-02T12:00:00Z')
function fixture() {
  return migratePersonalState({ unit: 'kg', weekStart: 1, timezone: 'Europe/Moscow',
    workouts: [
      { id: 'am', d: '2026-10-02', start: now - 3600000, end: now, name: 'Утро', entries: [{ id: 'bench', target: { sets: 2, reps: 10 }, sets: [
        { w: 20, r: 10, done: true, phase: 'warmup' },
        { w: 50, r: 10, done: true, rpe: 8, completedAt: now - 5000 },
        { w: 50, r: 8, done: false },
      ] }] },
      { id: 'pm', d: '2026-10-02', start: now + 3600000, end: now + 7200000, entries: [{ id: 'row', noProg: true, sets: [{ w: 30, r: 10, done: true, rir: 2 }] }] },
      { id: 'context', d: '2026-09-10', start: now - 22 * 86400000, entries: [] },
      { id: 'too-old', d: '2026-09-01', entries: [] },
    ], bodyweight: [{ d: '2026-10-02', w: 80, t: now }],
    routines: [{ id: 'r', name: 'План', ex: [{ id: 'bench', weight: 50, sets: 2, reps: 10, apiKey: 'secret-nested' }] }],
    apiKey: 'secret-top', coach: { token: 'secret-coach' },
  }, { now, profileId: 'owner' })
}

describe('combined analysis snapshot', () => {
  it('keeps two daily workouts, context, effort and unknown old set times, using original work volume', () => {
    const state = fixture()
    const report = buildAnalysis(state, { from: '2026-10-02', to: '2026-10-02', now })
    expect(report.history.workouts.map(w => w.id)).toEqual(['context', 'am', 'pm'])
    expect(report.summaries.workouts).toMatchObject({ count: 2, volume: 800, durationMs: 7200000 })
    expect(report.history.workouts[1].entries[0].sets[1]).toMatchObject({ rpe: 8, completedAt: now - 5000 })
    expect(report.history.workouts[2].entries[0].sets[0]).toMatchObject({ rir: 2, completedAt: null })
    expect(report.window.contextFrom).toBe('2026-09-04')
    expect(report.history.workouts[0].end).toBeNull()
    expect(JSON.stringify(state)).toContain('secret-top')
    expect(JSON.stringify(report)).not.toContain('secret-')
  })
  it('reports partial food days and missing health as unknown; total and active energy remain separate', () => {
    const state = fixture()
    state.nutrition.meals = [{ id: 'm', date: '2026-10-02', at: now, items: [{ grams: 50, food: { name: 'Еда', apiKey: 'secret-food' }, nutrients: { kcal: 75, protein: null, fat: 0, carbs: 10 } }] }]
    state.health.daily = [{ id: 'd', date: '2026-10-02', steps: 0, activeKcal: 400, totalKcal: 2400, distanceM: null, origins: ['mi'], token: 'secret-health' }]
    state.health.config.origins = ['mi']
    const report = buildAnalysis(state, { from: '2026-10-01', to: '2026-10-02', now })
    expect(report.summaries.nutrition[0]).toMatchObject({ date: '2026-10-01', totals: { kcal: null }, complete: false })
    expect(report.summaries.nutrition[1]).toMatchObject({ totals: { kcal: 75, protein: null, fat: 0 }, missing: { protein: 1 }, complete: false })
    expect(report.summaries.health[0]).toMatchObject({ steps: null, activeKcal: null, totalKcal: null })
    expect(report.summaries.health[1]).toMatchObject({ steps: 0, activeKcal: 400, totalKcal: 2400 })
    expect(report.quality).toMatchObject({ incompleteFoodDays: 2, missingHealthDays: 1, offWrist: 'unknown' })
    expect(JSON.stringify(report)).not.toContain('secret-')
    const md = renderAnalysisMarkdown(report)
    expect(md).toContain('75')
    expect(md).toContain('2400')
    expect(md).toContain('неполный')
    expect(md).not.toContain('2800')
  })
  it('uses the selected origin for summaries while retaining other sources in the auditable history', () => {
    const state = fixture()
    state.health.config.origins = ['mi']
    state.health.daily = [
      { id: 'phone-day', date: '2026-10-02', originKey: 'phone', origins: ['phone'], steps: 9000 },
      { id: 'mi-day', date: '2026-10-02', originKey: 'mi', origins: ['mi'], steps: 1234 },
    ]
    state.health.sleep = [
      { id: 'phone-sleep', date: '2026-10-02', origin: 'phone', durationMinutes: 900 },
      { id: 'mi-sleep', date: '2026-10-02', origin: 'mi', durationMinutes: 430, asleepMinutes: null },
    ]
    const report = buildAnalysis(state, { from: '2026-10-02', to: '2026-10-02', now })
    expect(report.summaries.health[0].steps).toBe(1234)
    expect(report.summaries.health[0].sleep.map(record => record.id)).toEqual(['mi-sleep'])
    expect(report.history.health.daily).toHaveLength(2)
    expect(report.history.health.sleep).toHaveLength(2)
    expect(report.history.health.daily[1].originKey).toBe('mi')
  })
  it('records local midnight and actual DST offsets, rejects malformed ranges', () => {
    expect(eventTime(Date.parse('2026-10-01T21:30:00Z'), { timezone: 'Europe/Moscow' })).toMatchObject({ date: '2026-10-02', offsetMinutes: 180 })
    expect(eventTime(Date.parse('2026-03-08T06:30:00Z'), { timezone: 'America/New_York' }).offsetMinutes).toBe(-300)
    expect(eventTime(Date.parse('2026-03-08T07:30:00Z'), { timezone: 'America/New_York' }).offsetMinutes).toBe(-240)
    expect(() => buildAnalysis(fixture(), { from: '2026-02-30', to: '2026-10-02', now })).toThrow()
    expect(() => buildAnalysis(fixture(), { from: '2026-10-03', to: '2026-10-02', now })).toThrow()
  })
  it('exports source measurements and aggregation boundaries without carrying nested secrets', () => {
    const state = fixture(); state.health.config.origins = ['mi']
    state.health.daily = [{ id: 'day', date: '2026-10-02', origins: ['mi'], steps: 10,
      sourceRecords: { steps: [{ sourceId: 'id1', origin: 'mi', start: 1, end: 2, value: 10, unit: 'count', token: 'secret-watch' }] },
      intervals: { steps: { start: 1, end: 2, origins: ['mi'], password: 'secret-interval' } } }]
    const report = buildAnalysis(state, { now })
    expect(report.history.health.daily[0].sourceRecords.steps[0]).toMatchObject({ sourceId: 'id1', value: 10, unit: 'count' })
    expect(report.history.health.daily[0].intervals.steps).toEqual({ start: 1, end: 2, origins: ['mi'] })
    expect(JSON.stringify(report)).not.toContain('secret-')
  })
  it('uses original sync/edit stamps and strips nested credentials from schedule objects', () => {
    const state = fixture()
    state._ts = now + 10
    state.workouts[0]._ts = now + 20
    state.week = { 1: ['r'], token: 'secret-week' }
    state.dayPlan = { '2026-10-02': { routineIds: ['r'], credentials: { password: 'secret-day' } } }
    expect(stateWatermark(state)).toBe(now + 20)
    expect(JSON.stringify(buildAnalysis(state, { now }))).not.toContain('secret-')
  })
})
