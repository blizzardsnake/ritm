import { expect, it } from 'vitest'
import { migratePersonalState } from './state.js'
import { summarizeHealthDay } from './health.js'
const fixture = () => { const health = migratePersonalState({}).health; health.config.origins = ['mi']; return health }
const start = Date.parse('2026-10-02T00:00:00Z'), minute = 60000
it('keeps missing values distinct from observed zero and excludes phone and deleted measurements', () => {
  const health = fixture()
  health.daily = [{ date: '2026-10-02', origins: ['phone'], steps: 9000 }, { date: '2026-10-02', origins: ['mi'], steps: 0, activeKcal: null, updatedAt: 4 }]
  const result = summarizeHealthDay(health, '2026-10-02')
  expect(result.steps).toBe(0); expect(result.activeKcal).toBeNull(); expect(result.sleep.asleepMinutes).toBeNull()
  expect(result.offWrist).toBe('unknown')
})
it('unions overlapping sleep intervals and stages without double counting; incomplete stages are explicitly unknown', () => {
  const health = fixture()
  const record = (id, offset = 0) => ({ id, sourceId: id, origin: 'mi', date: '2026-10-02', start: start + offset * minute, end: start + (offset + 120) * minute,
    stages: [{ start: start + offset * minute, end: start + (offset + 60) * minute, stage: 4 }, { start: start + (offset + 60) * minute, end: start + (offset + 120) * minute, stage: 1 }] })
  health.sleep = [record('a'), record('duplicate')]
  expect(summarizeHealthDay(health, '2026-10-02').sleep).toMatchObject({ intervalMinutes: 120, asleepMinutes: 60, knownAsleepMinutes: 60, coverage: 'complete' })
  health.sleep.push({ ...record('unstaged', 180), stages: [] })
  expect(summarizeHealthDay(health, '2026-10-02').sleep).toMatchObject({ intervalMinutes: 240, asleepMinutes: null, knownAsleepMinutes: 60, coverage: 'partial' })
})
it('uses only selected-origin heart-rate samples on their actual day, retains provenance, and skips tombstones', () => {
  const health = fixture()
  health.heartRate = [{ origin: 'mi', sourceId: 'hr1', timezone: 'UTC', samples: [{ at: start - minute, bpm: 999 }, { at: start, bpm: 60 }, { at: start + minute, bpm: 80 }] },
    { origin: 'phone', samples: [{ at: start, bpm: 300 }] }, { origin: 'mi', deletedAt: 1, samples: [{ at: start, bpm: 100 }] }]
  const result = summarizeHealthDay(health, '2026-10-02')
  expect(result.heartRate).toMatchObject({ count: 2, min: 60, max: 80, mean: 70 })
  expect(result.heartRate.sources).toEqual([{ origin: 'mi', sourceId: 'hr1' }])
})
