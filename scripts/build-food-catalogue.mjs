import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const input = process.argv[2]
if (!input) throw new Error('Usage: node scripts/build-food-catalogue.mjs <USDA SR Legacy JSON>')
const bytes = fs.readFileSync(input)
const sourceHash = createHash('sha256').update(bytes).digest('hex')
const data = JSON.parse(bytes.toString('utf8'))
const rows = Object.values(data).find(Array.isArray)
if (!rows) throw new Error('Unsupported USDA dataset')
const byId = new Map(rows.map(food => [food.fdcId, food]))
const selection = JSON.parse(fs.readFileSync(new URL('./food-catalogue-selection.json', import.meta.url), 'utf8'))
const catalogue = selection.map(([fdcId, name, preparation, group]) => {
  const food = byId.get(fdcId)
  if (!food) throw new Error(`Missing FDC ID ${fdcId}`)
  const read = (id, unit) => {
    const record = food.foodNutrients.find(item => item.nutrient?.id === id && item.nutrient.unitName.toLowerCase() === unit.toLowerCase())
    if (!record) return null
    if (!Number.isFinite(record.amount) || record.amount < 0) throw new Error(`Bad nutrient ${id} for ${fdcId}`)
    return record.amount
  }
  const kcal = read(1008, 'kcal') ?? (read(1062, 'kJ') === null ? null : read(1062, 'kJ') / 4.184)
  return { id: `usda-${fdcId}`, name, group, preparation, basis: '100g',
    nutrients: { kcal, protein: read(1003, 'g'), fat: read(1004, 'g'), carbs: read(1005, 'g') },
    source: { type: 'usda', dataset: 'SR Legacy 2018-04', datasetSha256: sourceHash, fdcId,
      originalName: food.description, dataType: food.dataType, license: 'CC0',
      url: `https://fdc.nal.usda.gov/food-details/${fdcId}/nutrients` } }
})
if (new Set(catalogue.map(food => food.id)).size !== catalogue.length || catalogue.length < 50) throw new Error('Catalogue must have at least 50 distinct records')
const output = new URL('../frontend/src/lib/personal/food-catalogue.json', import.meta.url)
fs.writeFileSync(output, `${JSON.stringify(catalogue, null, 2)}\n`)
console.log(`Generated ${catalogue.length} foods: ${fileURLToPath(output)}; input SHA256 ${sourceHash}`)
