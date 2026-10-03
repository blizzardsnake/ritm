import { expect, it, vi } from 'vitest'
import pollinations from '../../../../api/coach/core/adapters/pollinations.js'
import { BUILTIN_AI_SETTINGS, isBuiltinAI } from '../../../../api/coach/core/providers.js'

it('uses the verified anonymous endpoint with no credential and asks to exclude public feeds', async () => {
  let request
  const fetch = vi.fn(async (url, init) => { request = { url, init }; return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{"summary":"fixture"}' } }] }) } })
  const result = await pollinations.invoke({ cfg: { provider: 'pollinations' }, env: { OPENAI_API_KEY: 'not-for-this-host' }, model: 'openai-fast', prompt: 'Fixture', fetch })
  expect(result.code).toBe(0)
  expect(request.url).toBe('https://text.pollinations.ai/openai')
  expect(request.init.headers.authorization).toBeUndefined()
  expect(JSON.parse(request.init.body)).toMatchObject({ model: 'openai-fast', private: true, stream: false, max_tokens: 4096 })
  expect(JSON.parse(request.init.body).response_format).toBeUndefined()
  expect(isBuiltinAI(BUILTIN_AI_SETTINGS)).toBe(true)
})
it('refuses other hosts/models and does not fall back to a paid provider', async () => {
  const fetch = vi.fn()
  for (const options of [{ cfg: { provider: 'pollinations', providerOptions: { pollinations: { baseUrl: 'https://evil.example' } } }, model: 'openai-fast' }, { cfg: { provider: 'pollinations' }, model: 'paid-model' }]) {
    expect((await pollinations.invoke({ ...options, prompt: 'Fixture', fetch })).code).not.toBe(0)
  }
  expect(fetch).not.toHaveBeenCalled()
})
