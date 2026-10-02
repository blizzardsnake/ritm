import { useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { MOBILE, shareExport } from '../lib/mobile.js'
import { Button, TextArea } from './ui.jsx'
import Icon from './Icon.jsx'
import PersonalMealPlanEditor, { planDayLabel } from './PersonalMealPlanEditor.jsx'
import { nutrientText } from './PersonalFoodPicker.jsx'
import { mealCountText } from '../lib/personal/ui-format.js'
import { parseMealPlan, mealPlanDocument, saveMealPlan, mealsForDate, createBlankMealPlan, MEAL_PLAN_EXAMPLE } from '../lib/personal/meal-plan.js'
import { deletePersonalRecord, setNutritionTargets } from '../lib/personal/store-actions.js'

async function sharePlan(doc, name) {
  const json = JSON.stringify(doc, null, 2)
  if (MOBILE) return shareExport(json, name)
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const link = document.createElement('a'); link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
function ImportPreview({ plan }) {
  return <div className="personal-stack ritm-import-preview">
    <div className="ritm-section-heading"><div><span className="ritm-eyebrow">{t('Preview plan')}</span><h3>{plan.name}</h3></div><Icon name="checkCircle" /></div>
    {plan.note && <p className="small muted">{plan.note}</p>}
    <p className="small muted">{plan.days.length} {t('plan days')} · {plan.days.reduce((sum, day) => sum + day.meals.length, 0)} {t('planned meals')}</p>
    {Object.values(plan.targets).some(value => value != null) && <p className="small">{nutrientText(plan.targets)}</p>}
    <div className="ritm-preview-days">{plan.days.map(day => <div key={day.id} className="personal-stack"><strong>{planDayLabel(day)}</strong>{day.meals.map(meal => <div key={meal.id}><p>{meal.time || '—'} · {meal.name}</p><p className="small muted">{meal.items.length ? meal.items.map(item => `${item.food.name} · ${item.grams} ${t('g')}`).join(', ') : t('Add foods when you are ready')}</p></div>)}</div>)}</div>
  </div>
}
export default function PersonalMealPlan({ date, onRecord, onEdit }) {
  const S = useStore(state => state.S)
  const plans = (S.nutrition?.mealPlans || []).filter(p => !p.deletedAt).sort((a, b) => b.updatedAt - a.updatedAt)
  const [selectedId, setSelectedId] = useState(null)
  const plan = plans.find(p => p.id === selectedId) || plans[0]
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [text, setText] = useState(null)
  const [preview, setPreview] = useState(null)
  const [message, setMessage] = useState('')
  const fileRef = useRef(null)
  const change = mutator => useStore.getState().updatePersonal(mutator)
  function save(draft) { let saved; change(state => { saved = saveMealPlan(state, draft) }); return saved }
  function read(value) {
    try { setPreview(parseMealPlan(value)); setMessage('') } catch (error) { setPreview(null); setMessage(error.message) }
  }
  async function readFile(event) {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setMessage(t('Plan file must be under 2 MB')); return }
    try { setText(null); read(await file.text()) } catch (error) { setMessage(error.message) }
  }
  const meals = plan ? mealsForDate(plan, date) : []
  const share = (doc, filename) => sharePlan(doc, filename).catch(error => setMessage(error.message))
  function create() { const blank = createBlankMealPlan(); save(blank); setSelectedId(blank.id); setEditing(true); setMessage('') }
  return <div className="personal-stack ritm-meal-plan">
    <input ref={fileRef} type="file" accept=".json,.csv,.tsv,.txt,application/json,text/csv,text/plain" style={{ display: 'none' }} onChange={readFile} />
    {preview && <section className="card personal-stack"><ImportPreview plan={preview} /><div className="ritm-editor-actions"><Button variant="primary" onClick={() => { save(preview); setSelectedId(preview.id); setPreview(null); setText(null); setEditing(false); setMessage(t('Meal plan saved')) }}>{t('Save plan')}</Button><Button variant="ghost" onClick={() => setPreview(null)}>{t('Cancel')}</Button></div></section>}
    {plan ? <>
      {editing ? <PersonalMealPlanEditor plan={plan} onSave={save} onMealEdit={onEdit} onClose={() => setEditing(false)} /> : <>
        <section className="card personal-stack ritm-plan-overview">
          <div className="ritm-section-heading"><div><span className="ritm-eyebrow">{t('Your routine')}</span><h2>{plan.name}</h2></div><span className="ritm-icon-tile"><Icon name="calendar" /></span></div>
          {plans.length > 1 && <label>{t('Active plan')}<select className="field" value={plan.id} onChange={event => { setSelectedId(event.target.value); setDeleting(false) }}>{plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
          {plan.note && <p className="muted">{plan.note}</p>}
          {(plan.from || plan.to) && <p className="small muted">{plan.from || '…'} — {plan.to || '…'}</p>}
          <div className="ritm-editor-actions"><Button variant="tinted" icon="pencil" onClick={() => setEditing(true)}>{t('Edit meal plan')}</Button><Button variant="ghost" icon="share" onClick={() => share(mealPlanDocument(plan), 'ritm-meal-plan.json')}>{t('Share meal plan')}</Button></div>
        </section>
        <div className="ritm-section-heading"><h2>{t('Planned for this day')}</h2><span className="small muted">{meals.length ? mealCountText(meals.length) : ''}</span></div>
        {!meals.length && <div className="card ritm-empty"><Icon name="nutrition" /><h3>{t('Make room for your routine')}</h3><p>{t('No planned meals for this date. Fill the plan gradually.')}</p><Button variant="tinted" onClick={() => setEditing(true)}>{t('Edit meal plan')}</Button></div>}
        {meals.map(meal => <section className="card personal-stack ritm-planned-meal" key={meal.id}>
          <div className="ritm-section-heading"><div className="row"><span className="ritm-icon-tile"><Icon name="nutrition" /></span><div><span className="ritm-eyebrow">{meal.time || t('Any time')}</span><h3>{meal.name}</h3></div></div><button className="iconbtn" aria-label={t('Edit planned meal')} onClick={() => onEdit(plan, meal.dayId, meal)}><Icon name="pencil" /></button></div>
          <div className="ritm-plan-foods">{meal.items.map((item, index) => <div key={index}><span>{item.food.name}</span><strong>{item.grams} {t('g')}</strong></div>)}</div>
          {!meal.items.length && <p className="small muted">{t('Add foods when you are ready')}</p>}
          {meal.note && <p className="small muted">{meal.note}</p>}
          <Button variant="tinted" disabled={!meal.items.length} icon="plus" onClick={() => onRecord(plan, meal)}>{t('Record eaten meal')}</Button>
        </section>)}
        <p className="ritm-footnote"><Icon name="checkCircle" />{t('A plan is a guide. Only meals you confirm enter the diary.')}</p>
      </>}
    </> : <section className="card ritm-empty"><span className="ritm-icon-tile"><Icon name="calendar" /></span><h2>{t('A plan that fits your life')}</h2><p>{t('Start with one meal. Add the rest later.')}</p><Button variant="primary" icon="plus" onClick={create}>{t('Create meal plan')}</Button><Button variant="ghost" onClick={() => fileRef.current.click()}>{t('Load meal plan')}</Button></section>}
    <section className="card personal-stack">
      <details className="ritm-disclosure"><summary>{t('Plan files and templates')}<Icon name="share" /></summary>
        <div className="personal-stack"><p className="small muted">{t('Share a template with your AI assistant, then load the finished plan here.')}</p>
          <div className="ritm-editor-actions"><Button variant="tinted" icon="download" onClick={() => fileRef.current.click()}>{t('Load meal plan')}</Button><Button variant="ghost" onClick={() => { setText(''); setPreview(null) }}>{t('Paste plan')}</Button></div>
          <Button variant="ghost" onClick={() => share(MEAL_PLAN_EXAMPLE, 'ritm-meal-plan-template.json')}>{t('Share template for AI')}</Button>
          {text !== null && <div className="personal-stack"><label>{t('Plan from your assistant')}<TextArea rows={5} placeholder={t('Paste the plan your assistant sent you')} value={text} onChange={event => { setText(event.target.value); setPreview(null) }} /></label><div className="ritm-editor-actions"><Button onClick={() => read(text)}>{t('Check plan')}</Button><Button variant="ghost" onClick={() => { setText(null); setPreview(null) }}>{t('Cancel')}</Button></div></div>}
          {plan && <Button variant="ghost" icon="plus" onClick={create}>{t('Create meal plan')}</Button>}
        </div>
      </details>
      {plan && <details className="ritm-disclosure"><summary>{t('Plan settings')}<Icon name="gear" /></summary><div className="personal-stack"><p className="small muted">{nutrientText(plan.targets)}</p><Button variant="tinted" disabled={!Object.values(plan.targets).some(value => value != null)} onClick={() => { change(state => setNutritionTargets(state, plan.targets)); setMessage(t('Macro targets applied')) }}>{t('Apply plan targets')}</Button><Button variant="ghost" onClick={() => setDeleting(true)}>{t('Delete plan')}</Button>{deleting && <div className="personal-stack"><p>{t('Delete {0}?', plan.name)}</p><div className="ritm-editor-actions"><Button variant="danger" onClick={() => { change(state => deletePersonalRecord(state, 'nutrition', 'mealPlans', plan.id)); setDeleting(false); setEditing(false) }}>{t('Delete plan')}</Button><Button variant="ghost" onClick={() => setDeleting(false)}>{t('Cancel')}</Button></div></div>}</div></details>}
    </section>
    {message && <p role="status" className="ritm-notice">{message}</p>}
  </div>
}
