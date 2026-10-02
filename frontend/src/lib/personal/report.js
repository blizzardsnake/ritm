import { workoutDay, workoutDuration, workoutVolume } from '../history.js'
import { buildSessionEntries } from '../session-start.js'
import { NUTRIENT_KEYS, summarizeNutritionDay } from './nutrition.js'
import { PERSONAL_RECORDS } from './state.js'
import { eventTime, validDate } from './time.js'

export const ANALYSIS_FORMAT = 'opengym-personal-analysis'
export const ANALYSIS_VERSION = 1
const live = records => (Array.isArray(records) ? records : []).filter(item => item && !item.deletedAt)
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null
const pick = (obj, keys) => Object.fromEntries(keys.filter(key => obj?.[key] !== undefined).map(key => [key, structuredClone(obj[key])]))
const META = ['id', 'createdAt', 'updatedAt', 'deletedAt', 'recordedAt', 'modifiedAt', '_ts']
const CLOCK = ['at', 'date', 'timezone', 'offsetMinutes', 'start', 'end', 'startOffsetMinutes', 'endOffsetMinutes']
const CFG = ['id', 'sets', 'reps', 'repsMin', 'repsMax', 'weight', 'sec', 'min', 'speed', 'mode', 'rest', 'inc', 'side', 'bodyweight', 'policy', 'prog', 'deloadFactor', 'warmupSets', 'sg', 'note', 'warmup', 'intensifier', 'drops', 'clusters', 'noProg', 'excludeFromProgression']
const nutrients = value => Object.fromEntries(NUTRIENT_KEYS.map(key => [key, finite(value?.[key])]))
function safeSet(row) {
  const result = pick(row, ['w', 'r', 'sec', 'min', 'speed', 'done', 'phase', 'warmup', 'mode', 'type', 'rir', 'rpe', 'modifiedAt'])
  result.completedAt = finite(row?.completedAt)
  if (row?.drops) result.drops = row.drops.map(item => pick(item, ['w', 'r']))
  if (row?.clusters) result.clusters = row.clusters.map(item => pick(item, ['r', 'restSec']))
  if (row?.sides) result.sides = Object.fromEntries(['L', 'R'].map(key => [key, safeSet(row.sides[key])]))
  return result
}
const safeCfg = obj => {
  const result = pick(obj, CFG.filter(key => !['warmup', 'intensifier', 'drops', 'clusters'].includes(key)))
  if (obj?.warmup && typeof obj.warmup === 'object') result.warmup = pick(obj.warmup, ['sets', 'reps', 'percent', 'on'])
  if (obj?.intensifier) result.intensifier = pick(obj.intensifier, ['type', 'count', 'pct', 'totalReps', 'restSec'])
  return result
}
function safeEntry(entry) {
  return { ...pick(entry, ['id', 'rid', 'noProg', 'topW', 'sg', 'note', 'notePin']),
    target: entry.target ? safeCfg(entry.target) : null, planned: entry.planned ? safeCfg(entry.planned) : null,
    sets: (entry.sets || []).map(safeSet) }
}
function safeWorkout(workout) {
  return { ...pick(workout, [...META, ...CLOCK, 'd', 'routineId', 'routineIds', 'name', 'bw', 'note', 'excludeFromProgression']),
    start: finite(workout.start), end: finite(workout.end), timezone: workout.timezone ?? null,
    entries: (workout.entries || []).map(safeEntry),
    prs: (workout.prs || []).map(pr => typeof pr === 'string' ? pr : pick(pr, ['id', 'w', 'r', 'value', 'type'])) }
}
function safeSource(source, depth = 0) {
  if (!source || depth > 3) return null
  const result = pick(source, ['type', 'dataset', 'datasetSha256', 'fdcId', 'dataType', 'originalName', 'version', 'inputSha256', 'url', 'license', 'barcode', 'fetchedAt', 'updatedAt', 'packageName'])
  if (source.basedOn) result.basedOn = safeSource(source.basedOn, depth + 1)
  return result
}
function safeFood(food, depth = 0) {
  if (!food || depth > 4) return null
  const result = { ...pick(food, [...META, 'name', 'brand', 'barcode', 'basis', 'preparation', 'densityGPerMl', 'finalGrams']), nutrients: nutrients(food.nutrients), source: safeSource(food.source) }
  if (food.ingredients) result.ingredients = food.ingredients.map(item => safeItem(item, depth + 1))
  return result
}
function safeItem(item, depth = 0) {
  return { ...pick(item, ['id', 'foodId', 'grams']), food: safeFood(item.food, depth), nutrients: nutrients(item.nutrients) }
}
function safeHealth(health, inWindow) {
  return {
    daily: live(health?.daily).filter(inWindow).map(item => pick(item, [...META, ...CLOCK, 'steps', 'activeKcal', 'totalKcal', 'distanceM', 'origins', 'metricStatus', 'permissions', 'ingestedAt', 'generation'])),
    sleep: live(health?.sleep).filter(inWindow).map(item => ({ ...pick(item, [...META, ...CLOCK, 'origin', 'sourceId', 'title', 'ingestedAt', 'durationMinutes', 'asleepMinutes', 'hasStages']), stages: (item.stages || []).map(stage => pick(stage, ['start', 'end', 'stage'])) })),
    heartRate: live(health?.heartRate).filter(inWindow).map(item => ({ ...pick(item, [...META, ...CLOCK, 'origin', 'sourceId', 'ingestedAt']), samples: (item.samples || []).map(sample => pick(sample, ['at', 'bpm'])) })),
    activities: live(health?.activities).filter(inWindow).map(item => pick(item, [...META, ...CLOCK, 'origin', 'sourceId', 'ingestedAt', 'title', 'exerciseType', 'linkedWorkoutId'])),
    config: pick(health?.config, ['origins', 'background', 'updatedAt']),
    status: pick(health?.status, ['updatedAt', 'lastSyncAt', 'availability', 'permissions', 'metricStatus', 'origins', 'error', 'background', 'generation']),
  }
}
function safeChange(change) {
  return pick(change, ['id', 'type', 'routineId', 'exerciseId', 'field', 'value', 'before', 'after', 'reason', 'unit'])
}
function safeReview(review) {
  return { ...pick(review, [...META, 'profileId', 'analysisHash', 'planHash', 'title', 'reason', 'status', 'appliedAt', 'undoneAt', 'selectedIds']),
    changes: (review.changes || []).map(safeChange) }
}
export function stateWatermark(state) {
  let watermark = Math.max(finite(state?._ts) ?? 0, finite(state?.personalProfile?.updatedAt) ?? 0, finite(state?.health?.status?.updatedAt) ?? 0)
  for (const record of [...(state.workouts || []), ...(state.routines || []), ...(state.bodyweight || [])]) watermark = Math.max(watermark, finite(record._ts) ?? 0, finite(record.t) ?? 0)
  for (const [section, fields] of Object.entries(PERSONAL_RECORDS)) for (const field of fields)
    for (const record of state[section]?.[field] || []) watermark = Math.max(watermark, finite(record.updatedAt) ?? 0, finite(record.deletedAt) ?? 0)
  return watermark
}
export const shiftDate = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10)
export function datesBetween(from, to) {
  const result = []
  for (let date = from; date <= to; date = shiftDate(date, 1)) result.push(date)
  return result
}

