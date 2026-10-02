import { expect, it } from 'vitest'
import { webcrypto } from 'node:crypto'
import { createWebDeviceLock, LOCK_KEY } from './device-lock.js'

function fixture() {
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  let now = 1000
  const make = () => createWebDeviceLock({ storage, crypto: webcrypto, now: () => now })
  return { values, make, advance: ms => { now += ms } }
}
it('stores a salted verifier outside profile data and a fresh launch remains locked', async () => {
  const f = fixture(), lock = f.make()
  expect((await lock.getStatus()).enabled).toBe(false)
  await expect(lock.configure({ password: 'short' })).rejects.toThrow()
  await lock.configure({ password: 'fixture-password-A' })
  expect(f.values.get(LOCK_KEY)).not.toContain('fixture-password-A')
  const second = f.make()
  expect(await second.getStatus()).toMatchObject({ enabled: true, unlocked: false, biometricAvailable: false })
  await expect(second.unlock({ password: 'incorrect' })).rejects.toThrow()
  expect((await second.getStatus()).unlocked).toBe(false)
  await second.unlock({ password: 'fixture-password-A' })
  expect((await second.getStatus()).unlocked).toBe(true)
  await second.lock()
  expect((await second.getStatus()).unlocked).toBe(false)
})
it('requires the current password to change/remove protection and persists throttling across reload', async () => {
  const f = fixture(), lock = f.make()
  await lock.configure({ password: 'fixture-password-A' })
  await expect(lock.configure({ password: 'fixture-password-B', currentPassword: 'wrong' })).rejects.toThrow()
  await expect(lock.remove({ password: 'wrong' })).rejects.toThrow()
  for (let i = 0; i < 3; i++) await expect(lock.unlock({ password: 'wrong' })).rejects.toThrow()
  expect((await f.make().getStatus()).retryAt).toBeGreaterThan(1000)
  await expect(lock.unlock({ password: 'fixture-password-A' })).rejects.toThrow()
  f.advance(31000)
  await lock.configure({ password: 'fixture-password-B', currentPassword: 'fixture-password-A' })
  await expect(lock.unlock({ password: 'fixture-password-A' })).rejects.toThrow()
  await lock.remove({ password: 'fixture-password-B' })
  expect((await f.make().getStatus()).enabled).toBe(false)
})
it('fails closed on damaged or downgraded verifier settings', async () => {
  const f = fixture()
  f.values.set(LOCK_KEY, '{damaged')
  await expect(f.make().getStatus()).rejects.toThrow()
  await expect(f.make().configure({ password: 'fixture-password-A' })).rejects.toThrow()
  f.values.set(LOCK_KEY, JSON.stringify({ version: 1, iterations: 1, salt: 'x', hash: 'x' }))
  await expect(f.make().getStatus()).rejects.toThrow()
})
