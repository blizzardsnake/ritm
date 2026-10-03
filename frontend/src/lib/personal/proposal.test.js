import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { migratePersonalState } from './state.js'
import { buildAnalysis } from './report.js'
import { createExchangeSnapshot } from './exchange.js'
import { buildCombinedEntries } from '../session-merge.js'
import { buildCompletedWorkout } from '../finish-workout.js'
import { historyAsOf } from '../backfill.js'
import { planFingerprint, validateProposal, previewProposal, applyProposal, undoProposal, saveProposal } from './proposal.js'

const now = Date.parse('2026-10-03T12:00:00Z')
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now) })
afterEach(() => vi.useRealTimers())
function state() {
  const s = migratePersonalState({ unit: 'kg', startFrom: 'last', week: { 1: ['A'] }, dayPlan: {}, exWeights: {},
    routines: [{ id: 'A', name: 'Strength', ex: [{ id: '0025', sets: 3, reps: 5, weight: 60, warmupSets: 1 }] }],
    workouts: [], bodyweight: [] }, { profileId: 'owner', now })
  const entries = buildCombinedEntries(s, ['A']).entries.map(e => ({ ...e, sets: e.sets.map(row => ({ ...row, w: row.phase === 'warmup' ? row.w : 80, done: true })) }))
  s.workouts.push(buildCompletedWorkout({ id: 'old', d: '2026-10-02', start: now - 86400000, routineIds: ['A'], entries }, { end: now - 86399000 }))
  s.nutrition.targets = [{ id: 'default', kcal: 2400, protein: 150, fat: 80, carbs: 270, updatedAt: 1 }]
  return s
}
async function fixture() {
  const s = state(), snapshot = await createExchangeSnapshot(buildAnalysis(s, { now }))
  const doc = { format: 'ritm-weekly-proposal', formatVersion: 1, id: 'review-1', profileId: 'owner', generatedAt: now,
    analysisHash: snapshot.checksum, planHash: planFingerprint(s), window: snapshot.payload.window,
    title: 'Weekly review', summary: 'Reduce load after missed reps.', limitations: ['Sleep unavailable'],
    changes: [
      { id: 'load', type: 'exercise', routineId: 'A', exerciseId: '0025', field: 'weight', value: 72.5, unit: 'kg', reason: 'Recovery week', evidence: ['history.workouts:old'] },
      { id: 'sets', type: 'exercise', routineId: 'A', exerciseId: '0025', field: 'sets', value: 2, unit: 'sets', reason: 'Lower volume', evidence: ['summaries.workouts'] },
      { id: 'food', type: 'nutrition', field: 'protein', value: 160, unit: 'g', reason: 'Planned target', evidence: ['history.nutrition.targets'] },
    ] }
  return { s, snapshot, doc }
}
const work = entry => entry.sets.filter(row => row.phase !== 'warmup' && !row.warmup)

