// Shared by the phone, report exporter and Node MCP. No display rounding here.
export const NUTRIENT_KEYS = Object.freeze(['kcal', 'protein', 'fat', 'carbs'])

export function parseAmount(value, { allowZero = false } = {}) {
  if (typeof value !== 'number' && typeof value !== 'string') throw new Error('Укажите число')
  const text = typeof value === 'string' ? value.trim().replace(',', '.') : null
  if (text !== null && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) throw new Error('Укажите число')
  const number = text === null ? value : Number(text)
  if (!Number.isFinite(number) || (allowZero ? number < 0 : number <= 0)) {
    throw new Error(allowZero ? 'Значение должно быть неотрицательным' : 'Масса должна быть больше нуля')
  }
  return number
}

export function normalizeNutrients(value = {}) {
  return Object.fromEntries(NUTRIENT_KEYS.map(key => {
    const raw = value?.[key]
    const absent = raw == null || (typeof raw === 'string' && raw.trim() === '')
    return [key, absent ? null : parseAmount(raw, { allowZero: true })]
  }))
}

function finiteResult(value) {
  if (!Number.isFinite(value)) throw new Error('Значение слишком велико')
  return value
}

export function portionNutrients(per100g, grams) {
  const mass = parseAmount(grams)
  const nutrients = normalizeNutrients(per100g)
  return Object.fromEntries(NUTRIENT_KEYS.map(key => [key,
    nutrients[key] === null ? null : finiteResult(nutrients[key] * (mass / 100)),
  ]))
}

export function recipeNutrients(ingredients, finalGrams) {
  if (!Array.isArray(ingredients) || !ingredients.length) throw new Error('Добавьте ингредиенты')
  const finalMass = parseAmount(finalGrams)
  const portions = ingredients.map(item => portionNutrients(item.nutrients ?? item.food?.nutrients, item.grams))
  return Object.fromEntries(NUTRIENT_KEYS.map(key => [key,
    portions.some(portion => portion[key] === null) ? null
      : finiteResult(portions.reduce((sum, portion) => finiteResult(sum + portion[key]), 0) * (100 / finalMass)),
  ]))
}

export function snapshotMealItem(food, grams) {
  if (!food || typeof food.name !== 'string' || !food.name.trim()) throw new Error('Укажите продукт')
  const mass = parseAmount(grams)
  const snapshot = structuredClone(food)
  snapshot.nutrients = normalizeNutrients(snapshot.nutrients)
  return { foodId: snapshot.id ?? null, grams: mass, food: snapshot, nutrients: portionNutrients(snapshot.nutrients, mass) }
}

export function summarizeNutritionDay(nutrition = {}, date) {
  const meals = (nutrition.meals ?? []).filter(meal => !meal.deletedAt && meal.date === date)
  const items = meals.flatMap(meal => meal.items ?? [])
  const portions = items.map(item => normalizeNutrients(item.nutrients))
  const missing = {}, totals = {}
  for (const key of NUTRIENT_KEYS) {
    const known = portions.filter(portion => portion[key] !== null)
    missing[key] = items.length - known.length
    totals[key] = known.length ? known.reduce((sum, portion) => finiteResult(sum + portion[key]), 0) : null
  }
  const day = (nutrition.dayCompleteness ?? []).find(record => !record.deletedAt && record.date === date)
  return { date, totals, missing, itemCount: items.length, mealCount: meals.length,
    complete: items.length > 0 && day?.complete === true }
}