export function buildAnalysis(state, { from, to, now = Date.now(), timezone } = {}) {
  const clock = eventTime(now, { timezone: timezone ?? state.personalProfile?.timezone ?? state.timezone })
  to ??= clock.date
  from ??= shiftDate(to, -6)
  if (!validDate(from) || !validDate(to) || from > to) throw new Error('Некорректный период отчёта')
  if (!state.personalProfile?.id) throw new Error('Отсутствует ID профиля')
  const contextFrom = shiftDate(from, -28)
  const inWindow = record => validDate(record.date || record.d) && (record.date || record.d) >= contextFrom && (record.date || record.d) <= to
  const workouts = live(state.workouts).filter(w => { const day = workoutDay(w); return day >= contextFrom && day <= to }).sort((a, b) => workoutDay(a).localeCompare(workoutDay(b)) || (a.start || 0) - (b.start || 0))
  const selected = workouts.filter(w => workoutDay(w) >= from)
  const health = safeHealth(state.health, inWindow)
  const days = datesBetween(from, to)
  const dailyFood = days.map(date => ({ date, ...summarizeNutritionDay(state.nutrition, date) }))
  const dailyHealth = days.map(date => {
    const day = health.daily.find(item => item.date === date)
    return { date, steps: finite(day?.steps), activeKcal: finite(day?.activeKcal), totalKcal: finite(day?.totalKcal), distanceM: finite(day?.distanceM), origins: day?.origins || [],
      sleep: health.sleep.filter(item => item.date === date), observed: !!day }
  })
  const routines = live(state.routines).map(routine => ({ ...pick(routine, ['id', 'name', 'emoji', 'excludeFromProgression', 'policy', 'prog']), ex: (routine.ex || []).map(safeCfg) }))
  return stripCredentials({
    format: ANALYSIS_FORMAT, formatVersion: ANALYSIS_VERSION, generatedAt: now,
    profileId: state.personalProfile.id, profile: pick(state.personalProfile, ['id', 'createdAt', 'observationStartedAt']),
    window: { from, to, contextFrom }, timezone: clock.timezone,
    units: { weight: state.unit || 'kg', foodMass: 'g', energy: 'kcal', distance: 'm' }, watermark: stateWatermark(state),
    history: {
      workouts: workouts.map(safeWorkout), activeWorkout: state.active ? safeWorkout(state.active) : null,
      nutrition: { meals: live(state.nutrition?.meals).filter(inWindow).map(meal => ({ ...pick(meal, [...META, ...CLOCK, 'name', 'note', 'planId', 'planMealId']), items: (meal.items || []).map(item => safeItem(item)) })),
        mealPlans: live(state.nutrition?.mealPlans).map(plan => ({ ...pick(plan, [...META, 'name', 'note', 'from', 'to']), targets: nutrients(plan.targets),
          days: (plan.days || []).map(day => ({ ...pick(day, ['id', 'date', 'weekday']), meals: (day.meals || []).map(meal => ({ ...pick(meal, ['id', 'name', 'time', 'note']), items: (meal.items || []).map(item => safeItem(item)) })) })) })),
        foods: live(state.nutrition?.foods).map(food => safeFood(food)), recipes: live(state.nutrition?.recipes).map(food => safeFood(food)),
        dayCompleteness: live(state.nutrition?.dayCompleteness).filter(inWindow).map(item => pick(item, [...META, 'date', 'complete'])),
        targets: live(state.nutrition?.targets).map(item => ({ ...pick(item, META), ...nutrients(item) })) },
      bodyweight: live(state.bodyweight).filter(inWindow).map(item => pick(item, ['d', 'w', 't'])), health,
      goals: live(state.progressGoals?.goals).map(goal => pick(goal, [...META, 'type', 'name', 'value', 'unit', 'from', 'to'])),
      awards: (state.progressGoals?.awards || []).map(award => pick(award, [...META, 'kind', 'firstAwardedAt', 'qualified', 'notifiedAt'])),
      weeklyReviews: { proposals: (state.weeklyReviews?.proposals || []).map(safeReview), journal: (state.weeklyReviews?.journal || []).map(safeReview), overrides: live(state.weeklyReviews?.overrides).map(item => ({ ...pick(item, [...META, 'routineId', 'exerciseId', 'field', 'value', 'unit', 'reviewId']), })) },
    },
    plan: { routines, week: structuredClone(state.week || {}), dayPlan: structuredClone(state.dayPlan || {}), weekStart: state.weekStart ?? 1,
      customExercises: (state.customEx || []).map(ex => pick(ex, ['id', 'name', 'bodyPart', 'equipment', 'target', 'secondaryMuscles', 'mode'])),
      nextSessions: live(state.routines).map(routine => ({ routineId: routine.id, entries: buildSessionEntries(state, routine).map(safeEntry) })) },
    summaries: { workouts: { count: selected.length, volume: selected.reduce((sum, workout) => sum + workoutVolume(workout), 0), durationMs: selected.reduce((sum, workout) => sum + workoutDuration(workout), 0) }, nutrition: dailyFood, health: dailyHealth, progress: null },
    quality: { incompleteFoodDays: dailyFood.filter(day => !day.complete).length, missingHealthDays: dailyHealth.filter(day => !day.observed).length,
      lastHealthSyncAt: finite(state.health?.status?.lastSyncAt), offWrist: 'unknown', oldSetTimesUnknown: workouts.some(w => w.entries?.some(e => e.sets?.some(row => row.done && row.completedAt == null))),
      energyRule: 'totalKcal and activeKcal are separate; never added to each other or workout estimates' },
  })
}

