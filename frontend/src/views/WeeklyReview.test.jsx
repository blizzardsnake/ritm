// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { migratePersonalState } from '../lib/personal/state.js'
import { buildAnalysis } from '../lib/personal/report.js'
import { createExchangeSnapshot } from '../lib/personal/exchange.js'
import { planFingerprint } from '../lib/personal/proposal.js'
const mock = vi.hoisted(() => ({ state: null, settings: null, snapshot: null, doc: null, calls: 0 }))
vi.mock('../store/useStore.js', () => {
  const store = selector => selector({ S: mock.state, coachLocal: mock.settings })
  store.getState = () => ({ S: mock.state, updatePersonal: fn => { const next = structuredClone(mock.state); fn(next); mock.state = next } })
  return { useStore: store }
})
vi.mock('../lib/mobile.js', () => ({ MOBILE: true, readJsonFile: async () => null, writeJsonFile: async () => {} }))
vi.mock('../lib/coach-device.js', () => ({ loadCoachDevice: async () => structuredClone(mock.settings), saveCoachDevice: async patch => Object.assign(mock.settings, patch) }))
vi.mock('../lib/coach-secrets.js', () => ({ getApiKey: async () => 'fake-key' }))
vi.mock('../lib/capacitor-fetch.js', () => ({ nativeFetch: async () => { mock.calls++; return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(mock.doc) } }] }) } } }))
vi.mock('../lib/i18n.js', () => ({ t: (key, ...args) => key.replace(/\{(\d+)\}/g, (_, index) => args[index]), getLang: () => 'en', dateLocale: () => 'en' }))
import WeeklyReview from './WeeklyReview.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root, page
beforeEach(async () => {
  const now = Date.now()
  mock.calls = 0
  mock.settings = { mode: 'byok', provider: 'compatible', model: 'openrouter/free', baseUrl: 'https://openrouter.ai/api', freeOnly: true }
  mock.state = migratePersonalState({ unit: 'kg', workouts: [], routines: [{ id: 'A', name: 'Strength', ex: [{ id: '0025', weight: 60, sets: 3, reps: 5 }] }], bodyweight: [] }, { profileId: 'owner', now })
  mock.snapshot = await createExchangeSnapshot(buildAnalysis(mock.state, { now }))
  mock.doc = { format: 'ritm-weekly-proposal', formatVersion: 1, id: 'cloud-ui', profileId: 'owner', generatedAt: now,
    analysisHash: mock.snapshot.checksum, planHash: planFingerprint(mock.state), window: mock.snapshot.payload.window,
    title: 'Recovery week', summary: 'Reduce the load.', limitations: ['No sleep data'], changes: [
      { id: 'load', type: 'exercise', routineId: 'A', exerciseId: '0025', field: 'weight', value: 55, unit: 'kg', reason: 'Lower load', evidence: ['plan.routines:A'] },
    ] }
  page = document.createElement('div'); document.body.append(page); root = createRoot(page)
})
afterEach(() => { act(() => root?.unmount()); page?.remove(); vi.clearAllMocks() })
const render = async () => act(async () => root.render(<MemoryRouter><WeeklyReview snapshot={mock.snapshot} /></MemoryRouter>))
const button = text => [...page.querySelectorAll('button')].find(b => b.textContent.includes(text))
const click = async el => act(async () => { el.click(); await vi.dynamicImportSettled() })
const analyse = async () => {
  await click(page.querySelector('[data-weekly-consent]')); await click(button('Analyse this week'))
  await act(async () => vi.waitFor(() => expect(mock.state.weeklyReviews.proposals).toHaveLength(1)))
}

it('gates the new nutrition/recovery disclosure, previews a real cloud reply, and applies only after an explicit click', async () => {
  await render()
  expect(button('Analyse this week').disabled).toBe(true)
  expect(page.textContent).toContain('Food names, portions and notes')
  expect(page.textContent).toContain('sleep')
  await analyse()
  expect(mock.calls).toBe(1)
  expect(mock.state.routines[0].ex[0].weight).toBe(60)
  expect(page.textContent).toContain('Recovery week')
  expect(page.querySelector('[data-next-session]').textContent).toContain('55')
  expect(page.querySelector('textarea[aria-label="JSON"]')).toBeNull()
  await click(button('Apply selected changes')); await render()
  expect(mock.state.routines[0].ex[0].weight).toBe(55)
  expect(mock.state.weeklyReviews.journal).toHaveLength(1)
  await click(button('Undo changes')); await render()
  expect(mock.state.routines[0].ex[0].weight).toBe(60)
  expect(mock.state.weeklyReviews.journal[0].status).toBe('undone')
})
it('blocks a stale preview after a manual plan edit without discarding the recommendation', async () => {
  await render(); await analyse()
  mock.state.routines[0].ex[0].weight = 70
  await render()
  expect(page.textContent).toContain('The plan changed')
  expect(button('Apply selected changes').disabled).toBe(true)
  expect(mock.state.weeklyReviews.proposals).toHaveLength(1)
})
it('retains a manual edit when undo conflicts and identifies the affected parameter', async () => {
  await render(); await analyse()
  await click(button('Apply selected changes')); await render()
  mock.state.routines[0].ex[0].weight = 65
  await click(button('Undo changes')); await render()
  expect(page.textContent).toContain('Manual changes prevent undo')
  expect(mock.state.routines[0].ex[0].weight).toBe(65)
  expect(mock.state.weeklyReviews.journal[0].status).toBe('applied')
})
it('keeps before-values visible when deselecting, and marks only accepted parameters as applied', async () => {
  mock.doc.changes.push({ id: 'food', type: 'nutrition', field: 'protein', value: 160, unit: 'g', reason: 'Example target', evidence: ['history.nutrition.targets'] })
  await render(); await analyse()
  await click(page.querySelector('[aria-label="Select change: load"]'))
  expect(page.querySelector('[data-weekly-change="load"]').textContent).toContain('60')
  await click(button('Apply selected changes')); await render()
  expect(mock.state.routines[0].ex[0].weight).toBe(60)
  expect(mock.state.nutrition.targets[0].protein).toBe(160)
  expect(page.querySelectorAll('[data-weekly-change]')).toHaveLength(1)
  expect(page.querySelector('[data-weekly-change="load"]')).toBeNull()
})
