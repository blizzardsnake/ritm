// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { useStore, DEF } from '../store/useStore.js'
import { migratePersonalState } from '../lib/personal/state.js'
import { parseMealPlan } from '../lib/personal/meal-plan.js'
import { shareExport } from '../lib/mobile.js'
import PersonalMealPlan from './PersonalMealPlan.jsx'
vi.mock('../lib/mobile.js', async importOriginal => ({ ...await importOriginal(), MOBILE: true, shareExport: vi.fn().mockResolvedValue() }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root, oldS
afterEach(() => { act(() => root?.unmount()); host?.remove(); if (oldS) useStore.setState({ S: oldS }) })
it('pasted AI JSON is previewed before save; plan is shared and confirmed separately from diary data', async () => {
  oldS = useStore.getState().S
  useStore.setState({ S: migratePersonalState(structuredClone(DEF), { now: 1, profileId: 'owner' }) })
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  const record = vi.fn()
  await act(async () => root.render(<PersonalMealPlan date="2026-10-02" onRecord={record} onEdit={vi.fn()} />))
  const click = async label => { const button = [...host.querySelectorAll('button')].find(b => b.textContent === label); expect(button).toBeTruthy(); await act(async () => button.click()) }
  await click('Paste plan')
  const doc = { format: 'opengym-personal-meal-plan', formatVersion: 1, name: 'AI plan', days: [{ weekday: 0, meals: [{ name: 'Lunch', time: '13:00', items: [{ grams: 50, food: { name: 'Rice', nutrients: { kcal: 130 } } }] }] }] }
  const textarea = host.querySelector('textarea')
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, JSON.stringify(doc)); textarea.dispatchEvent(new Event('input', { bubbles: true })) })
  await click('Check plan')
  expect(host.textContent).toContain('AI plan')
  expect(useStore.getState().S.nutrition.mealPlans).toHaveLength(0)
  await click('Save plan')
  expect(useStore.getState().S.nutrition.meals).toHaveLength(0)
  await click('Share meal plan')
  expect(parseMealPlan(shareExport.mock.calls.at(-1)[0]).name).toBe('AI plan')
  await click('Record eaten meal')
  expect(record.mock.calls[0][1].items[0].grams).toBe(50)
  expect(useStore.getState().S.nutrition.meals).toHaveLength(0)
})
