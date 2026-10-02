import catalogue from './food-catalogue.json' with { type: 'json' }
import { NUTRIENT_KEYS, parseAmount } from './nutrition.js'

const API = 'https://world.openfoodfacts.org'
const FIELDS = 'code,product_name,product_name_ru,brands,nutriments,nutrition_data_per,nutrition_data_prepared_per,product_quantity_unit,last_modified_t'
const numeric = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null

export function normalizeOffProduct(product, { prepared = false, densityGPerMl } = {}) {
  if (!product || typeof product !== 'object') throw new Error('Продукт не найден')
  const suffix = prepared ? '_prepared_100g' : '_100g'
  const label = product.nutriments ?? {}
  const kcal = numeric(label[`energy-kcal${suffix}`])
  const kj = numeric(label[`energy-kj${suffix}`]) ?? numeric(label[`energy${suffix}`])
  const per100 = { kcal: kcal ?? (kj === null ? null : kj / 4.184),
    protein: numeric(label[`proteins${suffix}`]), fat: numeric(label[`fat${suffix}`]), carbs: numeric(label[`carbohydrates${suffix}`]) }
  const unit = prepared ? product.nutrition_data_prepared_per : product.nutrition_data_per
  const byVolume = unit === '100ml' || (unit === '100g' && product.product_quantity_unit === 'ml')
  const density = densityGPerMl == null ? null : parseAmount(densityGPerMl)
  const nutrients = byVolume ? Object.fromEntries(NUTRIENT_KEYS.map(key => [key,
    density === null || per100[key] === null ? null : per100[key] / density])) : per100
  const code = String(product.code ?? '')
  return { id: `off-${code}${prepared ? '-prepared' : ''}`, barcode: code,
    name: String(product.product_name_ru || product.product_name || code || 'Без названия'),
    brand: String(product.brands ?? ''), preparation: prepared ? 'cooked' : 'label',
    basis: byVolume && density === null ? '100ml' : '100g', nutrients,
    ...(byVolume ? { per100ml: per100, densityGPerMl: density } : {}),
    source: { type: 'openfoodfacts', url: `${API}/product/${encodeURIComponent(code)}`,
      license: 'ODbL / Database Contents License', updatedAt: numeric(product.last_modified_t) === null ? null : Number(product.last_modified_t) * 1000 } }
}

export function searchCatalogue(query = '') {
  const words = String(query).trim().toLocaleLowerCase('ru').replaceAll('ё', 'е').split(/\s+/).filter(Boolean)
  return catalogue.filter(food => {
    const text = `${food.name} ${food.group} ${food.source.originalName}`.toLocaleLowerCase('ru').replaceAll('ё', 'е')
    return words.every(word => text.includes(word))
  }).map(food => structuredClone(food))
}

// Construct once per app session. The cache adapter may persist entries to device
// storage, and contains only public product lookups, never the private diary.
export function createFoodLookup({ request, now = Date.now, cache = new Map(), contactEmail = '' } = {}) {
  const history = { search: [], barcode: [] }
  const inflight = new Map()
  let blockedUntil = 0
  async function load(kind, key, url, transform) {
    const cacheKey = `${kind}:${key}`
    const cached = await cache.get(cacheKey)
    if (cached !== undefined && cached !== null) return structuredClone(cached.data)
    if (inflight.has(cacheKey)) return structuredClone(await inflight.get(cacheKey))
    const time = now()
    if (time < blockedUntil) throw new Error('Open Food Facts просит повторить позже')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new Error('Укажите контактный e-mail для запросов Open Food Facts')
    if (typeof request !== 'function') throw new Error('Поиск по сети недоступен')
    history[kind] = history[kind].filter(at => time - at < 60000)
    if (history[kind].length >= (kind === 'search' ? 10 : 15)) throw new Error('Слишком часто: лимит Open Food Facts, повторите через минуту')
    history[kind].push(time)
    const work = (async () => {
      const response = await request({ url, method: 'GET', headers: {
        Accept: 'application/json', 'User-Agent': `openGymPersonal/1.3.9 (${contactEmail})`,
      } })
      if (response.status === 429 || response.status === 503) {
        const header = Object.entries(response.headers ?? {}).find(([name]) => name.toLowerCase() === 'retry-after')?.[1]
        const delay = Number(header)
        const until = header && !Number.isFinite(delay) ? Date.parse(header) : time + Math.max(60, Number.isFinite(delay) ? delay : 60) * 1000
        blockedUntil = Math.max(time + 60000, Number.isFinite(until) ? until : 0)
        throw new Error('Open Food Facts временно недоступен, повторите позже')
      }
      if (response.status < 200 || response.status >= 300) throw new Error(`Ошибка поиска (${response.status}), можно добавить продукт вручную`)
      const result = transform(response.data)
      await cache.set(cacheKey, { data: structuredClone(result), retrievedAt: time })
      return result
    })()
    inflight.set(cacheKey, work)
    try { return structuredClone(await work) } finally { inflight.delete(cacheKey) }
  }
  return {
    search(query) {
      const text = String(query).trim()
      if (!text) return Promise.resolve([])
      const params = new URLSearchParams({ search_terms: text, search_simple: '1', action: 'process', json: '1', page_size: '20', fields: FIELDS, lc: 'ru' })
      return load('search', text.toLocaleLowerCase('ru'), `${API}/cgi/search.pl?${params}`, data =>
        (data?.products ?? []).map(product => normalizeOffProduct(product)))
    },
    barcode(code) {
      const text = String(code).trim()
      if (!/^\d{8,14}$/.test(text)) return Promise.reject(new Error('Штрихкод должен содержать 8–14 цифр'))
      return load('barcode', text, `${API}/api/v3.6/product/${text}.json?fields=${FIELDS}`, data => {
        if (!data?.product) throw new Error('Продукт не найден, добавьте его вручную')
        return normalizeOffProduct({ ...data.product, code: data.product.code ?? text })
      })
    },
  }
}
