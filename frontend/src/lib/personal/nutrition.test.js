import { describe, expect, it } from 'vitest'
import { parseAmount, normalizeNutrients, portionNutrients, recipeNutrients, snapshotMealItem, summarizeNutritionDay } from './nutrition.js'

const food = { id: 'f1', name: 'Рис', preparation: 'cooked', nutrients: { kcal: 200, protein: 4, fat: 0, carbs: null }, source: { type: 'manual' } }

describe('nutrition calculations', () => {
  it('accepts decimal comma but rejects zero mass, infinities and ambiguous numbers', () => {
    expect(parseAmount('37,5')).toBe(37.5)
    for (const value of ['', null, undefined, 0, -1, Infinity, NaN, '2g', '1,000.5', '0x10', true]) {
      expect(() => parseAmount(value)).toThrow()
    }
    expect(parseAmount('0', { allowZero: true })).toBe(0)
  })
  it('preserves unknown nutrients and an explicitly recorded zero', () => {
    expect(normalizeNutrients({ kcal: '200', fat: '0', protein: '', carbs: undefined }))
      .toEqual({ kcal: 200, protein: null, fat: 0, carbs: null })
    expect(portionNutrients(food.nutrients, '37,5')).toEqual({ kcal: 75, protein: 1.5, fat: 0, carbs: null })
    for (const value of [-1, NaN, Infinity, 'oops']) expect(() => normalizeNutrients({ kcal: value })).toThrow()
  })
  it('uses cooked final recipe mass rather than the ingredient mass', () => {
    const recipe = recipeNutrients([
      { nutrients: { kcal: 400, protein: 10, fat: 0, carbs: 90 }, grams: 200 },
      { nutrients: { kcal: 200, protein: 20, fat: 5, carbs: 20 }, grams: 200 },
    ], 800)
    expect(recipe).toEqual({ kcal: 150, protein: 7.5, fat: 1.25, carbs: 27.5 })
    expect(portionNutrients(recipe, 200).kcal).toBe(300)
    expect(() => recipeNutrients([], 800)).toThrow()
    expect(() => recipeNutrients([{ nutrients: food.nutrients, grams: 100 }], 0)).toThrow()
  })
  it('does not turn a missing ingredient nutrient into a complete recipe value', () => {
    expect(recipeNutrients([{ nutrients: food.nutrients, grams: 100 }], 50))
      .toEqual({ kcal: 400, protein: 8, fat: 0, carbs: null })
  })
  it('stores an independent food snapshot and never changes a previous meal on edit', () => {
    const original = structuredClone(food)
    const item = snapshotMealItem(original, 37.5)
    original.name = 'Changed'
    original.nutrients.kcal = 999
    original.source.type = 'changed'
    expect(item.food.name).toBe('Рис')
    expect(item.food.source.type).toBe('manual')
    expect(item.nutrients.kcal).toBe(75)
    expect(item.grams).toBe(37.5)
  })
  it('sums known portions, counts each nutrient gap and requires explicit day completion', () => {
    const nutrition = {
      meals: [
        { id: 'm1', date: '2026-10-02', items: [snapshotMealItem(food, 100), snapshotMealItem({ ...food, nutrients: { kcal: null, protein: 2, fat: 1, carbs: 10 } }, 50)] },
        { id: 'm2', date: '2026-10-02', deletedAt: 99, items: [snapshotMealItem(food, 1000)] },
        { id: 'm3', date: '2026-10-01', items: [snapshotMealItem(food, 1000)] },
      ],
      dayCompleteness: [{ id: '2026-10-02', date: '2026-10-02', complete: true }],
    }
    expect(summarizeNutritionDay(nutrition, '2026-10-02')).toMatchObject({
      totals: { kcal: 200, protein: 5, fat: 0.5, carbs: 5 },
      missing: { kcal: 1, protein: 0, fat: 0, carbs: 1 }, itemCount: 2, complete: true,
    })
    expect(summarizeNutritionDay(nutrition, '2026-10-03')).toMatchObject({
      totals: { kcal: null, protein: null, fat: null, carbs: null }, itemCount: 0, complete: false,
    })
  })
})
