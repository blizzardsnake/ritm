import { PERSONAL_RECORDS, personalId } from './state.js'
import { normalizeNutrients, parseAmount, recipeNutrients, snapshotMealItem } from './nutrition.js'
import { eventTime, validDate } from './time.js'

function putRecord(state, section, field, draft, now) {
  if (!PERSONAL_RECORDS[section]?.includes(field)) throw new Error('Некорректный раздел данных')
  const records = state[section][field]
  const old = records.find(record => record.id === draft.id)
  const record = { ...structuredClone(draft), id: draft.id || personalId(),
    createdAt: old?.createdAt ?? now, updatedAt: now, deletedAt: null }
  const index = records.findIndex(item => item.id === record.id)
  if (index < 0) records.push(record); else records[index] = record
  return structuredClone(record)
}

const nameOf = draft => {
  const name = String(draft.name ?? '').trim()
  if (!name) throw new Error('Укажите название')
  return name
}

export function saveFood(state, draft, { now = Date.now() } = {}) {
  const normalized = { ...draft, name: nameOf(draft), nutrients: normalizeNutrients(draft.nutrients),
    preparation: draft.preparation || 'label', basis: draft.basis || '100g', source: draft.source || { type: 'manual' } }
  return putRecord(state, 'nutrition', 'foods', normalized, now)
}

export function saveRecipe(state, draft, { now = Date.now() } = {}) {
  const ingredients = (draft.ingredients ?? []).map(item => snapshotMealItem(item.food, item.grams))
  const finalGrams = parseAmount(draft.finalGrams)
  const nutrients = recipeNutrients(ingredients, finalGrams)
  return putRecord(state, 'nutrition', 'recipes', { ...draft, name: nameOf(draft), ingredients, finalGrams,
    nutrients, basis: '100g', preparation: 'cooked', source: { type: 'recipe' } }, now)
}

export function saveMeal(state, draft, { now = Date.now() } = {}) {
  const items = (draft.items ?? []).map(item => snapshotMealItem(item.food, item.grams))
  if (!items.length) throw new Error('Добавьте продукт в приём пищи')
  const time = eventTime(draft.at ?? now, { timezone: draft.timezone })
  if (draft.date && draft.date !== time.date) throw new Error('Дата не совпадает со временем приёма пищи')
  return putRecord(state, 'nutrition', 'meals', { ...draft, ...time, name: String(draft.name || 'Приём пищи').trim(), items }, now)
}

export function deletePersonalRecord(state, section, field, id, { now = Date.now() } = {}) {
  if (!PERSONAL_RECORDS[section]?.includes(field)) throw new Error('Некорректный раздел данных')
  const record = state[section][field].find(item => item.id === id)
  if (record) { record.deletedAt = now; record.updatedAt = now }
}

export function setDayComplete(state, date, complete, { now = Date.now() } = {}) {
  if (!validDate(date)) throw new Error('Некорректная дата')
  return putRecord(state, 'nutrition', 'dayCompleteness', { id: date, date, complete: !!complete }, now)
}

export function setNutritionTargets(state, targets, { now = Date.now() } = {}) {
  return putRecord(state, 'nutrition', 'targets', { id: 'default', ...normalizeNutrients(targets) }, now)
}
