// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
const platform = vi.hoisted(()=>({native:true}))
vi.mock('@capacitor/core',()=>({Capacitor:{isNativePlatform:()=>platform.native}}))

// A stand-in for what @capacitor/core's registerPlugin() really returns: a Proxy that turns ANY
// property — `then` included — into a method wrapper whose native call fails asynchronously
// without ever invoking the callbacks it was handed. Resolving a promise with that object makes
// the promise wait for `then` to call back, which it never does (issues #42 / #58).
const calls = []
const backing = new Map()
const impl = {
  get: async k => (backing.has(k) ? backing.get(k) : null),
  set: async (k, v) => { backing.set(k, v) },
  remove: async k => backing.delete(k)
}
const SecureStorage = new Proxy({}, {
  get(_, prop) {
    if (prop === '$$typeof') return undefined
    if (prop === 'toJSON') return () => ({})
    return (...args) => {
      calls.push(String(prop))
      if (impl[prop]) return impl[prop](...args)
      return Promise.reject(new Error(`"SecureStorage.${String(prop)}()" is not implemented on android`))
    }
  }
})
vi.mock('@aparajita/capacitor-secure-storage', () => ({ SecureStorage }))

const secrets = await import('./coach-secrets.js')

const within = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`hung for ${ms} ms`)), ms))])

describe('coach-secrets against a Capacitor-style plugin proxy', () => {
  beforeEach(() => { platform.native=true; calls.length = 0; backing.clear() })

  it('a round trip settles instead of waiting on the proxy\'s never-answering then()', async () => {
    await within(secrets.setApiKey('sk-live-1'), 1000)
    expect(await within(secrets.getApiKey(), 1000)).toBe('sk-live-1')
    await within(secrets.clearApiKey(), 1000)
    expect(await within(secrets.getApiKey(), 1000)).toBe(null)
    expect(calls).not.toContain('then')
  })

  it('goes through the platform store, not the in-memory fallback', async () => {
    await within(secrets.setApiKey('sk-live-2'), 1000)
    expect([...backing.keys()]).toEqual(['coach.apiKey'])
    expect(calls).toEqual(['set'])
  })
  it('keeps web preview keys in memory without invoking the plugin localStorage fallback',async()=>{
    platform.native=false
    await secrets.setApiKey('fixture-web-key')
    expect(await secrets.getApiKey()).toBe('fixture-web-key')
    await secrets.clearApiKey()
    expect(await secrets.getApiKey()).toBeNull()
    expect(calls).toEqual([]); expect(backing.size).toBe(0)
  })
  it('a failed durable save rejects instead of reporting a new key while reading the old one',async()=>{
    backing.set('coach.apiKey','fixture-old-provider-key')
    const original=impl.set
    impl.set=async()=>{throw new Error('store unavailable')}
    try { await expect(secrets.setApiKey('fixture-new-openrouter-key',{requireDurable:true})).rejects.toThrow('Could not save the API key securely') }
    finally {impl.set=original}
    expect(await secrets.getApiKey()).toBe('fixture-old-provider-key')
  })
})
