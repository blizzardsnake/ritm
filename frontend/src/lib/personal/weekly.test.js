import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { migratePersonalState } from './state.js'
import { buildAnalysis } from './report.js'
import { createExchangeSnapshot } from './exchange.js'
import { planFingerprint } from './proposal.js'
const device = vi.hoisted(() => ({ settings: null, key: 'fake-key' }))
vi.mock('../coach-device.js', () => ({ loadCoachDevice: async () => structuredClone(device.settings), saveCoachDevice: async patch => { Object.assign(device.settings, patch); return device.settings } }))
vi.mock('../coach-secrets.js', () => ({ getApiKey: async () => device.key }))
import { createWeeklyPayload, requestWeeklyReview, weeklyConsent } from './weekly.js'
const now = Date.parse('2026-10-03T12:00:00Z')
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now)
  device.settings = { mode: 'byok', provider: 'compatible', model: 'openrouter/free', baseUrl: 'https://openrouter.ai/api', freeOnly: true }
  device.key = 'fake-key'
})
afterEach(() => vi.useRealTimers())
async function fixture() {
  const s = migratePersonalState({ unit: 'kg', workouts: [], routines: [{ id: 'A', name: 'Strength', ex: [{ id: '0025', sets: 3, reps: 5, weight: 60 }] }], week: {}, bodyweight: [],
    password: 'private-password', coach: { profile: { goal: 'strength', notes: 'Limited equipment', token: 'private-token' } } }, { profileId: 'owner', now })
  s.health.config.origins = ['mi']
  s.health.daily = [{ id: 'selected', date: '2026-10-03', origins: ['mi'], steps: 0, activeKcal: 200, totalKcal: 2000, updatedAt: now }, { id: 'other', date: '2026-10-03', origins: ['other'], steps: 99000 }]
  s.health.sleep = [{ id: 'private-source', origin: 'other', date: '2026-10-03', asleepMinutes: 999 }]
  s.nutrition.meals = [{ id: 'meal', date: '2026-10-03', items: [{ grams: 100, food: { name: 'Rice', apiKey: 'private-food' }, nutrients: { kcal: 130, protein: 2.7, fat: 0.3, carbs: 28 } }] }]
  const snapshot = await createExchangeSnapshot(buildAnalysis(s, { now }))
  const doc = { format: 'ritm-weekly-proposal', formatVersion: 1, id: 'cloud-1', profileId: 'owner', generatedAt: now,
    analysisHash: snapshot.checksum, planHash: planFingerprint(s), window: snapshot.payload.window, title: 'Weekly review', summary: 'Need more complete days.', limitations: ['No sleep data'], changes: [] }
  return { s, snapshot, doc }
}
const response = doc => ({ ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(doc) } }] }) })

it('sends the combined observed history and original muscle load, keeping incomplete food and missing sleep explicit and secrets out', async () => {
  const { s, snapshot } = await fixture()
  const payload = createWeeklyPayload(s, snapshot)
  expect(payload.history.nutrition.meals[0].items[0].grams).toBe(100)
  expect(payload.summaries.nutrition.at(-1)).toMatchObject({ complete: false, totals: { kcal: 130 } })
  expect(payload.summaries.health.at(-1)).toMatchObject({ steps: 0, activeKcal: 200, totalKcal: 2000, sleep: [] })
  expect(payload.summaries.muscleLoad).toEqual({})
  expect(payload.context.goal).toBe('strength')
  expect(JSON.stringify(payload)).not.toMatch(/private-|99000|999/)
})
it('uses the original weighted zone totals for custom historical exercises, excluding warmups', async () => {
  const { s } = await fixture()
  s.workouts.push({ id: 'zones', d: '2026-10-03', entries: [{ id: 'custom-lift', muscleSnapshot: { muscleWeights: { chest: 1, triceps: 0.5 } }, sets: [
    { w: 10, r: 5, phase: 'warmup', done: true }, { w: 20, r: 5, done: true }, { w: 20, r: 5, done: true },
  ] }] })
  const snapshot = await createExchangeSnapshot(buildAnalysis(s, { now }))
  expect(createWeeklyPayload(s, snapshot).summaries.muscleLoad).toEqual({ chest: 2, triceps: 1 })
})
it('requires fresh consent for the actual destination, a verified report and a free-only setup before any network call', async () => {
  const { s, snapshot } = await fixture(), calls = []
  const fetch = async (...args) => { calls.push(args); throw new Error('should never reach') }
  await expect(requestWeeklyReview(s, snapshot, { fetch })).rejects.toThrow()
  const consent = weeklyConsent(device.settings)
  device.settings.model = 'owner/paid'
  await expect(requestWeeklyReview(s, snapshot, { consent, fetch })).rejects.toThrow()
  device.settings.model = 'openrouter/free'; device.key = null
  await expect(requestWeeklyReview(s, snapshot, { consent, fetch })).rejects.toThrow()
  device.key = 'fake-key'; const corrupted = structuredClone(snapshot); corrupted.payload.profileId = 'other'
  await expect(requestWeeklyReview(s, corrupted, { consent, fetch })).rejects.toThrow()
  expect(calls).toHaveLength(0)
})
it('returns a validated suggestion without applying it, with zero-price privacy constraints in the actual HTTP request', async () => {
  const { s, snapshot, doc } = await fixture(), before = JSON.stringify(s), bodies = []
  const proposal = await requestWeeklyReview(s, snapshot, { consent: weeklyConsent(device.settings), language: 'ru',
    fetch: async (url, init) => {
      expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
      const body = JSON.parse(init.body); bodies.push(body)
      expect(body.provider).toMatchObject({ data_collection: 'deny', max_price: { prompt: 0, completion: 0, request: 0, image: 0 } })
      expect(body.messages[1].content).toContain('Rice')
      expect(body.messages[1].content).not.toContain('private-')
      return response(doc)
    } })
  expect(proposal.changes).toEqual([])
  expect(JSON.stringify(s)).toBe(before)
  expect(bodies).toHaveLength(1)
  expect(device.settings.daily.n).toBe(1)
})
it('refuses malformed or foreign AI answers and stops at the daily cap without leaking the key in errors', async () => {
  const { s, snapshot, doc } = await fixture()
  await expect(requestWeeklyReview(s, snapshot, { consent: weeklyConsent(device.settings), fetch: async () => response({ ...doc, profileId: 'other' }) })).rejects.toThrow()
  device.settings.daily = { d: '2026-10-03', n: 10 }
  let calls = 0
  await expect(requestWeeklyReview(s, snapshot, { consent: weeklyConsent(device.settings), fetch: async () => { calls++; return response(doc) } })).rejects.toThrow()
  expect(calls).toBe(0)
})
