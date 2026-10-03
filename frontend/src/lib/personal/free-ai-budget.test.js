import { beforeEach, expect, it, vi } from 'vitest'
const device = vi.hoisted(() => ({ value: {} }))
vi.mock('../coach-device.js', () => ({ loadCoachDevice: async () => structuredClone(device.value), saveCoachDevice: async patch => Object.assign(device.value, patch) }))
import { budgetedFreeFetch, freeAIQuota } from './free-ai-budget.js'
beforeEach(() => { device.value = {} })
const stamp = Date.UTC(2026, 9, 3, 15)
const call = { method: 'POST', body: '{}' }, url = 'https://openrouter.ai/api/v1/chat/completions'
it('counts actual HTTP requests including repairs against one daily and rolling seven-day budget', async () => {
  const wire = vi.fn(async () => ({})), fetch = budgetedFreeFetch(wire, () => stamp)
  for (let i=0; i<50; i++) await fetch(url, call)
  await expect(fetch(url, call)).rejects.toThrow('50')
  expect(wire).toHaveBeenCalledTimes(50)
  expect(await freeAIQuota(stamp)).toMatchObject({ used: 50, limit: 50, weeklyUsed: 50, weeklyLimit: 200 })
  expect((await freeAIQuota(stamp+86400000)).used).toBe(0)
})
it('enforces 200 requests in seven days and expires old usage', async () => {
  device.value.freeUsage = Array.from({length:200}, () => stamp-86400000)
  const wire=vi.fn(), fetch=budgetedFreeFetch(wire, () => stamp)
  await expect(fetch(url, call)).rejects.toThrow('200')
  expect(wire).not.toHaveBeenCalled()
  expect((await freeAIQuota(stamp+7*86400000)).weeklyUsed).toBe(0)
})
it('serializes simultaneous requests at the quota boundary and excludes model/auth requests', async () => {
  device.value.freeUsage = Array.from({length:49}, () => stamp)
  const wire=vi.fn(async () => ({})), fetch=budgetedFreeFetch(wire, () => stamp)
  const results = await Promise.allSettled([fetch(url,call),fetch(url,call)])
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
  await fetch('https://openrouter.ai/api/v1/models',{method:'GET'})
  expect(wire).toHaveBeenCalledTimes(2); expect((await freeAIQuota(stamp)).used).toBe(50)
})
