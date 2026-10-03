import { expect, it, vi } from 'vitest'
import { createOpenRouterAuth,connectOpenRouterKey } from './openrouter-auth.js'

function fixture() {
  let session = null
  const storage = { get: async () => session, set: async value => { session = value } }
  const connect = vi.fn(), fetch = vi.fn(async () => ({ ok: true, text: async () => JSON.stringify({ key: 'fixture-api-key' }) }))
  const now = vi.fn(() => 1000)
  return { storage, connect, fetch, now, auth: createOpenRouterAuth({ storage, fetch, connect, now }) }
}
it('uses a new S256 verifier, fixed host and a code with no secret in the login URL', async () => {
  const f = fixture(), first = new URL(await f.auth.begin()), session = await f.storage.get()
  expect(first.origin).toBe('https://openrouter.ai'); expect(first.pathname).toBe('/auth')
  expect(first.searchParams.get('code_challenge_method')).toBe('S256')
  expect(first.searchParams.has('callback_url')).toBe(false)
  expect(first.href).not.toContain(session.verifier)
  expect(session.verifier.length).toBeGreaterThanOrEqual(43)
  expect(await f.auth.begin()).not.toBe(first.href)
  expect(f.fetch).not.toHaveBeenCalled()
})
it('exchanges only the current session and consumes a successful code without leaking the key to UI state', async () => {
  const f = fixture(); await f.auth.begin()
  await f.auth.complete('auth-code-fixture')
  expect(f.fetch.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/auth/keys')
  expect(JSON.parse(f.fetch.mock.calls[0][1].body)).toMatchObject({ code: 'auth-code-fixture', code_challenge_method: 'S256' })
  expect(f.connect).toHaveBeenCalledWith('fixture-api-key')
  expect(await f.storage.get()).toBeNull()
  await expect(f.auth.complete('auth-code-fixture')).rejects.toThrow('Start the OpenRouter connection again')
})
it('rejects expired sessions and API keys pasted as authorization codes before network access', async () => {
  const f = fixture(); await f.auth.begin()
  await expect(f.auth.complete('sk-or-v1-secret')).rejects.toThrow('Paste the one-time authorization code')
  f.now.mockReturnValue(601001)
  await expect(f.auth.complete('auth-code-fixture')).rejects.toThrow('Start the OpenRouter connection again')
  expect(f.fetch).not.toHaveBeenCalled(); expect(f.connect).not.toHaveBeenCalled()
})
it('refuses concurrent exchanges and does not display a provider response containing secrets', async () => {
  const f = fixture(); await f.auth.begin()
  let reply; f.fetch.mockImplementation(() => new Promise(resolve => { reply = resolve }))
  const first = f.auth.complete('auth-code-fixture'); await Promise.resolve(); await Promise.resolve()
  await expect(f.auth.complete('auth-code-fixture')).rejects.toThrow('Connection is already in progress')
  reply({ ok: false, text: async () => 'private-secret-error' })
  await expect(first).rejects.toThrow('OpenRouter did not accept the authorization code')
  expect(f.connect).not.toHaveBeenCalled()
})
it('does not unlock OpenRouter when durable key replacement fails',async()=>{
  const store={setCoachLocal:vi.fn(),update:vi.fn()},saveKey=vi.fn().mockRejectedValue(new Error('secure store failed'))
  await expect(connectOpenRouterKey('fixture-new-key',{store,saveKey})).rejects.toThrow('secure store failed')
  expect(store.setCoachLocal.mock.calls).toHaveLength(1)
  expect(store.setCoachLocal.mock.calls[0][0].requiresOpenRouterAuth).toBe(true)
  expect(saveKey).toHaveBeenCalledWith('fixture-new-key',{requireDurable:true})
  expect(store.update).not.toHaveBeenCalled()
})
it('resets the previous provider consent before enabling a securely saved connection',async()=>{
  const events=[],state={coach:{consent:{agreedAt:'previous'}}}
  const store={setCoachLocal:async patch=>events.push(patch.requiresOpenRouterAuth?'blocked':'enabled'),update:fn=>{fn(state);events.push('consent-reset')}}
  await connectOpenRouterKey('fixture-new-key',{store,saveKey:async()=>events.push('key-saved')})
  expect(events).toEqual(['blocked','key-saved','consent-reset','enabled'])
  expect(state.coach.consent).toBeNull()
})
