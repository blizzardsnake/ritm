// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { parseMealPlan, saveMealPlan } from '../lib/personal/meal-plan.js'
import { migratePersonalState } from '../lib/personal/state.js'
import PersonalMealPlanEditor from './PersonalMealPlanEditor.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root
afterEach(() => { act(() => root?.unmount()); host?.remove() })
const sample = () => parseMealPlan(JSON.stringify({ format: 'opengym-personal-meal-plan', formatVersion: 1, id: 'plan', name: 'Original',
  days: [{ id: 'daily', weekday: 0, meals: [{ id: 'breakfast', name: 'Breakfast', items: [{ grams: 50, food: { name: 'Rice', nutrients: { kcal: 130 }, source: { type: 'usda', fdcId: 168878 } } }] }] }] }))
async function render(plan, props = {}) {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  await act(async () => root.render(<PersonalMealPlanEditor plan={plan} onSave={vi.fn(value => value)} onMealEdit={vi.fn()} onClose={vi.fn()} {...props} />))
}
async function click(label) {
  const button = [...host.querySelectorAll('button')].find(el => el.textContent === label || el.getAttribute('aria-label') === label)
  expect(button, label).toBeTruthy(); await act(async () => button.click())
}
async function fill(label, value) {
  const input = [...host.querySelectorAll('label')].find(el => el.textContent.trim() === label)?.querySelector('input,textarea')
  expect(input, label).toBeTruthy()
  await act(async () => { Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })) })
}
it('edits normal fields while retaining meal IDs, grams and provenance; saving never records intake', async () => {
  const state = migratePersonalState({}, { now: 1, profileId: 'owner' })
  const plan = saveMealPlan(state, sample(), { now: 2 })
  const close = vi.fn()
  await render(plan, { onSave: draft => saveMealPlan(state, draft, { now: 3 }), onClose: close })
  expect(host.textContent).not.toContain('JSON')
  await fill('Plan name', 'Week one'); await fill('Protein', '135,5'); await fill('Plan notes', 'Cooked weights')
  await click('Save plan')
  const saved = state.nutrition.mealPlans[0]
  expect(saved.name).toBe('Week one'); expect(saved.targets.protein).toBe(135.5); expect(saved.note).toBe('Cooked weights')
  expect(saved.days[0].meals[0].id).toBe('breakfast'); expect(saved.days[0].meals[0].items[0].food.source.fdcId).toBe(168878)
  expect(state.nutrition.meals).toEqual([]); expect(close).toHaveBeenCalledOnce()
})
it('adds a meal to the selected weekday, rather than the first day in the plan', async () => {
  let saved
  const edit = vi.fn()
  await render(sample(), { onSave: draft => { saved = parseMealPlan(JSON.stringify(draft)); return saved }, onMealEdit: edit })
  await click('Tuesday'); await click('Add to plan')
  const day = saved.days.find(day => day.weekday === 2)
  expect(day.id).toBeTruthy(); expect(edit).toHaveBeenCalledWith(saved, day.id, null)
  expect(saved.days[0].meals[0].id).toBe('breakfast')
})
it('rejects invalid dates before saving and allows staged meal deletion to be cancelled', async () => {
  const save = vi.fn(value => value), close = vi.fn()
  await render(sample(), { onSave: save, onClose: close })
  await fill('From date', '2026-10-10'); await fill('To date', '2026-10-01'); await click('Save plan')
  expect(host.querySelector('[role="alert"]')).toBeTruthy(); expect(save).not.toHaveBeenCalled()
  await click('Remove Breakfast'); await click('Cancel')
  expect(save).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledOnce()
})
