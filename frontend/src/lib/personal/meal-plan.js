import { normalizeNutrients, parseAmount, snapshotMealItem } from './nutrition.js'
import { personalId } from './state.js'
import { sha256HexJs } from '../sha256.js'
import { canonicalJson } from './exchange.js'
import { parseCSV } from '../import-csv.js'
import { validDate } from './time.js'

export const MEAL_PLAN_FORMAT = 'opengym-personal-meal-plan'
const weekdays = ['каждый день', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье']
const strict = (obj, fields) => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || Object.keys(obj).some(key => !fields.includes(key))) throw new Error('Неизвестное поле или неверная структура плана')
}
const foodFields = ['id', 'name', 'brand', 'nutrients', 'preparation', 'basis', 'source']
function publicSource(source, depth = 0) {
  if (!source || depth > 3) return { type: 'meal-plan' }
  strict(source, ['type', 'dataset', 'datasetSha256', 'fdcId', 'originalName', 'dataType', 'license', 'url', 'updatedAt', 'basedOn'])
  const result = { ...source }
  if (result.basedOn) result.basedOn = publicSource(result.basedOn, depth + 1)
  return result
}
function normalizedFood(value) {
  strict(value, foodFields)
  if (!String(value.name || '').trim()) throw new Error('Укажите название продукта')
  if (value.basis && value.basis !== '100g') throw new Error('В плане нужна пищевая ценность на 100 г')
  strict(value.nutrients || {}, ['kcal', 'protein', 'fat', 'carbs'])
  if (value.preparation && !['raw', 'cooked', 'ready', 'label'].includes(value.preparation)) throw new Error('Неизвестное состояние продукта')
  return { name: String(value.name).trim(), ...(value.id ? { id: String(value.id) } : {}),
    ...(value.brand ? { brand: String(value.brand) } : {}), basis: '100g', preparation: value.preparation || 'label',
    nutrients: normalizeNutrients(value.nutrients), source: publicSource(value.source) }
}
function normalizedPlan(doc) {
  strict(doc, ['format', 'formatVersion', 'id', 'name', 'note', 'from', 'to', 'targets', 'days'])
  if (doc.format !== MEAL_PLAN_FORMAT || doc.formatVersion !== 1) throw new Error('Нужен план opengym-personal-meal-plan версии 1')
  const name = String(doc.name || '').trim()
  if (!name) throw new Error('Укажите название плана')
  for (const key of ['from', 'to']) if (doc[key] != null && !validDate(doc[key])) throw new Error('Неверная дата плана')
  if (doc.from && doc.to && doc.from > doc.to) throw new Error('Неверный период плана')
  if (doc.targets) strict(doc.targets, ['kcal', 'protein', 'fat', 'carbs'])
  if (!Array.isArray(doc.days) || doc.days.length > 366) throw new Error('Нужен массив days, до 366 дней')
  const id = doc.id ? String(doc.id) : `meal-plan-${sha256HexJs(new TextEncoder().encode(canonicalJson(doc))).slice(0, 24)}`
  const usedIds = new Set()
  const checkedId = (value, fallback) => {
    const result = String(value || fallback)
    if (result.length > 160 || usedIds.has(result)) throw new Error('Повторяющийся или слишком длинный ID')
    usedIds.add(result); return result
  }
  return { format: MEAL_PLAN_FORMAT, formatVersion: 1, id, name, note: String(doc.note || ''),
    from: doc.from ?? null, to: doc.to ?? null, targets: normalizeNutrients(doc.targets),
    days: doc.days.map((day, index) => {
      strict(day, ['id', 'date', 'weekday', 'meals'])
      if (day.date != null && !validDate(day.date)) throw new Error('Неверная дата дня')
      if (!day.date && ![0, 1, 2, 3, 4, 5, 6, 7].includes(day.weekday)) throw new Error('weekday: 0 — каждый день, 1–7 — понедельник–воскресенье')
      if (!Array.isArray(day.meals) || day.meals.length > 30) throw new Error('Нужен массив meals, до 30 приёмов')
      return { id: checkedId(day.id, `day-${index}`), ...(day.date ? { date: day.date } : { weekday: day.weekday }),
        meals: day.meals.map((meal, mealIndex) => {
          strict(meal, ['id', 'name', 'time', 'note', 'items'])
          if (!String(meal.name || '').trim()) throw new Error('Укажите название приёма пищи')
          if (meal.time != null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(meal.time)) throw new Error('Время должно быть HH:MM')
          if (!Array.isArray(meal.items) || meal.items.length > 100) throw new Error('Нужен массив items, до 100 продуктов')
          return { id: checkedId(meal.id, `day-${index}-meal-${mealIndex}`), name: String(meal.name).trim(), time: meal.time || null, note: String(meal.note || ''),
            items: meal.items.map(item => {
              strict(item, ['grams', 'food'])
              return { grams: parseAmount(item.grams), food: normalizedFood(item.food) }
            }) }
        }) }
    }) }
}
const headerKey = value => String(value).trim().toLowerCase().replace(/[\s_,]/g, '')
const columns = { 'день': 'day', day: 'day', 'приём': 'meal', 'прием': 'meal', meal: 'meal', 'время': 'time', time: 'time',
  'продукт': 'food', food: 'food', 'граммы': 'grams', grams: 'grams', 'ккал100': 'kcal', kcal100: 'kcal',
  'б100': 'protein', protein100: 'protein', 'ж100': 'fat', fat100: 'fat', 'у100': 'carbs', carbs100: 'carbs', 'состояние': 'preparation', preparation: 'preparation' }
