import { describe, expect, it } from 'vitest'
import { migratePersonalState } from './state.js'
import { shiftDate } from './time.js'
import { calculatePersonalProgress, reconcileAwards } from './progress.js'
import { buildAnalysis } from './report.js'
import { saveProgressGoals } from './progress.js'
const now = Date.parse('2026-10-03T12:00:00Z')
const workout = (id, date = '2026-10-02', extra = {}) => ({ id, d: date, start: Date.parse(`${date}T08:00:00Z`), end: Date.parse(`${date}T09:00:00Z`),
  routineIds: ['a'], entries: [{ id: 'bench', sets: [{ done: true, w: 50, r: 10 }] }], ...extra })
const fixture = () => migratePersonalState({ unit: 'kg', timezone: 'UTC', weekStart: 1, workouts: [], bodyweight: [],
  routines: [{ id: 'a', ex: [{ id: 'bench' }] }, { id: 'b', ex: [{ id: 'row' }] }], week: {}, dayPlan: {} }, { profileId: 'owner', now: 1 })
const calculate = state => calculatePersonalProgress(state, { now })
const rule = (result, id) => result.achievements.find(item => item.id === id)
describe('personal progress and auditable achievements', () => {
  it.each([1, 10, 25, 50])('counts %i distinct saved workouts once and awards only reached milestones', count => {
    const state = fixture(); state.workouts = Array.from({ length: count }, (_, index) => workout(`w${index}`, shiftDate('2026-10-03', -index)))
    state.workouts.push(structuredClone(state.workouts[0]))
    const result = calculate(state)
    expect(result.training.totalWorkouts).toBe(count)
    for (const milestone of [1, 10, 25, 50]) expect(rule(result, `workout-${milestone}`).qualified).toBe(count >= milestone)
  })
  it('keeps two workouts in one day distinct while counting one training day and uses the original warmup/volume rules', () => {
    const state = fixture(); state.workouts = [workout('morning'), workout('evening')]
    state.workouts[0].entries[0].sets.push({ done: true, w: 1000, r: 10, phase: 'warmup' })
    expect(calculate(state).training.currentWeek).toMatchObject({ workouts: 2, trainingDays: 1, volume: 1000, workSets: 2 })
  })
  it('matches rescheduled routine slots, respects rest days and does not satisfy a combined day with only one routine', () => {
    const state = fixture(); state.week = { 1: ['a'], 3: ['a', 'b'] }; state.dayPlan = { '2026-09-28': 'rest', '2026-09-29': 'a' }
    state.workouts = [workout('moved', '2026-09-29'), workout('partial', '2026-09-30')]
    expect(calculate(state).training.plan).toMatchObject({ required: 3, completed: 2 })
    expect(rule(calculate(state), 'weekly-plan').qualified).toBe(false)
    state.workouts.push(workout('second', '2026-09-30', { routineIds: ['b'] }))
    expect(rule(calculate(state), 'weekly-plan').qualified).toBe(true)
    state.weekStart = 0
    expect(calculate(state).training.currentWeek.from).toBe('2026-09-27')
  })
  it('does not fabricate a plan award for an empty all-rest week', () => {
    const state = fixture(); state.workouts = [workout('freestyle')]
    expect(rule(calculate(state), 'weekly-plan').qualified).toBe(false)
  })
  it('does not credit a skipped routine just because its ID was carried by a combined session', () => {
    const state = fixture(); state.week = { 3: ['a', 'b'] }
    state.workouts = [workout('combined', '2026-09-30', { routineIds: ['a', 'b'], entries: [
      { id: 'bench', rid: 'a', sets: [{ done: true, w: 50, r: 10 }] }, { id: 'row', rid: 'b', sets: [{ done: false, w: 50, r: 10 }] },
    ] })]
    expect(calculate(state).training.plan.completed).toBe(1)
    state.workouts[0].entries[1].sets[0].done = true
    expect(calculate(state).training.plan.completed).toBe(2)
  })
  it('recomputes confirmed records from eligible work, excluding warmups and progression-excluded entries', () => {
    const state = fixture(); state.workouts = [workout('base', '2026-09-29'), workout('later', '2026-09-30')]
    state.workouts[1].entries[0].sets.push({ done: true, w: 1000, r: 10, phase: 'warmup' })
    expect(rule(calculate(state), 'first-pr').qualified).toBe(false)
    state.workouts[1].entries[0].sets[0].w = 55
    expect(rule(calculate(state), 'first-pr').qualified).toBe(true)
    state.workouts[1].entries[0].noProg = true
    expect(rule(calculate(state), 'first-pr').qualified).toBe(false)
  })
  it('requires seven complete food days and seven observed selected-source step-goal days; missing values and unselected phone data do not qualify', () => {
    const state = fixture(); state.health.config.origins = ['mi']
    state.progressGoals.goals = [{ id: 'steps', type: 'steps', value: 8000, updatedAt: 1 }]
    for (let index = 0; index < 7; index++) {
      const date = shiftDate('2026-10-03', -index)
      state.nutrition.meals.push({ id: `meal${index}`, date, items: [{ nutrients: { kcal: 500, protein: 20, fat: 10, carbs: 60 } }] })
      state.nutrition.dayCompleteness.push({ id: `day${index}`, date, complete: true })
      state.health.daily.push({ id: `watch${index}`, date, origins: ['mi'], steps: index === 0 ? null : 8000 })
      state.health.daily.push({ id: `phone${index}`, date, origins: ['phone'], steps: 99999 })
    }
    expect(rule(calculate(state), 'food-7').qualified).toBe(true)
    expect(rule(calculate(state), 'steps-7').qualified).toBe(false)
    state.health.daily[0].steps = 8000
    expect(rule(calculate(state), 'steps-7').qualified).toBe(true)
    state.nutrition.dayCompleteness[0].complete = false
    expect(rule(calculate(state), 'food-7').qualified).toBe(false)
  })
  it('replays historical imports without duplicate awards or notifications, revokes current qualification after source deletion, and retains the first award', () => {
    const state = fixture(); state.workouts = [workout('one')]
    const first = reconcileAwards([], calculate(state), { now, historicalImport: true })
    expect(first).toHaveLength(1); expect(first[0]).toMatchObject({ id: 'award:workout-1', qualified: true, firstAwardedAt: now, notifiedAt: null })
    expect(reconcileAwards(first, calculate(state), { now: now + 1, historicalImport: true })).toEqual(first)
    state.workouts[0].deletedAt = now + 2
    const revoked = reconcileAwards(first, calculate(state), { now: now + 3, historicalImport: true })
    expect(revoked[0]).toMatchObject({ qualified: false, firstAwardedAt: now })
    expect(state.workouts[0].deletedAt).toBe(now + 2)
  })
  it('shows owner targets from the existing nutrition/weight settings and persists ordinary goal fields without a JSON editor', () => {
    const state = fixture()
    saveProgressGoals(state, { workouts: 3, steps: 8000, foodDays: 5, bodyweight: 80, kcal: 2400, protein: 140, fat: null, carbs: null }, { now })
    expect(state.targetW).toBe(80)
    expect(state.nutrition.targets.find(item => item.id === 'default').kcal).toBe(2400)
    expect(calculate(state).goals.find(goal => goal.type === 'steps')).toMatchObject({ target: 8000, actual: null, met: null })
    state.nutrition.targets[0].kcal = 2500
    expect(calculate(state).goals.find(goal => goal.type === 'kcal').target).toBe(2500)
    saveProgressGoals(state, { steps: null, workouts: 2 }, { now: now + 1 })
    expect(calculate(state).goals.find(goal => goal.type === 'steps').target).toBeNull()
    expect(() => saveProgressGoals(state, { foodDays: 8 }, { now })).toThrow()
  })
  it('compares observed days, excludes incomplete food from averages, and shares the exact same calculation with exports', () => {
    const state = fixture()
    state.health.config.origins = ['mi']
    state.health.daily = [{ id: 'zero', date: '2026-10-02', origins: ['mi'], steps: 0 }]
    state.nutrition.meals = [{ id: 'partial', date: '2026-10-02', items: [{ nutrients: { kcal: 500, protein: null, fat: 10, carbs: 60 } }] }]
    state.nutrition.dayCompleteness = [{ date: '2026-10-02', complete: true }]
    expect(calculate(state).nutrition.currentWeek).toMatchObject({ recordedDays: 1, completeDays: 0, averages: { kcal: null } })
    expect(calculate(state).recovery.currentWeek.steps).toEqual({ average: 0, days: 1 })
    expect(calculate(state).recovery.currentWeek.sleepMinutes).toEqual({ average: null, days: 0 })
    expect(buildAnalysis(state, { now }).summaries.progress).toEqual(calculate(state))
  })
  it('retains qualification for a previously completed week and loses it when one of its underlying sessions is removed', () => {
    const state = fixture(); state.week = { 1: ['a'] }
    state.workouts = [workout('previous', '2026-09-21')]
    expect(rule(calculate(state), 'weekly-plan').qualified).toBe(true)
    state.workouts[0].deletedAt = now
    expect(rule(calculate(state), 'weekly-plan').qualified).toBe(false)
  })
})
