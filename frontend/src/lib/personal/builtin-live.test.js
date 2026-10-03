// Explicit opt-in integration probe. Only synthetic data, never an owner's diary.
import { expect, it, vi } from 'vitest'
import { BUILTIN_AI_SETTINGS } from '../../../../api/coach/core/providers.js'
import { runPipeline } from '../../../../api/coach/core/pipeline.js'
import { build } from '../../../../api/coach/core/payload.js'
import pollinations from '../../../../api/coach/core/adapters/pollinations.js'
import { migratePersonalState } from './state.js'
import { buildAnalysis } from './report.js'
import { createExchangeSnapshot } from './exchange.js'
import { requestWeeklyReview, weeklyConsent } from './weekly.js'
const device = vi.hoisted(() => ({ settings: null }))
vi.mock('../coach-device.js', () => ({ loadCoachDevice: async () => ({ ...device.settings }), saveCoachDevice: async patch => { Object.assign(device.settings, patch); return device.settings } }))
vi.mock('../coach-secrets.js', () => ({ getApiKey: async () => null }))
const probeFetch = async (url, init) => {
 const body = JSON.parse(init.body);
 const response = await fetch(url, init);
 console.log(JSON.stringify({status: response.status, model: body.model, format: body.response_format?.type, tokens: body.max_tokens, systemChars: body.messages[0].content.length, promptChars: body.messages[1].content.length}));
 return response;
};
const live = process.env.RITM_LIVE_AI === '1'
const now = Date.now(), date = new Date(now).toISOString().slice(0, 10)
const state = () => migratePersonalState({ lang: 'ru', unit: 'kg', routines: [{ id: 'probe', name: 'Synthetic routine', ex: [{ id: '0025', sets: 3, reps: 8, weight: 40 }] }], week: {}, customEx: [], workouts: [], bodyweight: [], coach: { consent: { agreedAt: new Date(now).toISOString(), version: 1 }, profile: { goal: 'strength', experience: 'beginner', daysPerWeek: 3 } } }, now)

it.skipIf(!live)('LIVE: built-in training pipeline produces a validated real answer without a key', async () => {
  const payload = build(state(), { kind: 'review', handle: 'synthetic-probe', lang: 'ru' })
  const answer = await runPipeline({ adapter: pollinations, cfg: { provider: 'pollinations' }, kind: 'review', payload,
    model: 'openai-fast', timeoutMs: 120000, invokeOpts: { fetch: probeFetch, env: {} } })
  expect(answer.ok, JSON.stringify({ errorClass: answer.errorClass, validation: answer.validation?.errors })).toBe(true)
  expect((answer.result?.summary || answer.reading || '').length).toBeGreaterThan(5)
}, 150000)

it.skipIf(!live)('LIVE: combined nutrition and training report produces a validated proposal without a key', async () => {
  device.settings = { ...BUILTIN_AI_SETTINGS }
  const s = state(), snapshot = await createExchangeSnapshot(buildAnalysis(s, { from: date, to: date, now }))
  const answer = await requestWeeklyReview(s, snapshot, { consent: weeklyConsent(device.settings), language: 'ru', fetch: probeFetch })
  expect(answer.summary.length).toBeGreaterThan(5)
  expect(answer.profileId).toBe(s.personalProfile.id)
  expect(Array.isArray(answer.changes)).toBe(true)
}, 180000)
