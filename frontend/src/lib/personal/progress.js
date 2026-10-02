import { entryExcluded, effectiveRoutines, workoutDay, workoutVolume, workSetsDone } from '../history.js'
import { weekKey, weekStartOf } from '../format.js'
import { bestSetOf } from '../onerm.js'
import { NUTRIENT_KEYS, summarizeNutritionDay } from './nutrition.js'
import { summarizeHealthDay } from './health.js'
import { datesBetween, eventTime, shiftDate, validDate } from './time.js'
import { setNutritionTargets } from './store-actions.js'

export const PROGRESS_RULE_VERSION = 1
export const PROGRESS_GOAL_TYPES = Object.freeze(['workouts', 'steps', 'foodDays', 'bodyweight', ...NUTRIENT_KEYS])
const live = rows => (rows || []).filter(row => row && !row.deletedAt)
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
const stamp = row => Math.max(row.updatedAt || 0, row._ts || 0, row.t || 0, row.deletedAt || 0)
// Imported copies with the same stable identity represent one event. A newer
// deletion also wins before filtering, so an older live copy cannot earn an award.
function distinct(rows) {
  const result = new Map()
  for (const [index, row] of (rows || []).entries()) {
    if (!row) continue
    const key = row.id || `legacy:${index}`
    if (!result.has(key) || stamp(row) >= stamp(result.get(key))) result.set(key, row)
  }
  return live([...result.values()])
}
export function validateProgressGoal(goal) {
  if (!PROGRESS_GOAL_TYPES.includes(goal?.type) || finite(goal.value) == null || goal.value <= 0) throw new Error('Invalid progress goal')
  if (['steps', 'workouts', 'foodDays'].includes(goal.type) && !Number.isInteger(goal.value)) throw new Error('Use a whole number')
  if (goal.type === 'foodDays' && goal.value > 7) throw new Error('A week has seven days')
  if (goal.from && !validDate(goal.from) || goal.to && !validDate(goal.to) || goal.from && goal.to && goal.from > goal.to) throw new Error('Invalid goal dates')
  if (goal.type === 'bodyweight' && !['kg', 'lb'].includes(goal.unit)) throw new Error('Invalid weight unit')
  return goal
}
function currentGoals(state, date) {
  const result = {}
  for (const goal of live(state.progressGoals?.goals).sort((a, b) => stamp(a) - stamp(b))) {
    if (goal.from && goal.from > date || goal.to && goal.to < date) continue
    try { validateProgressGoal(goal); result[goal.type] = goal } catch { /* malformed legacy/imported goals remain unset */ }
  }
  const nutrition = live(state.nutrition?.targets).find(row => row.id === 'default')
  for (const type of NUTRIENT_KEYS) if (nutrition) {
    delete result[type]
    if (finite(nutrition[type]) > 0) result[type] = { id: 'default', type, value: nutrition[type], unit: type === 'kcal' ? 'kcal' : 'g' }
  }
  if (finite(state.targetW) > 0) result.bodyweight = { id: 'targetW', type: 'bodyweight', value: state.targetW, unit: state.unit || 'kg' }
  return result
}
export function saveProgressGoals(state, values, { now = Date.now() } = {}) {
  // Validate the entire draft before mutating it; a rejected field cannot leave
  // half a saved goal form behind, even for callers outside the store clone.
  const drafts = ['workouts', 'steps', 'foodDays'].map(type => ({ id: `goal:${type}`, type, value: values[type] ?? null }))
  for (const draft of drafts) if (draft.value != null) validateProgressGoal(draft)
  if (values.bodyweight != null) validateProgressGoal({ type: 'bodyweight', value: values.bodyweight, unit: state.unit || 'kg' })
  for (const type of NUTRIENT_KEYS) if (values[type] != null) validateProgressGoal({ type, value: values[type] })
  for (const draft of drafts) {
    for (const old of state.progressGoals.goals) if (old.type === draft.type && old.id !== draft.id && !old.deletedAt) { old.deletedAt = now; old.updatedAt = now }
    const index = state.progressGoals.goals.findIndex(goal => goal.id === draft.id)
    const old = state.progressGoals.goals[index]
    if (draft.value == null && !old) continue
    const saved = { ...draft, createdAt: old?.createdAt ?? now, updatedAt: now, deletedAt: draft.value == null ? now : null }
    if (index < 0) state.progressGoals.goals.push(saved); else state.progressGoals.goals[index] = saved
  }
  state.targetW = values.bodyweight ?? null
  setNutritionTargets(state, Object.fromEntries(NUTRIENT_KEYS.map(type => [type, values[type] ?? null])), { now })
}
function trainingWeek(state, workouts, from, today) {
  const to = shiftDate(from, 6)
  const rows = workouts.filter(workout => workoutDay(workout) >= from && workoutDay(workout) <= to && workoutDay(workout) <= today)
  const slots = datesBetween(from, to).flatMap(date => effectiveRoutines({ ...state, routines: live(state.routines), dayPlan: state.dayPlan || {}, week: state.week || {} }, date)
    .filter(routine => routine.ex?.length).map(routine => ({ date, routineId: routine.id })))
  const completed = slots.filter(slot => rows.some(workout => {
    if (workoutDay(workout) !== slot.date) return false
    const ids = workout.routineIds || (workout.routineId ? [workout.routineId] : [...new Set((workout.entries || []).map(entry => entry.rid).filter(Boolean))])
    if (!ids.includes(slot.routineId)) return false
    if ((workout.entries || []).some(entry => entry.rid)) return (workout.entries || []).some(entry => entry.rid === slot.routineId && workSetsDone({ entries: [entry] }) > 0)
    // Older single-routine history has no entry.rid. A combined session without
    // provenance cannot prove that every advertised routine was actually done.
    return ids.length === 1
  })).length
  return { from, to, through: today < to ? today : to, workouts: rows.length, trainingDays: new Set(rows.map(workoutDay)).size,
    volume: rows.reduce((sum, workout) => sum + workoutVolume(workout), 0), workSets: rows.reduce((sum, workout) => sum + workSetsDone(workout), 0),
    plan: { required: slots.length, completed } }
}
function foodWeek(state, from, to) {
  const days = datesBetween(from, to).map(date => summarizeNutritionDay(state.nutrition, date))
  const complete = days.filter(day => day.complete && NUTRIENT_KEYS.every(key => day.missing[key] === 0))
  return { from, to, recordedDays: days.filter(day => day.itemCount > 0).length, completeDays: complete.length,
    totals: Object.fromEntries(NUTRIENT_KEYS.map(key => { const known = days.map(day => day.totals[key]).filter(value => value != null); return [key, known.length ? known.reduce((sum, value) => sum + value, 0) : null] })),
    averages: Object.fromEntries(NUTRIENT_KEYS.map(key => [key, mean(complete.map(day => day.totals[key]))])), days }
}
function recoveryWeek(state, from, to) {
  const days = datesBetween(from, to).map(date => summarizeHealthDay(state.health, date))
  const steps = days.map(day => finite(day.steps)).filter(value => value != null)
  const sleep = days.map(day => finite(day.sleep.asleepMinutes)).filter(value => value != null)
  const weights = datesBetween(from, to).map(date => live(state.bodyweight).filter(row => row.d === date && finite(row.w) > 0)
    .sort((a, b) => stamp(a) - stamp(b)).at(-1)?.w).filter(value => value != null)
  return { from, to, origins: [...(state.health?.config?.origins || [])], steps: { average: mean(steps), days: steps.length },
    sleepMinutes: { average: mean(sleep), days: sleep.length }, bodyweight: { average: mean(weights), days: weights.length, unit: state.unit || 'kg' } }
}
function recordsOf(workouts) {
  const best = new Map(), records = []
  for (const workout of workouts) {
    const candidates = new Map()
    for (const entry of workout.entries || []) {
      if (entryExcluded(workout, entry)) continue
      const candidate = bestSetOf(entry)
      if (candidate && (!candidates.has(entry.id) || candidate.est > candidates.get(entry.id).est)) candidates.set(entry.id, candidate)
    }
    // All entries in a workout compare with prior workouts, never with another
    // duplicate entry of the same current session.
    for (const [id, candidate] of candidates) {
      if (best.has(id) && candidate.est > best.get(id)) records.push({ workoutId: workout.id, date: workoutDay(workout), exerciseId: id, estimate: candidate.est, previous: best.get(id) })
      best.set(id, Math.max(best.get(id) || 0, candidate.est))
    }
  }
  return records
}
export function calculatePersonalProgress(state, { now = Date.now() } = {}) {
  const today = eventTime(now, { timezone: state.personalProfile?.timezone ?? state.timezone }).date
  const from = weekKey(today, weekStartOf(state)), previousFrom = shiftDate(from, -7), previousTo = shiftDate(from, -1)
  const workouts = distinct(state.workouts).filter(workout => validDate(workoutDay(workout)) && workoutDay(workout) <= today && workSetsDone(workout) > 0)
    .sort((a, b) => workoutDay(a).localeCompare(workoutDay(b)) || (a.start || 0) - (b.start || 0) || String(a.id).localeCompare(String(b.id)))
  const currentWeek = trainingWeek(state, workouts, from, today), previousWeek = trainingWeek(state, workouts, previousFrom, today)
  const nutrition = { currentWeek: foodWeek(state, from, today), previousWeek: foodWeek(state, previousFrom, previousTo) }
  const recovery = { currentWeek: recoveryWeek(state, from, today), previousWeek: recoveryWeek(state, previousFrom, previousTo) }
  const configured = currentGoals(state, today)
  const weight = live(state.bodyweight).filter(row => validDate(row.d) && row.d <= today && finite(row.w) > 0).sort((a, b) => a.d.localeCompare(b.d) || stamp(a) - stamp(b)).at(-1)
  const goals = PROGRESS_GOAL_TYPES.map(type => {
    const goal = configured[type]
    let actual = type === 'workouts' ? currentWeek.workouts : type === 'steps' ? finite(summarizeHealthDay(state.health, today).steps)
      : type === 'foodDays' ? nutrition.currentWeek.completeDays : type === 'bodyweight' ? weight?.w ?? null : nutrition.currentWeek.averages[type]
    if (type === 'bodyweight' && goal && weight && (state.unit || 'kg') !== goal.unit) actual *= goal.unit === 'lb' ? 2.2046226218487757 : 1 / 2.2046226218487757
    const target = goal?.value ?? null
    return { type, id: goal?.id ?? null, target, actual, unit: goal?.unit ?? (type === 'bodyweight' ? state.unit || 'kg' : type === 'kcal' ? 'kcal' : NUTRIENT_KEYS.includes(type) ? 'g' : null),
      progress: target == null || actual == null ? null : actual / target,
      // Weight/nutrition are a comparison with an owner target, not a reward
      // for dropping below it or eating less.
      met: target == null || actual == null || type === 'bodyweight' || NUTRIENT_KEYS.includes(type) ? null : actual >= target }
  })
  const foodDates = [...new Set(live(state.nutrition?.dayCompleteness).filter(row => row.complete && validDate(row.date) && row.date <= today).map(row => row.date))]
    .filter(date => { const day = summarizeNutritionDay(state.nutrition, date); return day.complete && NUTRIENT_KEYS.every(key => day.missing[key] === 0) })
  const stepDates = [...new Set(live(state.health?.daily).map(row => row.date).filter(date => validDate(date) && date <= today))]
    .filter(date => { const target = currentGoals(state, date).steps?.value; const steps = finite(summarizeHealthDay(state.health, date).steps); return target != null && steps != null && steps >= target })
  const weeks = [...new Set([from, ...workouts.map(workout => weekKey(workoutDay(workout), weekStartOf(state)))])].map(start => trainingWeek(state, workouts, start, today))
  const completedWeek = weeks.find(week => week.plan.required > 0 && week.plan.completed === week.plan.required)
  const records = recordsOf(workouts)
  const achievement = (id, value, target, evidence = []) => ({ id, ruleVersion: PROGRESS_RULE_VERSION, progress: value, target, qualified: value >= target, evidence })
  const achievements = [
    ...[1, 10, 25, 50].map(count => achievement(`workout-${count}`, workouts.length, count, workouts.slice(0, count).map(workout => workout.id))),
    achievement('weekly-plan', completedWeek ? completedWeek.plan.completed : currentWeek.plan.completed, completedWeek ? completedWeek.plan.required : Math.max(1, currentWeek.plan.required), completedWeek ? [completedWeek.from] : []),
    achievement('first-pr', records.length, 1, records.slice(0, 1)),
    achievement('food-7', foodDates.length, 7, foodDates.slice(0, 7)), achievement('steps-7', stepDates.length, 7, stepDates.slice(0, 7)),
  ]
  return { ruleVersion: PROGRESS_RULE_VERSION, asOf: today, training: { totalWorkouts: workouts.length, currentWeek, previousWeek, plan: currentWeek.plan, records }, nutrition, recovery, goals, achievements }
}
export function reconcileAwards(previous = [], calculated, { now = Date.now(), historicalImport = false } = {}) {
  const result = structuredClone(previous)
  for (const rule of calculated.achievements) {
    const id = `award:${rule.id}`, index = result.findIndex(award => award.id === id)
    if (index < 0) {
      if (rule.qualified) result.push({ id, kind: rule.id, ruleVersion: rule.ruleVersion, qualified: true, firstAwardedAt: now, createdAt: now, updatedAt: now, notifiedAt: historicalImport ? null : now })
    } else if (result[index].qualified !== rule.qualified || result[index].ruleVersion !== rule.ruleVersion) {
      result[index] = { ...result[index], qualified: rule.qualified, ruleVersion: rule.ruleVersion, updatedAt: now }
    }
  }
  return result
}
export function refreshProgressAwards(store, { now = Date.now() } = {}) {
  const state = store.getState().S
  if (!state.personalProfile?.id || !state.progressGoals) return
  const awards = reconcileAwards(state.progressGoals.awards, calculatePersonalProgress(state, { now }), { now, historicalImport: true })
  if (JSON.stringify(awards) === JSON.stringify(state.progressGoals.awards)) return
  store.getState().updatePersonal(fresh => {
    fresh.progressGoals.awards = reconcileAwards(fresh.progressGoals.awards, calculatePersonalProgress(fresh, { now }), { now, historicalImport: true })
  })
}
