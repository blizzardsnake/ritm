import { describe, expect, it } from 'vitest'
import { migratePersonalState } from './state.js'
import { saveFood, saveRecipe, saveMeal, deletePersonalRecord, setDayComplete, setNutritionTargets } from './store-actions.js'
import { eventTime } from './time.js'

describe('personal diary actions', () => {
  it('records timezone and local date across midnight without guessing the event time', () => {
    expect(eventTime(Date.parse('2026-10-02T22:30:00Z'), { timezone: 'Europe/Moscow' })).toEqual({
      at: 1790980200000, date: '2026-10-03', timezone: 'Europe/Moscow', offsetMinutes: 180,
    })
  })
  it('supports food and recipe snapshots, original creation time, edits and tombstone deletion', () => {
    const state = migratePersonalState({}, { now: 1, profileId: 'owner' })
    const food = saveFood(state, { name: 'Продукт', nutrients: { kcal: 200, protein: 10, fat: 0, carbs: null } }, { now: 10 })
    const recipe = saveRecipe(state, { name: 'Блюдо', finalGrams: 400, ingredients: [{ food, grams: 200 }] }, { now: 20 })
    expect(recipe.nutrients.kcal).toBe(100)
    const meal = saveMeal(state, { name: 'Обед', at: Date.parse('2026-10-02T12:00:00Z'), timezone: 'UTC', items: [{ food: recipe, grams: 100 }] }, { now: 30 })
    expect(meal.items[0].nutrients.kcal).toBe(100)
    saveFood(state, { ...food, nutrients: { ...food.nutrients, kcal: 900 } }, { now: 40 })
    expect(state.nutrition.meals[0].items[0].food.ingredients[0].food.nutrients.kcal).toBe(200)
    const edited = saveMeal(state, { ...meal, note: 'Исправлено' }, { now: 50 })
    expect(edited.createdAt).toBe(30)
    expect(edited.updatedAt).toBe(50)
    expect(edited.at).toBe(meal.at)
    deletePersonalRecord(state, 'nutrition', 'meals', meal.id, { now: 60 })
    expect(state.nutrition.meals[0]).toMatchObject({ id: meal.id, deletedAt: 60, updatedAt: 60 })
  })
  it('validates mass and nutrients before changing the saved draft', () => {
    const state = migratePersonalState({}, { now: 1, profileId: 'owner' })
    expect(() => saveFood(state, { name: 'Bad', nutrients: { kcal: -2 } })).toThrow()
    expect(state.nutrition.foods).toEqual([])
    expect(() => saveMeal(state, { at: 0, items: [] })).toThrow()
    expect(state.nutrition.meals).toEqual([])
    expect(() => setNutritionTargets(state, { kcal: Infinity })).toThrow()
    expect(state.nutrition.targets).toEqual([])
    setNutritionTargets(state, { kcal: '2100', protein: null }, { now: 10 })
    expect(state.nutrition.targets[0]).toMatchObject({ kcal: 2100, protein: null, fat: null, carbs: null })
    setDayComplete(state, '2026-10-02', true, { now: 20 })
    setDayComplete(state, '2026-10-02', false, { now: 30 })
    expect(state.nutrition.dayCompleteness).toHaveLength(1)
    expect(state.nutrition.dayCompleteness[0]).toMatchObject({ complete: false, createdAt: 20, updatedAt: 30 })
  })
})
