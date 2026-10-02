import { useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { MOBILE, shareExport } from '../lib/mobile.js'
import { Button, TextArea, TextField } from './ui.jsx'
import { nutrientText } from './PersonalFoodPicker.jsx'
import { parseMealPlan, mealPlanDocument, saveMealPlan, mealsForDate, createBlankMealPlan, MEAL_PLAN_EXAMPLE } from '../lib/personal/meal-plan.js'
import { deletePersonalRecord, setNutritionTargets } from '../lib/personal/store-actions.js'

async function sharePlan(doc, name) {
  const json = JSON.stringify(doc, null, 2)
  if (MOBILE) return shareExport(json, name)
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const link = document.createElement('a'); link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
export default function PersonalMealPlan({ date, onRecord, onEdit }) {
  const S = useStore(state => state.S)
  const plans = (S.nutrition?.mealPlans || []).filter(p => !p.deletedAt).sort((a, b) => b.updatedAt - a.updatedAt)
  const [selectedId, setSelectedId] = useState(null)
  const plan = plans.find(p => p.id === selectedId) || plans[0]
  const [text, setText] = useState(null)
  const [preview, setPreview] = useState(null)
  const [message, setMessage] = useState('')
  const fileRef = useRef(null)
  const change = mutator => useStore.getState().updatePersonal(mutator)
  function read(value) {
    try { setPreview(parseMealPlan(value)); setMessage('') } catch (error) { setPreview(null); setMessage(error.message) }
  }
  async function readFile(event) {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setMessage(t('Plan file must be under 2 MB')); return }
    try { const value = await file.text(); setText(value); read(value) } catch (error) { setMessage(error.message) }
  }
  const meals = plan ? mealsForDate(plan, date) : []
  const share = (doc, filename) => sharePlan(doc, filename).catch(error => setMessage(error.message))
  return <section className="card personal-stack">
    <h2>{t('Meal plan')}</h2>
    <p className="small muted">{t('A plan is a guide. Only meals you confirm enter the diary.')}</p>
    <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
      <Button variant="tinted" onClick={() => fileRef.current.click()}>{t('Load meal plan')}</Button>
      <Button variant="ghost" onClick={() => { const blank = createBlankMealPlan(); change(state => saveMealPlan(state, blank)); setSelectedId(blank.id) }}>{t('Create meal plan')}</Button>
      <Button variant="ghost" onClick={() => { setText(''); setPreview(null) }}>{t('Paste plan')}</Button>
    </div>
    <input ref={fileRef} type="file" accept=".json,.csv,.tsv,.txt,application/json,text/csv,text/plain" style={{ display: 'none' }} onChange={readFile} />
    {text !== null && <div className="personal-stack">
      <label>{t('Plan JSON or table')}<TextArea rows={8} value={text} onChange={event => { setText(event.target.value); setPreview(null) }} /></label>
      <div className="row" style={{ gap: 8 }}><Button onClick={() => read(text)}>{t('Check plan')}</Button><Button variant="ghost" onClick={() => { setText(null); setPreview(null) }}>{t('Cancel')}</Button></div>
    </div>}
    {preview && <div className="personal-panel personal-stack">
      <strong>{preview.name}</strong><p>{preview.days.length} {t('plan days')} · {preview.days.reduce((sum, day) => sum + day.meals.length, 0)} {t('planned meals')}</p>
      <p className="small">{nutrientText(preview.targets)}</p>
      <details><summary>{t('Preview plan')}</summary><pre className="personal-report">{JSON.stringify(mealPlanDocument(preview), null, 2)}</pre></details>
      <Button onClick={() => { change(state => saveMealPlan(state, preview)); setSelectedId(preview.id); setPreview(null); setText(null); setMessage(t('Meal plan saved')) }}>{t('Save plan')}</Button>
    </div>}
    {plan && <>
      {plans.length > 1 && <label>{t('Active plan')}<select className="field" value={plan.id} onChange={event => setSelectedId(event.target.value)}>{plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
      <div className="row between"><strong>{plan.name}</strong><span className="small muted">{nutrientText(plan.targets)}</span></div>
      {plan.note && <p className="small muted">{plan.note}</p>}
      {!meals.length && <p className="small muted">{t('No planned meals for this date. Fill the plan gradually.')}</p>}
      {meals.map(meal => <div className="personal-panel personal-stack" key={meal.id}>
        <strong>{meal.time || '—'} · {meal.name}</strong>
        {meal.items.map((item, index) => <div key={index}>{item.food.name} · {item.grams} {t('g')}</div>)}
        {meal.note && <p className="small muted">{meal.note}</p>}
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <Button disabled={!meal.items.length} onClick={() => onRecord(plan, meal)}>{t('Record eaten meal')}</Button>
          <Button variant="ghost" onClick={() => onEdit(plan, meal.dayId, meal)}>{t('Edit planned meal')}</Button>
        </div>
      </div>)}
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <Button variant="ghost" onClick={() => onEdit(plan, plan.days[0]?.id, null)} disabled={!plan.days.length}>{t('Add to plan')}</Button>
        <Button variant="tinted" onClick={() => share(mealPlanDocument(plan), 'opengym-meal-plan.json')}>{t('Share meal plan')}</Button>
        <Button variant="ghost" onClick={() => { setText(JSON.stringify(mealPlanDocument(plan), null, 2)); setPreview(null) }}>{t('Edit plan JSON')}</Button>
        <Button variant="ghost" onClick={() => { change(state => setNutritionTargets(state, plan.targets)); setMessage(t('Macro targets applied')) }}>{t('Apply plan targets')}</Button>
        <Button variant="ghost" onClick={() => change(state => deletePersonalRecord(state, 'nutrition', 'mealPlans', plan.id))}>{t('Delete plan')}</Button>
      </div>
    </>}
    {message && <p role="status" className="small personal-error">{message}</p>}
    <Button variant="ghost" onClick={() => share(MEAL_PLAN_EXAMPLE, 'opengym-meal-plan-template.json')}>{t('Share template for AI')}</Button>
    <p className="small muted">{t('JSON is the main format. Give the template to an AI, then load its file here. Empty meals can be filled later.')}</p>
  </section>
}