function tablePlan(text) {
  const firstLine = text.split(/\r?\n/)[0]
  const delimiter = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ','
  const [headers, ...rows] = parseCSV(text, delimiter)
  const keys = headers?.map(header => columns[headerKey(header)]) || []
  if (!['meal', 'food', 'grams'].every(key => keys.includes(key))) throw new Error('Нужны столбцы Приём, Продукт, Граммы')
  if (rows.length > 10000) throw new Error('Слишком большая таблица')
  const days = []
  for (const row of rows) {
    if (row.length !== keys.length) throw new Error('Число столбцов строки не совпадает с заголовком')
    const record = Object.fromEntries(keys.map((key, index) => [key, row[index].trim()]))
    const rawDay = (record.day || 'каждый день').toLowerCase()
    const weekday = weekdays.indexOf(rawDay)
    const date = validDate(rawDay) ? rawDay : null
    if (!date && weekday < 0) throw new Error('День: Каждый день, название дня недели или YYYY-MM-DD')
    let day = days.find(item => date ? item.date === date : item.weekday === weekday)
    if (!day) { day = date ? { date, meals: [] } : { weekday, meals: [] }; days.push(day) }
    let meal = day.meals.find(item => item.name === record.meal && item.time === (record.time || null))
    if (!meal) { meal = { name: record.meal, time: record.time || null, items: [] }; day.meals.push(meal) }
    meal.items.push({ grams: record.grams, food: { name: record.food, preparation: record.preparation || 'label',
      nutrients: normalizeNutrients(record) } })
  }
  return { format: MEAL_PLAN_FORMAT, formatVersion: 1, name: 'План питания', days }
}
export function parseMealPlan(input) {
  const text = String(input).replace(/^\uFEFF/, '').trim()
  if (text.length > 2 * 1024 * 1024) throw new Error('План больше 2 МБ')
  return normalizedPlan(text.startsWith('{') ? JSON.parse(text) : tablePlan(text))
}
export function mealPlanDocument(plan) {
  const { format, formatVersion, id, name, note, from, to, targets, days } = plan
  return { format, formatVersion, id, name, note, from, to, targets, days }
}
export function saveMealPlan(state, plan, { now = Date.now() } = {}) {
  const validated = normalizedPlan(mealPlanDocument(plan))
  const index = state.nutrition.mealPlans.findIndex(item => item.id === validated.id)
  const record = { ...validated, createdAt: index < 0 ? now : state.nutrition.mealPlans[index].createdAt, updatedAt: now, deletedAt: null }
  if (index < 0) state.nutrition.mealPlans.push(record); else state.nutrition.mealPlans[index] = record
  return structuredClone(record)
}
export function mealsForDate(plan, date) {
  if (!validDate(date) || plan.deletedAt || (plan.from && date < plan.from) || (plan.to && date > plan.to)) return []
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay() || 7
  const exact = plan.days.filter(day => day.date === date)
  const chosen = exact.length ? exact : plan.days.filter(day => !day.date && (day.weekday === weekday || day.weekday === 0))
  return chosen.flatMap(day => day.meals.map(meal => ({ ...structuredClone(meal), dayId: day.id })))
}
export function mealDraftFromPlan(plan, meal) {
  return { name: meal.name, note: meal.note, time: meal.time, planId: plan.id, planMealId: meal.id,
    items: meal.items.map(item => snapshotMealItem(item.food, item.grams)) }
}
export function createBlankMealPlan() {
  return normalizedPlan({ format: MEAL_PLAN_FORMAT, formatVersion: 1, id: personalId(), name: 'Мой план питания', days: [{ weekday: 0, meals: [] }] })
}
export function upsertPlannedMeal(state, planId, dayId, meal, { now = Date.now() } = {}) {
  const plan = state.nutrition.mealPlans.find(item => item.id === planId && !item.deletedAt)
  if (!plan) throw new Error('План не найден')
  const copy = mealPlanDocument(structuredClone(plan))
  let day = copy.days.find(item => item.id === dayId)
  if (!day) throw new Error('День плана не найден')
  const draft = { id: meal.id || personalId(), name: meal.name || 'Приём пищи', time: meal.time || null, note: meal.note || '',
    items: meal.items.map(item => ({ grams: item.grams, food: Object.fromEntries(foodFields.filter(key => item.food[key] !== undefined).map(key => [key, item.food[key]])) })) }
  const index = day.meals.findIndex(item => item.id === draft.id)
  if (index < 0) day.meals.push(draft); else day.meals[index] = draft
  return saveMealPlan(state, normalizedPlan(copy), { now })
}
export const MEAL_PLAN_EXAMPLE = {
  format: MEAL_PLAN_FORMAT, formatVersion: 1, name: 'Мой план питания', note: 'КБЖУ продуктов на 100 г; неизвестные значения — null. weekday: 0 каждый день, 1–7 понедельник–воскресенье.',
  targets: { kcal: null, protein: null, fat: null, carbs: null },
  days: [{ weekday: 0, meals: [{ name: 'Завтрак', time: '08:30', note: 'Заполните продукты и массы постепенно', items: [] }] }],
}
