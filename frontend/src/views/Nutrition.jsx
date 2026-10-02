import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { todayISO, isoOf } from '../lib/format.js'
import { Button, TextField, TextArea, Switch, Segmented } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import RitmBrand from '../components/RitmBrand.jsx'
import PersonalNutritionSummary from '../components/PersonalNutritionSummary.jsx'
import PersonalFoodPicker, { nutrientText } from '../components/PersonalFoodPicker.jsx'
import PersonalFoodEditor, { NutrientFields } from '../components/PersonalFoodEditor.jsx'
import PersonalRecipeEditor from '../components/PersonalRecipeEditor.jsx'
import PersonalMealPlan from '../components/PersonalMealPlan.jsx'
import { mealDraftFromPlan, upsertPlannedMeal } from '../lib/personal/meal-plan.js'
import { mealCountText } from '../lib/personal/ui-format.js'
import { summarizeNutritionDay, snapshotMealItem, NUTRIENT_KEYS, parseAmount } from '../lib/personal/nutrition.js'
import { saveMeal, deletePersonalRecord, setDayComplete, setNutritionTargets } from '../lib/personal/store-actions.js'
import '../personal.css'

const localTime = at => { const date = new Date(at); return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` }

export default function Nutrition() {
  const S = useStore(state => state.S)
  const nav = useNavigate()
  const [date, setDate] = useState(todayISO())
  const [view, setView] = useState('diary')
  const [meal, setMeal] = useState(null)
  const [planContext, setPlanContext] = useState(null)
  const [selected, setSelected] = useState(null)
  const [grams, setGrams] = useState('100')
  const [density, setDensity] = useState('')
  const [foodEditor, setFoodEditor] = useState(null)
  const [recipeEditor, setRecipeEditor] = useState(null)
  const [targetEditor, setTargetEditor] = useState(null)
  const [error, setError] = useState('')
  const summary = summarizeNutritionDay(S.nutrition, date)
  const meals = (S.nutrition?.meals || []).filter(item => !item.deletedAt && item.date === date).sort((a, b) => a.at - b.at)
  const target = S.nutrition?.targets?.find(item => item.id === 'default' && !item.deletedAt)
  const change = mutator => useStore.getState().updatePersonal(mutator)
  function beginMeal(record = null) {
    setView('diary')
    setPlanContext(null)
    setMeal(record ? { ...structuredClone(record), time: localTime(record.at), timeChanged: false }
      : { name: '', note: '', time: localTime(Date.now()), items: [] })
    setSelected(null); setError('')
  }
  function addFood() {
    try {
      let food = selected
      if (food.basis === '100ml' && density.trim()) {
        const massDensity = parseAmount(density)
        food = { ...food, basis: '100g', densityGPerMl: massDensity,
          nutrients: Object.fromEntries(NUTRIENT_KEYS.map(key => [key, food.per100ml?.[key] == null ? null : food.per100ml[key] / massDensity])) }
      }
      setMeal({ ...meal, items: [...meal.items, snapshotMealItem(food, grams)] }); setSelected(null); setError('')
    } catch (err) { setError(err.message) }
  }
  function finishMeal() {
    try {
      if (planContext) {
        change(state => upsertPlannedMeal(state, planContext.planId, planContext.dayId, meal))
        setMeal(null); setPlanContext(null); setError(''); return
      }
      const at = meal.id && !meal.timeChanged ? meal.at : new Date(`${date}T${meal.time}:00`).getTime()
      const draft = { ...meal, at, date, ...(meal.timeChanged || !meal.id ? { timezone: undefined } : {}) }
      delete draft.time; delete draft.timeChanged
      change(state => saveMeal(state, draft)); setMeal(null); setError('')
    } catch (err) { setError(err.message) }
  }
  function changeDate(value) { if (value) { setDate(value); setMeal(null); setPlanContext(null); setSelected(null); setError('') } }
  const adjacentDate = days => { const next = new Date(`${date}T12:00:00`); next.setDate(next.getDate() + days); changeDate(isoOf(next)) }
  return <div className="narrow personal-stack ritm-nutrition-page">
    <div className="ritm-page-brand"><RitmBrand compact /><button className="iconbtn" onClick={() => nav('/settings')} aria-label={t('Settings')}><Icon name="gear" /></button></div>
    <div className="hdr"><div><h1>{t('Nutrition')}</h1><div className="sub">{t('A little care, every day')}</div></div></div>
    <div className="ritm-date-navigation"><button className="iconbtn" aria-label={t('Previous day')} onClick={() => adjacentDate(-1)}><Icon name="chevronLeft" /></button><label className="ritm-date-field"><Icon name="calendar" /><TextField type="date" aria-label={t('Diary date')} value={date} onChange={event => changeDate(event.target.value)} /></label><button className="iconbtn" aria-label={t('Next day')} onClick={() => adjacentDate(1)}><Icon name="chevronRight" /></button>{date !== todayISO() && <Button size="sm" variant="ghost" onClick={() => changeDate(todayISO())}>{t('Today')}</Button>}</div>
    <Segmented className="ritm-nutrition-tabs" value={view} options={[{ value: 'diary', label: t('Diary'), icon: 'nutrition' }, { value: 'plan', label: t('Meal plan'), icon: 'calendar' }]} onChange={value => { setView(value); setMeal(null); setPlanContext(null); setSelected(null); setError('') }} />
    {view === 'plan' && <div style={meal ? { display: 'none' } : undefined}><PersonalMealPlan date={date} onRecord={(plan, planned) => { const draft = mealDraftFromPlan(plan, planned); beginMeal(); setMeal({ ...draft, time: draft.time || localTime(Date.now()) }) }}
      onEdit={(plan, dayId, planned) => { setPlanContext({ planId: plan.id, dayId }); setMeal(planned ? { ...mealDraftFromPlan(plan, planned), id: planned.id, time: planned.time || '' } : { name: '', time: '', items: [], note: '' }); setSelected(null); setError('') }} /></div>}
    {view === 'diary' && !meal && <>
      <PersonalNutritionSummary summary={summary} target={target} />
      <div className="ritm-diary-actions"><Button variant="primary" icon="plus" onClick={() => beginMeal()}>{t('Add meal')}</Button><button className="iconbtn ritm-action-settings" aria-label={t('Macro targets')} onClick={() => setTargetEditor(target || {})}><Icon name="sliders" /></button><button className="iconbtn ritm-action-settings" aria-label={t('New recipe')} onClick={() => setRecipeEditor({})}><Icon name="plusCircle" /></button></div>
      <div className="ritm-section-heading"><h2>{t('Your meals')}</h2><span className="small muted">{mealCountText(meals.length)}</span></div>
      {!meals.length && <div className="card ritm-empty"><span className="ritm-icon-tile"><Icon name="nutrition" /></span><h3>{t('Every meal counts')}</h3><p>{t('No meals recorded for this day')}</p></div>}
    </>}
    {targetEditor && <section className="card personal-stack"><h2>{t('Macro targets')}</h2>
      <NutrientFields value={targetEditor} onChange={setTargetEditor} />
      <p className="small muted">{t('Optional daily targets. Leave unset values blank.')}</p>
      <div className="row" style={{ gap: 8 }}><Button onClick={() => { try { change(state => setNutritionTargets(state, targetEditor)); setTargetEditor(null); setError('') } catch (err) { setError(err.message) } }}>{t('Save')}</Button><Button variant="ghost" onClick={() => setTargetEditor(null)}>{t('Cancel')}</Button></div>
    </section>}
    {recipeEditor && <PersonalRecipeEditor recipe={recipeEditor.id ? recipeEditor : null} onClose={() => setRecipeEditor(null)} />}
    {foodEditor && <PersonalFoodEditor food={foodEditor.id ? foodEditor : null} onClose={() => setFoodEditor(null)} onSaved={food => { if (meal) { setSelected(food); setDensity('') } }} />}
    {meal && <section className="card personal-stack ritm-meal-editor">
      <div className="ritm-section-heading"><div><span className="ritm-eyebrow">{planContext ? t('Meal plan') : t('Diary')}</span><h2>{planContext ? t('Edit planned meal') : meal.id ? t('Edit meal') : t('Add meal')}</h2></div><button className="iconbtn" aria-label={t('Cancel')} onClick={() => { setMeal(null); setPlanContext(null); setSelected(null); setError('') }}><Icon name="xmark" /></button></div>
      <label>{t('Meal name')}<TextField placeholder={t('Breakfast, lunch…')} value={meal.name} onChange={event => setMeal({ ...meal, name: event.target.value })} /></label>
      <label>{t('Meal time')}<TextField type="time" value={meal.time} onChange={event => setMeal({ ...meal, time: event.target.value, timeChanged: true })} /></label>
      <label>{t('Food and preparation notes')}<TextArea value={meal.note || ''} onChange={event => setMeal({ ...meal, note: event.target.value })} /></label>
      {meal.items.map((item, index) => <div className="personal-food-row" key={index}><div><strong>{item.food.name}</strong><div>{item.grams} {t('g')} · {nutrientText(item.nutrients)}</div></div><Button size="sm" variant="ghost" onClick={() => setMeal({ ...meal, items: meal.items.filter((_, i) => i !== index) })}>{t('Remove')}</Button></div>)}
      {selected ? <div className="personal-stack">
        <h3>{selected.name}</h3><label>{t('Weight eaten, g')}<TextField inputMode="decimal" value={grams} onChange={event => setGrams(event.target.value)} /></label>
        {selected.basis === '100ml' && <label>{t('Density, g/ml (optional)')}<TextField inputMode="decimal" value={density} onChange={event => setDensity(event.target.value)} /><span className="small muted">{t('Without density the meal will have unknown macros.')}</span></label>}
        <div className="row" style={{ gap: 8 }}><Button onClick={addFood}>{t('Add food to meal')}</Button><Button variant="ghost" onClick={() => setSelected(null)}>{t('Choose another')}</Button></div>
      </div> : <PersonalFoodPicker onSelect={food => { setSelected(food); setDensity('') }} onManual={() => setFoodEditor({})}
        onEdit={food => food.source?.type === 'recipe' ? setRecipeEditor(food) : setFoodEditor(food)} />}
      <div className="ritm-editor-actions"><Button variant="primary" disabled={!planContext && !meal.items.length} onClick={finishMeal}>{planContext ? t('Save to plan') : t('Save meal')}</Button><Button variant="ghost" onClick={() => { setMeal(null); setPlanContext(null); setError('') }}>{t('Cancel')}</Button></div>
    </section>}
    {error && <p role="alert" className="personal-error">{error}</p>}
    {view === 'diary' && !meal && meals.map(record => <section className="card personal-stack ritm-diary-meal" key={record.id}>
      <div className="ritm-section-heading"><div className="row"><span className="ritm-icon-tile"><Icon name="nutrition" /></span><div><span className="ritm-eyebrow">{localTime(record.at)}</span><h3>{record.name}</h3></div></div><button className="iconbtn" aria-label={t('Edit {0}', record.name)} onClick={() => beginMeal(record)}><Icon name="pencil" /></button></div>
      {record.items.map((item, index) => <div className="ritm-diary-food" key={index}><div className="row between"><span>{item.food.name}</span><strong>{item.grams} {t('g')}</strong></div><div className="small muted">{nutrientText(item.nutrients)}</div></div>)}
      {record.note && <p>{record.note}</p>}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <Button size="sm" variant="ghost" onClick={() => beginMeal(record)}>{t('Edit')}</Button>
        <Button size="sm" variant="ghost" onClick={() => { beginMeal({ ...record, id: undefined, at: undefined }); setMeal({ name: record.name, note: record.note, items: structuredClone(record.items), time: localTime(Date.now()) }) }}>{t('Copy meal')}</Button>
        <Button size="sm" variant="ghost" onClick={() => change(state => deletePersonalRecord(state, 'nutrition', 'meals', record.id))}>{t('Delete')}</Button>
      </div>
    </section>)}
    {view === 'diary' && !meal && <section className="card personal-stack ritm-day-completeness"><label className="row between"><span>{t('All meals for this day are recorded')}</span><Switch aria-label={t('All meals for this day are recorded')} checked={summary.complete} disabled={!summary.itemCount} onChange={complete => change(state => setDayComplete(state, date, complete))} /></label><p className="small muted">{summary.complete ? t('Day marked complete. Unknown macros still remain unknown.') : t('Partial diary: totals include recorded foods only.')}</p></section>}
    <p className="ritm-footnote">{t('Generic foods: USDA SR Legacy. Packaged foods: Open Food Facts. Check raw/cooked weight and your label.')}</p>
  </div>
}
