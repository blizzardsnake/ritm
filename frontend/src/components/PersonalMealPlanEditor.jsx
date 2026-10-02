import { useEffect, useState } from 'react'
import { t, dateLocale } from '../lib/i18n.js'
import { personalId } from '../lib/personal/state.js'
import { mealPlanDocument, parseMealPlan } from '../lib/personal/meal-plan.js'
import { Button, TextArea, TextField } from './ui.jsx'
import { NutrientFields } from './PersonalFoodEditor.jsx'
import Icon from './Icon.jsx'
import { DAYS } from '../lib/format.js'

export const PLAN_DAY_NAMES = ['Every day', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export function planDayLabel(day) {
  if (!day.date) return t(PLAN_DAY_NAMES[day.weekday])
  return new Date(`${day.date}T12:00:00`).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })
}

export default function PersonalMealPlanEditor({ plan, onSave, onMealEdit, onClose }) {
  const [draft, setDraft] = useState(() => structuredClone(mealPlanDocument(plan)))
  const [selection, setSelection] = useState('week:0')
  const [extraDate, setExtraDate] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { setDraft(structuredClone(mealPlanDocument(plan))) }, [plan])
  const day = draft.days.find(item => selection === (item.date ? `date:${item.date}` : `week:${item.weekday}`))
  const selectedName = selection.startsWith('week:') ? t(PLAN_DAY_NAMES[Number(selection.slice(5))]) : planDayLabel({ date: selection.slice(5) })
  const patch = value => { setDraft(prev => ({ ...prev, ...value })); setError('') }
  function save(editMeal = undefined) {
    try {
      const copy = structuredClone(draft)
      let selectedDay = copy.days.find(item => item.id === day?.id)
      if (editMeal !== undefined && !selectedDay) {
        selectedDay = { id: personalId(), ...(selection.startsWith('date:') ? { date: selection.slice(5) } : { weekday: Number(selection.slice(5)) }), meals: [] }
        copy.days.push(selectedDay)
      }
      // Use the same strict format validation as a file import, before touching persisted state.
      const saved = onSave(parseMealPlan(JSON.stringify(copy)))
      if (editMeal !== undefined) onMealEdit(saved, selectedDay.id, editMeal)
      else onClose()
      setError('')
    } catch (err) { setError(err.message) }
  }
  return <section className="card personal-stack ritm-plan-editor" aria-label={t('Edit meal plan')}>
    <div className="ritm-section-heading"><div><span className="ritm-eyebrow">{t('Your routine')}</span><h2>{t('Edit meal plan')}</h2></div><button className="iconbtn" aria-label={t('Cancel')} onClick={onClose}><Icon name="xmark" /></button></div>
    <label>{t('Plan name')}<TextField value={draft.name} onChange={event => patch({ name: event.target.value })} /></label>
    <label>{t('Plan notes')}<TextArea rows={2} placeholder={t('Preferences, preparation, reminders…')} value={draft.note} onChange={event => patch({ note: event.target.value })} /></label>
    <div className="grid2"><label>{t('From date')}<TextField type="date" value={draft.from || ''} onChange={event => patch({ from: event.target.value || null })} /></label><label>{t('To date')}<TextField type="date" value={draft.to || ''} onChange={event => patch({ to: event.target.value || null })} /></label></div>
    <details className="ritm-disclosure"><summary>{t('Plan daily targets')}<Icon name="chevronDown" /></summary><div className="personal-stack"><NutrientFields value={draft.targets} onChange={targets => patch({ targets })} /><p className="small muted">{t('Optional daily targets. Leave unset values blank.')}</p></div></details>
    <div className="ritm-section-heading"><h3>{t('Meal schedule')}</h3><span className="small muted">{t('Fill it at your own pace')}</span></div>
    <div className="ritm-day-chips" aria-label={t('Plan days')}>
      {PLAN_DAY_NAMES.map((name, weekday) => <button key={name} aria-label={t(name)} aria-pressed={selection === `week:${weekday}`} className={selection === `week:${weekday}` ? 'on' : ''} onClick={() => setSelection(`week:${weekday}`)}>{weekday === 0 ? t(name) : t(DAYS[weekday % 7])}{draft.days.some(item => item.weekday === weekday && item.meals.length) && <i aria-hidden="true" />}</button>)}
      {draft.days.filter(item => item.date).map(item => <button key={item.id} aria-pressed={selection === `date:${item.date}`} className={selection === `date:${item.date}` ? 'on' : ''} onClick={() => setSelection(`date:${item.date}`)}>{planDayLabel(item)}</button>)}
    </div>
    <div className="ritm-section-heading"><strong>{selectedName}</strong><Button size="sm" variant="tinted" icon="plus" onClick={() => save(null)}>{t('Add to plan')}</Button></div>
    {!day?.meals.length && <div className="ritm-empty compact"><Icon name="nutrition" /><p>{t('Start with one meal. Add the rest later.')}</p></div>}
    {day?.meals.map(meal => <div className="ritm-schedule-meal" key={meal.id}><span className="ritm-meal-time">{meal.time || '—'}</span><div><strong>{meal.name}</strong><p className="small muted">{meal.items.length ? meal.items.map(item => `${item.food.name} · ${item.grams} ${t('g')}`).join(', ') : t('Add foods when you are ready')}</p></div><div className="row"><button className="iconbtn" aria-label={t('Edit {0}', meal.name)} onClick={() => save(meal)}><Icon name="pencil" /></button><button className="iconbtn" aria-label={t('Remove {0}', meal.name)} onClick={() => patch({ days: draft.days.map(item => item.id === day.id ? { ...item, meals: item.meals.filter(record => record.id !== meal.id) } : item) })}><Icon name="trash" /></button></div></div>)}
    <details className="ritm-disclosure"><summary>{t('Add a dated exception')}<Icon name="calendar" /></summary><p className="small muted">{t('Meals on this date replace the usual schedule.')}</p><div className="row"><TextField type="date" aria-label={t('Exception date')} value={extraDate} onChange={event => setExtraDate(event.target.value)} /><Button size="sm" variant="tinted" disabled={!extraDate} onClick={() => { if (!draft.days.some(item => item.date === extraDate)) patch({ days: [...draft.days, { id: personalId(), date: extraDate, meals: [] }] }); setSelection(`date:${extraDate}`) }}>{t('Add day')}</Button></div></details>
    {error && <p role="alert" className="personal-error">{error}</p>}
    <div className="ritm-editor-actions"><Button variant="primary" onClick={() => save()}>{t('Save plan')}</Button><Button variant="ghost" onClick={onClose}>{t('Cancel')}</Button></div>
  </section>
}
