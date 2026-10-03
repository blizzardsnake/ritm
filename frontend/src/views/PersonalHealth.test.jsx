// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { migratePersonalState } from '../lib/personal/state.js'
const mock = vi.hoisted(() => ({ android: false, state: null, request: vi.fn(), sync: vi.fn() }))
vi.mock('../lib/personal/health-native.js', () => ({ healthNativeAvailable: () => mock.android, syncPersonalHealth: (...args) => mock.sync(...args), PersonalHealth: { requestPermissions: (...args) => mock.request(...args), openSettings: vi.fn() } }))
vi.mock('../store/useStore.js', () => ({ useStore: Object.assign(selector => selector(mock.state), { getState: () => mock.state }) }))
vi.mock('../lib/i18n.js', () => ({ t: (key, ...args) => key.replace(/\{(\d+)\}/g, (_, index) => args[index]), dateLocale: () => 'en' }))
import PersonalHealth from './PersonalHealth.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root, page
afterEach(() => { if (root) act(() => root.unmount()); page?.remove(); vi.clearAllMocks(); mock.android = false })
async function mount(android) {
  mock.android = android
  const S = migratePersonalState({}, { profileId: 'owner' })
  S.health.config.origins = ['mi']; S.health.status = { availability: 'available', permissions: { steps: true, sleep: false }, sources: [{ packageName: 'mi', label: 'Actual source' }] }
  S.health.daily = [{ id: 'day', origins: ['mi'], date: new Date().toISOString().slice(0, 10), steps: 0 }]
  mock.state = { S, updatePersonal: fn => fn(S) }
  page = document.createElement('div'); document.body.append(page); root = createRoot(page)
  await act(async () => root.render(<MemoryRouter><PersonalHealth /></MemoryRouter>))
}
it('explains Android-only live reads without inventing connected watch data in the browser', async () => {
  await mount(false)
  expect(page.textContent).toContain('Live watch import works in the Android app.')
  expect(mock.sync).not.toHaveBeenCalled()
  expect(page.querySelector('button[data-health-permissions]')).toBeNull()
})
it('shows actual source and permission state and requests only after an explicit tap', async () => {
  await mount(true)
  expect(page.textContent).toContain('Actual source')
  expect(page.textContent).toContain('Not permitted')
  expect(mock.request).not.toHaveBeenCalled()
  await act(async () => page.querySelector('button[data-health-permissions]').click())
  expect(mock.request).toHaveBeenCalledWith({ metrics: ['steps', 'distance', 'activeKcal', 'totalKcal', 'sleep', 'heartRate', 'activities'] })
  expect(mock.request.mock.calls[0][0]).not.toHaveProperty('background')
})
it('shows a metric read error next to a retained value with its successful import time', async () => {
  await mount(true)
  const h = mock.state.S.health
  h.status = { ...h.status, lastSyncAt: 100, lastAttemptAt: 200, metricStatus: { steps: 'read_error' } }
  h.daily[0] = { ...h.daily[0], steps: 1000, ingestedAt: 100, metricIngestedAt: { steps: 100 }, metricStatus: { steps: 'read_error' } }
  await act(async () => root.render(<MemoryRouter><PersonalHealth /></MemoryRouter>))
  const card = page.querySelector('[data-health-metric="steps"]')
  expect(card?.textContent).toContain('Could not refresh; showing recorded value')
  expect(card?.getAttribute('data-health-imported-at')).toBe('100')
  expect(page.textContent).toContain('Last read attempt')
})
