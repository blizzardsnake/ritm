import { t, getLang, dateLocale } from '../i18n.js'

export const nutrientDisplay = value => value == null ? '—' : new Intl.NumberFormat(dateLocale(), { maximumFractionDigits: 1 }).format(value)
export function mealCountText(count) {
  let key = count === 1 ? '{0} meal' : '{0} meals'
  if (getLang() === 'ru') {
    const tail = count % 10, teens = count % 100 >= 11 && count % 100 <= 14
    key = !teens && tail === 1 ? '{0} meal' : !teens && tail >= 2 && tail <= 4 ? '{0} meals few' : '{0} meals'
  }
  return t(key, count)
}
