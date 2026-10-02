import { expect, it } from 'vitest'
import { migratePersonalState } from './state.js'
import { mergeHealthSnapshot, selectedHealthDaily } from './health.js'
import { flushHealthMailbox, drainHealthMailbox } from './health-native.js'
const health = () => ({ ...migratePersonalState({}, { now: 1 }).health, config: { origins: ['mi'], updatedAt: 1 } })
const snapshot = (time = 100) => ({ schemaVersion: 1, generation: String(time), profileId: 'owner', generatedAt: time,
  timezone: 'Europe/Moscow', window: { from: '2026-10-01', to: '2026-10-02' }, origins: ['mi'],
  permissions: { steps: true, sleep: true, heartRate: true, distance: true, activeKcal: true, totalKcal: true, activities: true },
  completedMetrics: ['steps', 'sleep', 'heartRate', 'distance', 'activeKcal', 'totalKcal', 'activities'],
  metricStatus: { steps: 'available', sleep: 'available' },
  daily: [{ date: '2026-10-01', steps: 1000, activeKcal: 100, totalKcal: 2200, distanceM: 800 }, { date: '2026-10-02', steps: 0 }],
  sleep: [{ sourceId: 'sleep1', origin: 'mi', start: Date.parse('2026-10-01T20:00:00Z'), end: Date.parse('2026-10-02T05:00:00Z'), stages: [] }],
  heartRate: [], activities: [] })