describe('reviewable weekly recommendations', () => {
  it('binds the report to the current future plan and detects a history-driven prescription change', async () => {
    const { s, snapshot, doc } = await fixture()
    expect(snapshot.payload.plan.fingerprint).toBe(doc.planHash)
    const p = validateProposal(doc, s, snapshot)
    const before = JSON.stringify(s)
    const preview = previewProposal(s, p, ['load', 'sets'])
    expect(preview.conflicts).toEqual([])
    expect(work(preview.nextSessions[0].entries[0]).map(row => [row.w, row.r])).toEqual([[72.5, 5], [72.5, 5]])
    expect(JSON.stringify(s)).toBe(before)
    s.workouts[0].entries[0].sets[1].w = 85
    expect(previewProposal(s, p, ['load']).conflicts.map(c => c.code)).toContain('stale_plan')
    expect(() => applyProposal(s, p, ['load'], { now })).toThrow()
  })
  it('applies only selected future fields, starts at the previewed load, keeps old workouts and meals, and is idempotent', async () => {
    const { s, snapshot, doc } = await fixture(), historical = structuredClone(s.workouts)
    s.nutrition.meals.push({ id: 'eaten', date: '2026-10-02', items: [] })
    const p = validateProposal(doc, s, snapshot)
    const after = applyProposal(s, p, ['load', 'sets'], { now })
    expect(after.routines[0].ex[0]).toMatchObject({ weight: 72.5, sets: 2 })
    expect(after.nutrition.targets[0].protein).toBe(150)
    expect(after.workouts).toEqual(historical)
    expect(after.nutrition.meals).toEqual(s.nutrition.meals)
    const entries = buildCombinedEntries(after, ['A']).entries
    expect(work(entries[0]).map(row => [row.w, row.r])).toEqual([[72.5, 5], [72.5, 5]])
    expect(entries[0].personalOverrideIds).toHaveLength(2)
    expect(applyProposal(after, p, ['load', 'sets'], { now: now + 10 }).weeklyReviews.journal).toHaveLength(1)
    // Once an actual working set has been logged, the original progression resumes.
    after.workouts.push(buildCompletedWorkout({ id: 'new', d: '2026-10-03', start: now + 1000, routineIds: ['A'],
      entries: entries.map(e => ({ ...e, sets: e.sets.map(row => ({ ...row, done: true })) })) }, { end: now + 2000 }))
    expect(work(buildCombinedEntries(after, ['A']).entries[0]).map(row => row.w)).toEqual([75, 75])
    expect(after.weeklyReviews.journal[0]).toMatchObject({ id: 'review-1', selectedIds: ['load', 'sets'], appliedAt: now })
  })
  it('never imposes a future override on a backfilled workout or after a manual exercise edit', async () => {
    const { s, snapshot, doc } = await fixture()
    const after = applyProposal(s, validateProposal(doc, s, snapshot), ['load'], { now })
    const past = historyAsOf(after, { d: '2026-10-01', start: now - 2 * 86400000 })
    expect(buildCombinedEntries(past, ['A']).entries[0].personalOverrideIds).toBeUndefined()
    after.routines[0].ex[0].weight = 90
    expect(buildCombinedEntries(after, ['A']).entries[0].personalOverrideIds).toBeUndefined()
  })
  it('undoes accepted values without rewriting history, and refuses to overwrite an intervening edit', async () => {
    const { s, snapshot, doc } = await fixture()
    const after = applyProposal(s, validateProposal(doc, s, snapshot), ['load', 'food'], { now })
    const undone = undoProposal(after, 'review-1', { now: now + 100 })
    expect(undone.conflicts).toEqual([])
    expect(undone.state.routines[0].ex[0].weight).toBe(60)
    expect(undone.state.nutrition.targets[0].protein).toBe(150)
    expect(undone.state.workouts).toEqual(s.workouts)
    expect(undone.state.weeklyReviews.journal[0].undoneAt).toBe(now + 100)
    after.nutrition.targets[0].protein = 175
    const conflict = undoProposal(after, 'review-1', { now: now + 200 })
    expect(conflict.conflicts.map(c => c.changeId)).toEqual(['food'])
    expect(conflict.state).toEqual(after)
  })
  it('rejects foreign profiles, changed snapshots, duplicate change IDs, unknown fields and invalid values', async () => {
    const { s, snapshot, doc } = await fixture()
    const invalid = [
      { ...doc, profileId: 'other' }, { ...doc, analysisHash: '0'.repeat(64) },
      { ...doc, changes: [doc.changes[0], doc.changes[0]] },
      { ...doc, changes: [{ ...doc.changes[0], command: 'delete-history' }] },
      { ...doc, changes: [{ ...doc.changes[0], type: 'delete' }] },
      { ...doc, changes: [{ ...doc.changes[0], unit: 'lb' }] },
      { ...doc, changes: [{ ...doc.changes[0], value: Infinity }] },
      { ...doc, changes: [{ ...doc.changes[1], value: 1.5 }] },
      { ...doc, changes: [{ ...doc.changes[0], exerciseId: 'unknown' }] },
    ]
    for (const bad of invalid) expect(() => validateProposal(bad, s, snapshot)).toThrow()
    const damaged = structuredClone(snapshot); damaged.payload.summaries.workouts.count++
    expect(() => validateProposal(doc, s, damaged)).toThrow()
  })
  it('allows identical reimport but refuses a different document reusing a saved ID and an apply during an active session', async () => {
    const { s, snapshot, doc } = await fixture()
    const p = validateProposal(doc, s, snapshot)
    saveProposal(s, p, { now })
    saveProposal(s, validateProposal(doc, s, snapshot), { now: now + 1 })
    expect(s.weeklyReviews.proposals).toHaveLength(1)
    expect(() => validateProposal({ ...doc, summary: 'different' }, s, snapshot)).toThrow()
    s.active = { id: 'running', entries: [] }
    expect(() => applyProposal(s, p, ['load'], { now })).toThrow()
  })
  it('keeps a previously accepted pending load when a second review changes only the set count', async () => {
    const { s, snapshot, doc } = await fixture()
    const first = applyProposal(s, validateProposal(doc, s, snapshot), ['load'], { now })
    const snapshot2 = await createExchangeSnapshot(buildAnalysis(first, { now: now + 1 }))
    const doc2 = { ...doc, id: 'review-2', analysisHash: snapshot2.checksum, planHash: planFingerprint(first), changes: [doc.changes[1]] }
    const second = applyProposal(first, validateProposal(doc2, first, snapshot2), ['sets'], { now: now + 1 })
    expect(work(buildCombinedEntries(second, ['A']).entries[0]).map(row => row.w)).toEqual([72.5, 72.5])
    expect(undoProposal(second, 'review-1', { now: now + 10 }).conflicts).not.toEqual([])
    const restored = undoProposal(second, 'review-2', { now: now + 10 })
    expect(restored.conflicts).toEqual([])
    expect(work(buildCombinedEntries(restored.state, ['A']).entries[0]).map(row => row.w)).toEqual([72.5, 72.5, 72.5])
  })
  it('exports the evidence, journal before-values and override provenance used by the next session', async () => {
    const { s, snapshot, doc } = await fixture()
    const after = applyProposal(s, validateProposal(doc, s, snapshot), ['load'], { now })
    const report = buildAnalysis(after, { now: now + 1 })
    expect(report.history.weeklyReviews.journal[0]).toMatchObject({ summary: doc.summary, window: doc.window, before: [{ changeId: 'load', present: true, value: 60 }] })
    expect(report.history.weeklyReviews.journal[0].changes[0].evidence).toEqual(['history.workouts:old'])
    expect(report.history.weeklyReviews.overrides[0]).toMatchObject({ baseHash: expect.any(String), appliedAt: now })
    expect(report.plan.nextSessions[0].entries[0].personalOverrideIds).toEqual(['override:review-1:load'])
  })
  it('rechecks restored proposal fields at apply, before changing any plan or journal', async () => {
    const { s, doc } = await fixture(), before = JSON.stringify(s)
    const bad = { ...doc, changes: [{ ...doc.changes[1], value: 0 }] }
    expect(() => applyProposal(s, bad, ['sets'], { now })).toThrow()
    expect(JSON.stringify(s)).toBe(before)
  })
  it('keeps the recorded author and can undo a new nutrition target without erasing later unrelated food targets', async () => {
    const { s, snapshot, doc } = await fixture()
    s.nutrition.targets = []
    const snap = await createExchangeSnapshot(buildAnalysis(s, { now }))
    const nextDoc = { ...doc, analysisHash: snap.checksum, planHash: planFingerprint(s) }
    const p = validateProposal(nextDoc, s, snap)
    saveProposal(s, p, { now, author: { type: 'ai', provider: 'OpenRouter', model: 'openrouter/free' } })
    const after = applyProposal(s, p, ['food'], { now })
    expect(after.weeklyReviews.journal[0].author).toMatchObject({ type: 'ai', model: 'openrouter/free' })
    after.nutrition.targets[0].kcal = 2500
    const result = undoProposal(after, p.id, { now: now + 1 })
    expect(result.conflicts).toEqual([])
    expect(result.state.nutrition.targets[0].kcal).toBe(2500)
    expect(result.state.nutrition.targets[0].protein).toBeUndefined()
    expect(result.state.nutrition.targets[0].deletedAt).toBeNull()
  })
})
