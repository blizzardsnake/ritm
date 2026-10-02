import { expect, it } from 'vitest'
import { parseMealPlan, saveMealPlan, mealsForDate, mealDraftFromPlan, mealPlanDocument, createBlankMealPlan, upsertPlannedMeal } from './meal-plan.js'
import { migratePersonalState, mergePersonalState, personalHasData } from './state.js'
import { summarizeNutritionDay } from './nutrition.js'
import { saveMeal } from './store-actions.js'

const json = { format: 'opengym-personal-meal-plan', formatVersion: 1, name: 'Мой рацион',
  targets: { kcal: 2200, protein: 130, fat: 70, carbs: 260 },
  days: [{ weekday: 5, meals: [{ name: 'Завтрак', time: '08:30', items: [{ grams: '37,5', food: { name: 'Овсянка', nutrients: { kcal: 200, protein: 10, fat: 0, carbs: null } } }] }] }] }
it('previews the dated/weekday plan without treating planned meals as eaten, stable reimport and persistent plan-only state', () => {
  const plan = parseMealPlan(JSON.stringify(json))
  const state = migratePersonalState({ workouts: [] }, { profileId: 'owner', now: 1 })
  saveMealPlan(state, plan, { now: 10 })
  saveMealPlan(state, parseMealPlan(JSON.stringify(json)), { now: 20 })
  expect(state.nutrition.mealPlans).toHaveLength(1)
  expect(personalHasData(state)).toBe(true)
  expect(mergePersonalState(state, { nutrition: { mealPlans: [] } }).nutrition.mealPlans).toHaveLength(1)
  expect(summarizeNutritionDay(state.nutrition, '2026-10-02').totals.kcal).toBeNull()
  expect(mealsForDate(plan, '2026-10-02')).toHaveLength(1)
  expect(mealsForDate(plan, '2026-10-03')).toHaveLength(0)
  const draft = mealDraftFromPlan(plan, plan.days[0].meals[0])
  expect(draft.items[0].nutrients.kcal).toBe(75)
  saveMeal(state, { ...draft, at: Date.parse('2026-10-02T05:30:00Z'), timezone: 'Europe/Moscow' }, { now: 30 })
  expect(summarizeNutritionDay(state.nutrition, '2026-10-02')).toMatchObject({ totals: { kcal: 75, fat: 0, carbs: null }, complete: false })
  expect(state.nutrition.meals[0].planId).toBe(plan.id)
})
it('imports quoted Russian semicolon CSV and pasted tab-separated table, leaving absent macros unknown', () => {
  const csv = 'День;Приём;Время;Продукт;Граммы;Ккал100;Б100;Ж100;У100\r\nКаждый день;Обед;13:00;"Рис; варёный";150,5;130;2,7;0;28\r\nКаждый день;Обед;13:00;Овощи;50;;;;'
  const plan = parseMealPlan(csv)
  const meals = mealsForDate(plan, '2026-10-02')
  expect(meals).toHaveLength(1)
  expect(meals[0].items[0]).toMatchObject({ grams: 150.5, food: { name: 'Рис; варёный' } })
  expect(meals[0].items[1].food.nutrients.kcal).toBeNull()
  expect(parseMealPlan('День\tПриём\tПродукт\tГраммы\nПятница\tУжин\tРыба\t200').days[0].weekday).toBe(5)
})
it('rejects unknown JSON version/fields, invalid grams/dates/times/weekday without mutating the profile', () => {
  for (const bad of [{ ...json, formatVersion: 2 }, { ...json, token: 'secret' }, { ...json, days: [{ date: '2026-02-30', meals: json.days[0].meals }] },
    { ...json, days: [{ weekday: 8, meals: json.days[0].meals }] }]) expect(() => parseMealPlan(JSON.stringify(bad))).toThrow()
  const invalid = structuredClone(json); invalid.days[0].meals[0].items[0].grams = '-1'
  expect(() => parseMealPlan(JSON.stringify(invalid))).toThrow()
  invalid.days[0].meals[0].items[0].grams = 100; invalid.days[0].meals[0].time = '25:00'
  expect(() => parseMealPlan(JSON.stringify(invalid))).toThrow()
})
it('allows gradual empty meals, shares/reloads per-100g sources and keeps original portion calculations', () => {
  const state = migratePersonalState({}, { now: 1, profileId: 'owner' })
  const plan = createBlankMealPlan()
  saveMealPlan(state, plan, { now: 10 })
  upsertPlannedMeal(state, plan.id, plan.days[0].id, { name: 'Обед', items: [], time: '' }, { now: 20 })
  expect(state.nutrition.mealPlans[0].days[0].meals[0].items).toEqual([])
  const meal = state.nutrition.mealPlans[0].days[0].meals[0]
  upsertPlannedMeal(state, plan.id, plan.days[0].id, { ...meal, items: [{ grams: 50, food: { name: 'Рис', nutrients: { kcal: 130 }, source: { type: 'usda', fdcId: 168878, datasetSha256: 'abc', license: 'CC0' } } }] }, { now: 30 })
  const restored = parseMealPlan(JSON.stringify(mealPlanDocument(state.nutrition.mealPlans[0])))
  expect(restored.days[0].meals[0].items[0].food.source.fdcId).toBe(168878)
  expect(mealDraftFromPlan(restored, restored.days[0].meals[0]).items[0].nutrients.kcal).toBe(65)
})
