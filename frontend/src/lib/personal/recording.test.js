import { expect, it } from 'vitest'
import { stampSetCompletion } from './recording.js'
import { buildCompletedWorkout } from '../finish-workout.js'
import { toggleSide, setSideField } from '../workout-model.js'
it('timestamps a newly completed row/side but keeps original recording times on history edits', () => {
  const row = { done: true, w: 50, r: 10 }
  expect(stampSetCompletion(row, { now: 100 })).toMatchObject({ completedAt: 100 })
  expect(row.completedAt).toBeUndefined()
  expect(stampSetCompletion({ ...row, completedAt: 50 }, { now: 100, editing: true })).toMatchObject({ completedAt: 50, modifiedAt: 100 })
  expect(stampSetCompletion(row, { now: 100, editing: true }).completedAt).toBeUndefined()
  const side = { done: false, sides: { L: { done: true, w: 10, r: 5 }, R: { done: false, w: 10, r: 5 } } }
  expect(stampSetCompletion(side, { side: 'L', now: 100 }).sides.L.completedAt).toBe(100)
  const stamped = stampSetCompletion(side, { side: 'L', now: 100 })
  expect(toggleSide(stamped, 'R').sides.L.completedAt).toBe(100)
  expect(setSideField(stamped, 'L', 'w', 12).sides.L.completedAt).toBe(100)
})
it('the completed-workout boundary preserves new session timezone metadata', () => {
  const active = { id: 'new', d: '2026-10-02', start: 100, timezone: 'Europe/Moscow', offsetMinutes: 180, recordedAt: 100, entries: [] }
  expect(buildCompletedWorkout(active, { end: 200 })).toMatchObject({ timezone: 'Europe/Moscow', offsetMinutes: 180, recordedAt: 100 })
  expect(buildCompletedWorkout({ id: 'old', entries: [] }, { end: 200 }).timezone).toBeUndefined()
})