// Whitelists above define each record. This second guard covers objects keyed by
// dates/exercise IDs (schedule maps) and nested extension objects from old imports.
export function stripCredentials(value) {
  if (Array.isArray(value)) return value.map(stripCredentials)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/(?:token|password|secret|credential|apikey|api_key|authorization|pairingkey|contactemail|email)/i.test(key))
    .map(([key, child]) => [key, stripCredentials(child)]))
  return value
}

const cell = value => String(value ?? '—').replaceAll('|', '\\|').replaceAll('\n', ' ')
const num = value => value == null ? '—' : Number(value.toFixed(2)).toString()
export function renderAnalysisMarkdown(report) {
  const lines = [`# openGym Personal — отчёт для анализа`, '', `Период: ${report.window.from} — ${report.window.to}; контекст с ${report.window.contextFrom}.`,
    `Профиль: ${cell(report.profileId)}. Сформирован: ${new Date(report.generatedAt).toISOString()}. Часовой пояс: ${cell(report.timezone)}.`, '',
    `Тренировки: ${report.summaries.workouts.count}; рабочий объём: ${num(report.summaries.workouts.volume)} ${report.units.weight} × повторения; время: ${num(report.summaries.workouts.durationMs / 60000)} мин.`, '',
    '| Дата | ккал | Белки, г | Жиры, г | Углеводы, г | Рацион |', '| --- | ---: | ---: | ---: | ---: | --- |']
  for (const day of report.summaries.nutrition) lines.push(`| ${day.date} | ${NUTRIENT_KEYS.map(key => num(day.totals[key])).join(' | ')} | ${day.complete ? 'полный' : 'неполный'} |`)
  lines.push('', '| Дата | Шаги | Активные ккал | Общие ккал | Сон |', '| --- | ---: | ---: | ---: | --- |')
  for (const day of report.summaries.health) lines.push(`| ${day.date} | ${num(day.steps)} | ${num(day.activeKcal)} | ${num(day.totalKcal)} | ${day.sleep.length ? day.sleep.map(s => s.asleepMinutes == null ? `интервал ${num(s.durationMinutes)} мин; сон неизвестен` : `${num(s.asleepMinutes)} мин`).join('; ') : 'нет данных'} |`)
  lines.push('', 'Общие и активные калории показаны отдельно. Их нельзя складывать с оценкой тренировки.', `Дней с неполным рационом: ${report.quality.incompleteFoodDays}; без данных активности: ${report.quality.missingHealthDays}.`, 'Ношение часов: неизвестно. Неизвестные значения обозначены «—».', '', '## История тренировок')
  for (const workout of report.history.workouts) {
    lines.push('', `### ${cell(workout.d)} — ${cell(workout.name || workout.id)}`, `Начало: ${workout.start == null ? 'неизвестно' : new Date(workout.start).toISOString()}; завершение: ${workout.end == null ? 'неизвестно' : new Date(workout.end).toISOString()}.`)
    for (const entry of workout.entries) lines.push(`- ${cell(entry.id)}${entry.noProg ? ' (вне прогрессии)' : ''}: ${entry.sets.map(s => `${s.done ? '✓' : '○'} ${s.w ?? 0} ${report.units.weight} × ${s.r ?? '—'}${s.phase === 'warmup' || s.warmup ? ' разминка' : ''}${s.rpe != null ? ` RPE ${s.rpe}` : ''}${s.rir != null ? ` RIR ${s.rir}` : ''}`).join('; ')}`)
  }
  lines.push('', '## Текущая программа', '', '```json', JSON.stringify(report.plan, null, 2), '```', '', 'Полная запись продуктов, интервалов, источников и изменений программы находится в сопутствующем JSON отчёте.')
  return lines.join('\n')
}
