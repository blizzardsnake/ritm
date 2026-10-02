export function eventTime(instant, { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone } = {}) {
  const at = instant instanceof Date ? instant.getTime() : Number(instant)
  if (instant == null || !Number.isFinite(at) || !Number.isFinite(new Date(at).getTime())) throw new Error('Некорректное время')
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(at)).filter(part => part.type !== 'literal').map(part => [part.type, part.value]))
  const localAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second))
  return { at, date: `${parts.year}-${parts.month}-${parts.day}`, timezone,
    offsetMinutes: (localAsUtc - Math.floor(at / 1000) * 1000) / 60000 }
}

export function validDate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date
}
export const shiftDate = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10)
export function datesBetween(from, to) {
  const result = []
  for (let date = from; date <= to; date = shiftDate(date, 1)) result.push(date)
  return result
}
