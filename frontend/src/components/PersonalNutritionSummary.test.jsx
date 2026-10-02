// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import PersonalNutritionSummary from './PersonalNutritionSummary.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root
afterEach(() => { act(() => root?.unmount()); host?.remove() })
it('never invents progress for unknown intake or unset targets, and identifies a partial total', () => {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  const summary = { itemCount: 2, mealCount: 1, complete: false, totals: { kcal: 65, protein: null, fat: 1, carbs: 14 }, missing: { kcal: 1, protein: 2, fat: 0, carbs: 0 } }
  act(() => root.render(<PersonalNutritionSummary summary={summary} target={{ kcal: 2000, protein: 130 }} />))
  expect(host.textContent).toContain('Partial diary'); expect(host.textContent).toContain('65')
  expect(host.querySelector('[aria-label="Protein"] [role="progressbar"]')).toBeNull()
  expect(host.querySelector('[aria-label="Fat"] [role="progressbar"]')).toBeNull()
  expect(host.querySelector('[aria-label="Calories"] [role="progressbar"]').getAttribute('aria-valuenow')).toBe('65')
  expect(host.textContent).toContain('items missing a value')
})