it('replay is idempotent, corrected/deleted daily values replace old values and older snapshot cannot undo correction', () => {
  const first = mergeHealthSnapshot(health(), snapshot())
  expect(mergeHealthSnapshot(first, snapshot())).toEqual(first)
  const correction = snapshot(200); correction.daily[0].steps = 1200; correction.daily[1].steps = null; correction.sleep = []
  const next = mergeHealthSnapshot(first, correction)
  expect(selectedHealthDaily(next).map(d => d.steps)).toEqual([1200, null])
  expect(next.sleep.find(s => s.sourceId === 'sleep1').deletedAt).toBe(200)
  expect(mergeHealthSnapshot(next, snapshot()).daily).toEqual(next.daily)
})
it('imports an older missing window without rolling back newer corrected days or current sync metadata', () => {
  const current = mergeHealthSnapshot(health(), snapshot(300))
  const older = snapshot(100)
  older.window = { from: '2026-09-01', to: '2026-09-01' }
  older.daily = [{ date: '2026-09-01', steps: 500 }]; older.sleep = []
  const merged = mergeHealthSnapshot(current, older)
  expect(selectedHealthDaily(merged).map(day => [day.date, day.steps])).toEqual([['2026-09-01', 500], ['2026-10-01', 1000], ['2026-10-02', 0]])
  expect(merged.status.lastSyncAt).toBe(300)
})
it('preserves source attribution, ignores an outdated selection and does not label missing/off-wrist data as zero', () => {
  const first = mergeHealthSnapshot(health(), snapshot())
  const changed = { ...first, config: { origins: ['other'], updatedAt: 150 } }
  expect(mergeHealthSnapshot(changed, snapshot(200))).toEqual(changed)
  expect(selectedHealthDaily(changed)).toEqual([])
  const other = snapshot(200); other.origins = ['other']; other.sleep = []; other.daily = [{ date: '2026-10-02', steps: 10 }]
  const next = mergeHealthSnapshot(changed, other)
  expect(next.daily.filter(day => !day.deletedAt)).toHaveLength(4)
  expect(selectedHealthDaily(next).map(day => day.steps)).toEqual([null, 10])
  expect(next.status.offWrist).toBe('unknown')
})
it('sleep belongs to wake date; an interval with no stages is not fabricated actual sleep, revoked permission retains recorded history', () => {
  const first = mergeHealthSnapshot(health(), snapshot())
  expect(first.sleep[0]).toMatchObject({ date: '2026-10-02', durationMinutes: 540, asleepMinutes: null, hasStages: false })
  const denied = snapshot(200); denied.permissions.steps = false; denied.completedMetrics = ['sleep']; denied.metricStatus.steps = 'permission_denied'; denied.daily = []
  const next = mergeHealthSnapshot(first, denied)
  expect(selectedHealthDaily(next)[0].steps).toBe(1000)
  expect(next.status.metricStatus.steps).toBe('permission_denied')
  const staged = snapshot(300); staged.sleep[0].stages = [{ start: staged.sleep[0].start, end: staged.sleep[0].start + 3600000, stage: 4 }, { start: staged.sleep[0].start + 3600000, end: staged.sleep[0].end, stage: 1 }]
  expect(mergeHealthSnapshot(next, staged).sleep[0].asleepMinutes).toBe(60)
})
it('refuses invalid measurements and records from unselected origins without modifying the previous history', () => {
  const bad = snapshot(); bad.daily[0].steps = -1
  expect(() => mergeHealthSnapshot(health(), bad)).toThrow()
  const source = snapshot(); source.sleep[0].origin = 'stranger'
  expect(() => mergeHealthSnapshot(health(), source)).toThrow()
})
it('keeps confirmed sleep unknown when the supplied stages cover only part of the interval', () => {
  const received = snapshot()
  received.sleep[0].stages = [{ start: received.sleep[0].start, end: received.sleep[0].start + 3600000, stage: 4 }]
  const record = mergeHealthSnapshot(health(), received).sleep[0]
  expect(record.asleepMinutes).toBeNull()
  expect(record.knownAsleepMinutes).toBe(60)
  expect(record.stageCoverage).toBe('partial')
})
it('mailbox commits before acknowledging and only acknowledges the read generation during a worker race', async () => {
  let state = migratePersonalState({ nutrition: { meals: [{ id: 'meal' }] } }, { now: 1, profileId: 'owner' }); state.health = health()
  let mailbox = snapshot()
  const native = { readMailbox: async () => structuredClone(mailbox), ackMailbox: async ({ generation }) => { if (generation === mailbox.generation) mailbox = null } }
  await flushHealthMailbox({ native, readState: () => state, commit: next => { state = next; mailbox = snapshot(200) } })
  expect(mailbox.generation).toBe('200')
  expect(state.nutrition.meals).toHaveLength(1)
  expect(selectedHealthDaily(state.health)[0].steps).toBe(1000)
  native.ackMailbox = async () => { throw new Error('not allowed before persistence') }
  await expect(flushHealthMailbox({ native, readState: () => state, commit: () => { throw new Error('disk full') } })).rejects.toThrow('disk full')
})
it('keeps the wake date recorded by a travelling watch instead of relabelling it with today’s phone timezone', () => {
  const received = snapshot()
  received.sleep[0].end = Date.parse('2026-10-02T01:00:00Z')
  received.sleep[0].endOffsetMinutes = -420
  expect(mergeHealthSnapshot(health(), received).sleep[0]).toMatchObject({ date: '2026-10-01', offsetMinutes: -420 })
})
it('keeps the observed source records and per-day missing status behind an aggregate', () => {
  const received = snapshot()
  received.daily[0].sourceRecords = { steps: [{ sourceId: 'step-1', origin: 'mi', start: 1, end: 2, device: { type: 6, model: 'band' } }] }
  received.daily[1].steps = null
  received.daily[1].metricStatus = { steps: 'no_data' }
  const merged = mergeHealthSnapshot(health(), received)
  expect(selectedHealthDaily(merged)[0].sourceRecords.steps[0]).toMatchObject({ sourceId: 'step-1', origin: 'mi', device: { model: 'band' } })
  expect(selectedHealthDaily(merged)[1].metricStatus.steps).toBe('no_data')
})
it('drains every queued day after a long closed-app interval and stops on a failed durable commit', async () => {
  let state = migratePersonalState({}, { profileId: 'owner' }); state.health = health()
  const queue = [snapshot(100), snapshot(200)]
  const native = { readMailbox: async () => queue[0] || {}, ackMailbox: async ({ generation }) => { if (queue[0]?.generation === generation) queue.shift() } }
  const result = await drainHealthMailbox({ native, readState: () => state, commit: next => { state = next } })
  expect(result.importedCount).toBe(2)
  expect(state.health.status.generation).toBe('200')
  queue.push(snapshot(300))
  await expect(drainHealthMailbox({ native, readState: () => state, commit: () => { throw new Error('disk full') } })).rejects.toThrow('disk full')
  expect(queue[0].generation).toBe('300')
})
it('drains a long backlog without imposing a one-year snapshot-count limit', async () => {
  let state = migratePersonalState({}, { profileId: 'owner' }); state.health = health()
  const queue = Array.from({ length: 400 }, (_, index) => snapshot(1000 + index))
  const native = { readMailbox: async () => queue[0] || {}, ackMailbox: async ({ generation }) => { if (queue[0]?.generation === generation) queue.shift() } }
  expect((await drainHealthMailbox({ native, readState: () => state, commit: next => { state = next } })).importedCount).toBe(400)
  expect(queue).toHaveLength(0)
})
