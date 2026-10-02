import { describe, expect, it, vi } from 'vitest'
import { normalizeOffProduct, searchCatalogue, createFoodLookup } from './food-search.js'

const product = { code: '12345678', product_name_ru: 'Продукт', brands: 'Марка', nutrition_data_per: '100g',
  nutriments: { 'energy-kj_100g': 418.4, proteins_100g: 5, fat_100g: 0, carbohydrates_100g: 12 } }
const request = async () => ({ status: 200, data: { product }, headers: {} })
const contactEmail = 'owner@example.com'

describe('free food lookup', () => {
  it('uses kcal if present and falls back to kJ, leaving absent macros unknown', () => {
    expect(normalizeOffProduct(product).nutrients.kcal).toBeCloseTo(100, 10)
    expect(normalizeOffProduct(product).nutrients).toMatchObject({ protein: 5, fat: 0, carbs: 12 })
    expect(normalizeOffProduct({ ...product, nutriments: { 'energy-kcal_100g': 120, 'energy-kj_100g': 418.4 } }).nutrients)
      .toEqual({ kcal: 120, protein: null, fat: null, carbs: null })
    expect(normalizeOffProduct({ ...product, nutriments: { 'energy-kcal_serving': 300 } }).nutrients.kcal).toBeNull()
  })
  it('keeps prepared values separate from as-sold labels', () => {
    const both = { ...product, nutriments: { 'energy-kcal_100g': 400, 'energy-kcal_prepared_100g': 120 } }
    expect(normalizeOffProduct(both).nutrients.kcal).toBe(400)
    expect(normalizeOffProduct(both, { prepared: true }).nutrients.kcal).toBe(120)
    expect(normalizeOffProduct(both, { prepared: true }).preparation).toBe('cooked')
  })
  it('does not silently interpret 100ml as 100g', () => {
    const drink = { ...product, nutrition_data_per: '100ml' }
    expect(normalizeOffProduct(drink).nutrients.kcal).toBeNull()
    expect(normalizeOffProduct(drink).basis).toBe('100ml')
    expect(normalizeOffProduct(drink, { densityGPerMl: 2 }).nutrients.kcal).toBeCloseTo(50, 10)
  })
  it('finds raw and cooked Russian staples with traceable USDA records offline', () => {
    const matches = searchCatalogue('греч')
    expect(matches.map(food => food.preparation).sort()).toEqual(['cooked', 'raw'])
    expect(matches.find(food => food.preparation === 'cooked').nutrients.kcal).toBe(92)
    expect(searchCatalogue('овсян')).toHaveLength(1)
    expect(searchCatalogue('').length).toBeGreaterThanOrEqual(50)
    expect(matches[0].source.fdcId).toBeGreaterThan(0)
  })
  it('uses persisted cache without a network request after a restart and preserves snapshots', async () => {
    const cache = new Map()
    const first = createFoodLookup({ request, contactEmail, cache })
    const food = await first.barcode('12345678')
    food.nutrients.kcal = 999
    const offline = vi.fn(async () => { throw new Error('Offline') })
    const restarted = createFoodLookup({ request: offline, contactEmail, cache })
    expect((await restarted.barcode('12345678')).nutrients.kcal).toBeCloseTo(100, 10)
    expect(offline).not.toHaveBeenCalled()
  })
  it('enforces rolling search and barcode limits before issuing an excess request', async () => {
    const network = vi.fn(async () => ({ status: 200, data: { products: [product], product }, headers: {} }))
    let now = 1000
    const lookup = createFoodLookup({ request: network, now: () => now, contactEmail })
    for (let i = 0; i < 10; i++) await lookup.search(`рис ${i}`)
    await expect(lookup.search('extra')).rejects.toThrow(/часто|лимит/i)
    expect(network).toHaveBeenCalledTimes(10)
    for (let i = 0; i < 15; i++) await lookup.barcode(`1234567${i.toString().padStart(2, '0')}`)
    await expect(lookup.barcode('99999999')).rejects.toThrow(/часто|лимит/i)
    expect(network).toHaveBeenCalledTimes(25)
    now += 60001
    await lookup.search('after minute')
    expect(network).toHaveBeenCalledTimes(26)
  })
  it('honors Retry-After without automatic repeated requests or sending personal diary data', async () => {
    const network = vi.fn(async () => ({ status: 429, headers: { 'Retry-After': '120' }, data: {} }))
    const lookup = createFoodLookup({ request: network, now: () => 1000, contactEmail })
    await expect(lookup.search('рис')).rejects.toThrow(/позже/i)
    await expect(lookup.search('молоко')).rejects.toThrow(/позже/i)
    expect(network).toHaveBeenCalledTimes(1)
    const call = network.mock.calls[0][0]
    expect(call.method).toBe('GET')
    expect(call.headers['User-Agent']).toContain('openGymPersonal/')
    expect(call.headers['User-Agent']).toContain(contactEmail)
    expect(call).not.toHaveProperty('body')
    expect(call.url).toContain('search_terms=')
  })
})
