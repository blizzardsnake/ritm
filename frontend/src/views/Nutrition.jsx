import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { todayISO } from '../lib/format.js'
import { Button, TextField, TextArea, Switch } from '../components/ui.jsx'
import PersonalFoodPicker, { nutrientText } from '../components/PersonalFoodPicker.jsx'
import PersonalFoodEditor, { NutrientFields, nutrientLabels } from '../components/PersonalFoodEditor.jsx'
import PersonalRecipeEditor from '../components/PersonalRecipeEditor.jsx'
import { summarizeNutritionDay, snapshotMealItem, NUTRIENT_KEYS, parseAmount } from '../lib/personal/nutrition.js'
import { saveMeal, deletePersonalRecord, setDayComplete, setNutritionTargets } from '../lib/personal/store-actions.js'
import '../personal.css'

const localTime = at => { const date = new Date(at); return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` }

export default function Nutrition() {
  const S = useStore(state => state.S)
  const nav = useNavigate()
  const [date, setDate] = useState(todayISO())
  const [meal, setMeal] = useState(null)
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
      const at = meal.id && !meal.timeChanged ? meal.at : new Date(`${date}T${meal.time}:00`).getTime()
      const draft = { ...meal, at, date, ...(meal.timeChanged || !meal.id ? { timezone: undefined } : {}) }
      delete draft.time; delete draft.timeChanged
      change(state => saveMeal(state, draft)); setMeal(null); setError('')
    } catch (err) { setError(err.message) }
  }
  return <div className="narrow personal-stack">
    <div className="hdr"><div><h1>{t('Nutrition diary')}</h1><div className="sub">{t('Meals, exact weights and daily macros')}</div></div><Button variant="ghost" onClick={() => nav('/home')}>{t('Back')}</Button></div>
    <TextField type="date" aria-label={t('Diary date')} value={date} onChange={event => { if (event.target.value) { setDate(event.target.value); setMeal(null); setError('') } }} />
    <section className="card personal-stack">
      <h2>{t('Recorded today')}</h2>
      <div className="personal-nutrients">{NUTRIENT_KEYS.map(key => <div key={key}>
        <span className="small muted">{t(nutrientLabels[key])}</span><strong className="personal-number">{summary.totals[key] == null ? '—' : Math.round(summary.totals[key] * 10) / 10}</strong>
        {target?.[key] != null && <span className="small muted">/ {target[key]}</span>}
        {summary.missing[key] > 0 && <span className="small personal-error">{t('{0} items missing a value', summary.missing[key])}</span>}
      </div>)}</div>
      {!summary.itemCount && <p className="muted">{t('No meals recorded for this day')}</p>}
      <label className="row between"><span>{t('All meals for this day are recorded')}</span><Switch checked={summary.complete} disabled={!summary.itemCount} onChange={complete => change(state => setDayComplete(state, date, complete))} /></label>
      <p className="small muted">{summary.complete ? t('Day marked complete. Unknown macros still remain unknown.') : t('Partial diary: totals include recorded foods only.')}</p>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}><Button onClick={() => beginMeal()}>{t('Add meal')}</Button><Button variant="ghost" onClick={() => setTargetEditor(target || {})}>{t('Macro targets')}</Button><Button variant="ghost" onClick={() => setRecipeEditor({})}>{t('New recipe')}</Button></div>
    </section>
    {targetEditor && <section className="card personal-stack"><h2>{t('Macro targets')}</h2>
      <NutrientFields value={targetEditor} onChange={setTargetEditor} />
      <p className="small muted">{t('Optional daily targets. Leave unset values blank.')}</p>
      <div className="row" style={{ gap: 8 }}><Button onClick={() => { try { change(state => setNutritionTargets(state, targetEditor)); setTargetEditor(null); setError('') } catch (err) { setError(err.message) } }}>{t('Save')}</Button><Button variant="ghost" onClick={() => setTargetEditor(null)}>{t('Cancel')}</Button></div>
    </section>}
    {recipeEditor && <PersonalRecipeEditor recipe={recipeEditor.id ? recipeEditor : null} onClose={() => setRecipeEditor(null)} />}
    {foodEditor && <PersonalFoodEditor food={foodEditor.id ? foodEditor : null} onClose={() => setFoodEditor(null)} onSaved={food => { if (meal) { setSelected(food); setDensity('') } }} />}
    {meal && <section className="card personal-stack">
      <h2>{meal.id ? t('Edit meal') : t('Add meal')}</h2>
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
      <div className="row" style={{ gap: 8 }}><Button disabled={!meal.items.length} onClick={finishMeal}>{t('Save meal')}</Button><Button variant="ghost" onClick={() => { setMeal(null); setError('') }}>{t('Cancel')}</Button></div>
    </section>}
    {error && <p role="alert" className="personal-error">{error}</p>}
    {meals.map(record => <section className="card personal-stack" key={record.id}>
      <div className="row between"><h2>{record.name}</h2><span className="muted">{localTime(record.at)}</span></div>
      {record.items.map((item, index) => <div key={index}><strong>{item.food.name}</strong><div className="small muted">{item.grams} {t('g')} · {nutrientText(item.nutrients)}</div></div>)}
      {record.note && <p>{record.note}</p>}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <Button size="sm" variant="ghost" onClick={() => beginMeal(record)}>{t('Edit')}</Button>
        <Button size="sm" variant="ghost" onClick={() => { beginMeal({ ...record, id: undefined, at: undefined }); setMeal({ name: record.name, note: record.note, items: structuredClone(record.items), time: localTime(Date.now()) }) }}>{t('Copy meal')}</Button>
        <Button size="sm" variant="ghost" onClick={() => change(state => deletePersonalRecord(state, 'nutrition', 'meals', record.id))}>{t('Delete')}</Button>
      </div>
    </section>)}
    <p className="small muted">{t('Generic foods: USDA SR Legacy. Packaged foods: Open Food Facts. Check raw/cooked weight and your label.')}</p>
  </div>
}
