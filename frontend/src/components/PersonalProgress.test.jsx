// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { migratePersonalState } from '../lib/personal/state.js'
const mock = vi.hoisted(() => ({ state: null, update: vi.fn() }))
vi.mock('../store/useStore.js', () => ({ useStore: { getState: () => ({ S: mock.state, updatePersonal: fn => { mock.update(); fn(mock.state) } }) } }))
vi.mock('../lib/i18n.js', () => ({ t: (key, ...args) => key.replace(/\{(\d+)\}/g, (_, index) => args[index]), dateLocale: () => 'en' }))
import PersonalProgress from './PersonalProgress.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root, page
afterEach(() => { if (root) act(() => root.unmount()); page?.remove(); vi.clearAllMocks() })
async function mount() {
  mock.state = migratePersonalState({ unit: 'kg', weekStart: 1, workouts: [], routines: [], bodyweight: [] }, { profileId: 'owner' })
  page = document.createElement('div'); document.body.append(page); root = createRoot(page)
  await act(async () => root.render(<PersonalProgress S={mock.state} />))
}
it('shows unset goals and unknown recovery without fictional values or earned medals', async () => {
  await mount()
  expect(page.textContent).toContain('Not set')
  expect(page.textContent).toContain('0 days with data')
  expect(page.querySelectorAll('[data-achievement]')).toHaveLength(8)
  expect(page.querySelectorAll('[data-achievement][data-qualified="true"]')).toHaveLength(0)
})
it('edits normal nullable fields and saves goals through original persistence', async () => {
  await mount()
  await act(async () => page.querySelector('[data-edit-goals]').click())
  expect(page.querySelector('textarea')).toBeNull()
  await act(async () => {
    const input = page.querySelector('input[name="steps"]')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, '8000'); input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => page.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  expect(mock.state.progressGoals.goals.find(goal => goal.type === 'steps').value).toBe(8000)
  expect(mock.update).toHaveBeenCalledOnce()
})
it('persists an earned award once and retains its first date after deletion of its workout', async () => {
  await mount()
  mock.state.workouts = [{ id: 'one', d: new Date().toISOString().slice(0, 10), entries: [{ id: 'bench', sets: [{ done: true, w: 50, r: 10 }] }] }]
  await act(async () => root.render(<PersonalProgress S={{ ...mock.state }} />))
  const award = mock.state.progressGoals.awards[0]
  expect(award).toMatchObject({ id: 'award:workout-1', qualified: true, notifiedAt: null })
  mock.state.workouts = []
  await act(async () => root.render(<PersonalProgress S={{ ...mock.state }} />))
  expect(mock.state.progressGoals.awards[0]).toMatchObject({ qualified: false, firstAwardedAt: award.firstAwardedAt })
})
