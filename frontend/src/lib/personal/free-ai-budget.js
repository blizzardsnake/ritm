import { loadCoachDevice, saveCoachDevice } from '../coach-device.js'
const DAY = 86400000
let queue = Promise.resolve()
const utcDate = stamp => new Date(stamp).toISOString().slice(0, 10)
function usage(settings, now) {
  if (Array.isArray(settings.freeUsage)) return settings.freeUsage.filter(t => Number.isFinite(t) && t > now-7*DAY && t <= now)
  // Existing run counts are an honest conservative lower bound on today's requests.
  return settings.daily?.d === utcDate(now) ? Array.from({length: Math.min(200, Math.max(0, settings.daily.n || 0))}, () => now) : []
}
const summary = (rows, now) => ({ used: rows.filter(t=>utcDate(t)===utcDate(now)).length, limit:50, weeklyUsed:rows.length, weeklyLimit:200 })
export async function freeAIQuota(now = Date.now()) { return summary(usage(await loadCoachDevice(), now), now) }
function reserve(now) {
  const operation = queue.then(async () => {
    const rows=usage(await loadCoachDevice(), now), cap=summary(rows,now)
    if (cap.used>=cap.limit) throw new Error('Free AI: 50 requests used today. Try again tomorrow.')
    if (cap.weeklyUsed>=cap.weeklyLimit) throw new Error('Free AI: 200 requests used in seven days. Wait for the oldest requests to expire.')
    await saveCoachDevice({ freeUsage:[...rows,now] })
  })
  queue=operation.catch(()=>{})
  return operation
}
export const budgetedFreeFetch = (fetch, now = Date.now) => async (url, init={}) => {
  if (url==='https://openrouter.ai/api/v1/chat/completions' && init.method?.toUpperCase()==='POST') {
    if (init.signal?.aborted) throw Object.assign(new Error('Cancelled'), {name:'AbortError'})
    await reserve(now())
  }
  return fetch(url,init)
}
