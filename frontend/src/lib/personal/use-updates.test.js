import { expect, it, vi } from 'vitest'
import { startUpdateChecks } from './use-updates.js'

it('checks at startup, visible foreground and native resume, then removes listeners', async () => {
  const doc = new EventTarget(); doc.visibilityState = 'visible'
  const check = vi.fn(), remove = vi.fn(), every = vi.fn(() => 1), stopEvery = vi.fn()
  let resume
  const app = { addListener: vi.fn(async (_name, fn) => { resume = fn; return { remove } }) }
  const controller = { getSnapshot: () => ({ supported: true }), check }
  const stop = startUpdateChecks(controller, { doc, app, every, stopEvery })
  expect(check).toHaveBeenCalledTimes(1)
  doc.dispatchEvent(new Event('visibilitychange')); resume({ isActive: true })
  expect(check).toHaveBeenCalledTimes(3)
  doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange')); resume({ isActive: false })
  expect(check).toHaveBeenCalledTimes(3)
  await Promise.resolve(); stop()
  doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange')); resume({ isActive: true })
  expect(check).toHaveBeenCalledTimes(3); expect(remove).toHaveBeenCalledOnce(); expect(stopEvery).toHaveBeenCalledWith(1)
})
it('a late native listener is removed after cleanup and web previews do not register a listener', async () => {
  const doc = new EventTarget(), remove = vi.fn()
  let resolve
  const app = { addListener: vi.fn(() => new Promise(done => { resolve = done })) }
  const controller = { getSnapshot: () => ({ supported: true }), check: vi.fn() }
  const stop = startUpdateChecks(controller, { doc, app, every: () => 1, stopEvery: () => {} }); stop()
  resolve({ remove }); await Promise.resolve(); expect(remove).toHaveBeenCalledOnce()
  startUpdateChecks({ getSnapshot: () => ({ supported: false }) }, { app }); expect(app.addListener).toHaveBeenCalledTimes(1)
})
