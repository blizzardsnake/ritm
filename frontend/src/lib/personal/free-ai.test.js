import { expect, it } from 'vitest'
import compatible from '../../../../api/coach/core/adapters/compatible.js'
const cfg = { provider: 'compatible', providerOptions: { compatible: { baseUrl: 'https://openrouter.ai/api', freeOnly: true } } }
const env = { OPENAI_COMPAT_API_KEY: 'fake-owner-key' }
const response = (data, status = 200) => ({ ok: status === 200, status, text: async () => JSON.stringify(data) })
const answer = { choices: [{ finish_reason: 'stop', message: { content: 'ok' } }] }
it('lists only currently advertised free variants with zero prices, keeping the free router and dropping missing or paid prices', async () => {
  const result = await compatible.models(cfg, env, { fetch: async () => response({ data: [
    { id: 'openrouter/free', pricing: { prompt: '0', completion: '0' } },
    { id: 'owner/model:free', pricing: { prompt: '0', completion: '0', request: '0' } },
    { id: 'owner/paid', pricing: { prompt: '1', completion: '1' } },
    { id: 'owner/changed:free', pricing: { prompt: '0', completion: '0.1' } },
    { id: 'owner/unknown:free' }, { id: 'owner/blank:free', pricing: { prompt: '', completion: '' } },
  ] }) })
  expect(result.models).toEqual(['openrouter/free', 'owner/model:free'])
})
it('blocks a paid model, a changed destination and a missing key before making any network request', async () => {
  const calls = [], fetch = async (...args) => { calls.push(args); return response(answer) }
  for (const model of ['openrouter/auto', 'owner/paid', 'owner/free-model']) expect((await compatible.invoke({ cfg, env, model, prompt: 'test', fetch })).code).not.toBe(0)
  const altered = structuredClone(cfg); altered.providerOptions.compatible.baseUrl = 'https://another.example/api'
  expect((await compatible.invoke({ cfg: altered, env, model: 'openrouter/free', prompt: 'test', fetch })).code).not.toBe(0)
  expect((await compatible.invoke({ cfg, env: {}, model: 'openrouter/free', prompt: 'test', fetch })).code).not.toBe(0)
  expect(calls).toHaveLength(0)
})
it('sends a zero-price limit and data-collection filter and preserves them when retrying unsupported JSON mode', async () => {
  const bodies = []
  const fetch = async (url, init) => { expect(url).toBe('https://openrouter.ai/api/v1/chat/completions'); bodies.push(JSON.parse(init.body)); return bodies.length === 1 ? response({ error: { message: 'response_format unsupported' } }, 400) : response(answer) }
  expect((await compatible.invoke({ cfg, env, model: 'openrouter/free', prompt: 'test', fetch })).code).toBe(0)
  expect(bodies).toHaveLength(2)
  for (const body of bodies) { expect(body.model).toBe('openrouter/free'); expect(body.models).toBeUndefined(); expect(body.provider).toMatchObject({ data_collection: 'deny', max_price: { prompt: 0, completion: 0, request: 0, image: 0 } }) }
})
it('keeps the generic compatible endpoint behavior when free-only mode is absent', async () => {
  const plain = { providerOptions: { compatible: { baseUrl: 'https://own.example' } } }
  let body
  const result = await compatible.invoke({ cfg: plain, env: {}, model: 'own-model', prompt: 'test', fetch: async (_url, init) => { body = JSON.parse(init.body); return response(answer) } })
  expect(result.code).toBe(0); expect(body.provider).toBeUndefined()
})
