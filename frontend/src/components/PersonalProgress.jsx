import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { calculatePersonalProgress, PROGRESS_GOAL_TYPES, refreshProgressAwards, saveProgressGoals } from '../lib/personal/progress.js'
import { t } from '../lib/i18n.js'
import { fmtDate, fmtNum, isoOf } from '../lib/format.js'
import Icon from './Icon.jsx'
import { Button, NumberField } from './ui.jsx'

const labels = { workouts: 'Workouts per week', steps: 'Daily steps', foodDays: 'Complete food days per week', bodyweight: 'Bodyweight target', kcal: 'Daily calories', protein: 'Daily protein', fat: 'Daily fat', carbs: 'Daily carbs' }
const awards = {
  'workout-1': ['First workout', 'A finished workout with completed work sets.', 'dumbbell'],
  'workout-10': ['10 workouts', 'Ten distinct finished workouts.', 'dumbbell'],
  'workout-25': ['25 workouts', 'Twenty-five distinct finished workouts.', 'dumbbell'],
  'workout-50': ['50 workouts', 'Fifty distinct finished workouts.', 'dumbbell'],
  'weekly-plan': ['Week on plan', 'Every routine slot in a week of the current schedule, including rescheduled days.', 'calendar'],
  'first-pr': ['First personal record', 'An eligible estimated 1RM exceeds a previous result; warmups are excluded.', 'chartLine'],
  'food-7': ['7 complete food days', 'Seven fully logged days with known nutrients; they do not need to be consecutive.', 'nutrition'],
  'steps-7': ['7 step-goal days', 'Seven observed days meeting your own step goal, using selected sources.', 'chartLine'],
}
const value = number => number == null ? '—' : fmtNum(number)
function Comparison({ title, current, previous, currentDays, previousDays, unit = '' }) {
  return <div className="ritm-progress-comparison"><div><span>{t(title)}</span><strong>{value(current)}{current != null && unit ? ` ${unit}` : ''}</strong><small>{t('{0} days with data', currentDays)}</small></div>
    <div><span>{t('Previous week')}</span><b>{value(previous)}{previous != null && unit ? ` ${unit}` : ''}</b><small>{t('{0} days with data', previousDays)}</small></div></div>
}
export default function PersonalProgress({ S }) {
  const [draft, setDraft] = useState(null), [error, setError] = useState('')
  const progress = calculatePersonalProgress(S)
  useEffect(() => { if (S.personalProfile?.id && S.progressGoals) refreshProgressAwards(useStore) }, [S])
  const current = progress.nutrition.currentWeek, previous = progress.nutrition.previousWeek
  const recovery = progress.recovery.currentWeek, pastRecovery = progress.recovery.previousWeek
  const edit = () => { setError(''); setDraft(Object.fromEntries(progress.goals.map(goal => [goal.type, goal.target]))) }
  const save = event => {
    event.preventDefault()
    try { useStore.getState().updatePersonal(state => saveProgressGoals(state, draft)); setDraft(null); setError('') }
    catch (err) { setError(t(err.message)) }
  }
  return <div className="ritm-personal-progress">
    <section className="card ritm-goals-card">
      <div className="ritm-section-heading"><div><span className="ritm-eyebrow">{t('YOUR TARGETS')}</span><h2>{t('Goals you choose')}</h2></div><Button size="sm" variant="ghost" icon="sliders" data-edit-goals onClick={edit}>{t('Edit')}</Button></div>
      <p className="small muted">{t('Targets are optional. Missing measurements stay unknown.')}</p>
      {draft ? <form onSubmit={save} className="personal-stack">
        <div className="ritm-goal-editor">{PROGRESS_GOAL_TYPES.map(type => <label key={type}><span>{t(labels[type])}{type === 'bodyweight' ? ` · ${S.unit || 'kg'}` : type === 'kcal' ? ' · kcal' : ['protein', 'fat', 'carbs'].includes(type) ? ' · g' : ''}</span>
          <NumberField name={type} aria-label={t(labels[type])} value={draft[type]} nullable decimal={!['workouts', 'steps', 'foodDays'].includes(type)} placeholder={t('Not set')} onChange={number => setDraft(old => ({ ...old, [type]: number }))} /></label>)}</div>
        {error && <p role="alert" className="small">{error}</p>}
        <div className="row" style={{ gap: 8 }}><Button type="submit">{t('Save goals')}</Button><Button type="button" variant="ghost" onClick={() => setDraft(null)}>{t('Cancel')}</Button></div>
      </form> : <div className="ritm-goal-grid">{progress.goals.map(goal => <div key={goal.type} className="ritm-goal" data-goal={goal.type}>
        <span>{t(labels[goal.type])}</span><div><strong>{value(goal.actual)}</strong><small>{goal.target == null ? t('Not set') : `${t('Target')} ${value(goal.target)}${goal.unit ? ` ${goal.unit}` : ''}`}</small></div>
        <div className="ritm-progress-track" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(0, (goal.progress || 0) * 100))}%` }} /></div>
        {goal.met === true && <small className="accent">{t('Goal reached')}</small>}
      </div>)}</div>}
      <p className="small muted">{t('Calories and macros use averages from complete food days. Weight and food targets are comparisons, not rewards for eating less.')}</p>
    </section>
    <section className="card ritm-week-comparison">
      <div className="ritm-section-heading"><div><span className="ritm-eyebrow">{t('WEEK IN CONTEXT')}</span><h2>{t('Nutrition & recovery')}</h2></div><Icon name="chartLine" /></div>
      <p className="small muted">{fmtDate(current.from)} — {fmtDate(current.to)} · {t('Compared with the previous full week')}</p>
      <div className="ritm-week-summary"><span>{t('Complete food days')} <b>{current.completeDays} / {current.days.length}</b></span><span>{t('Routine slots completed')} <b>{progress.training.plan.completed} / {progress.training.plan.required}</b></span></div>
      <Comparison title="Daily calories" current={current.averages.kcal} previous={previous.averages.kcal} currentDays={current.completeDays} previousDays={previous.completeDays} unit="kcal" />
      <Comparison title="Daily protein" current={current.averages.protein} previous={previous.averages.protein} currentDays={current.completeDays} previousDays={previous.completeDays} unit="g" />
      <Comparison title="Daily steps" current={recovery.steps.average} previous={pastRecovery.steps.average} currentDays={recovery.steps.days} previousDays={pastRecovery.steps.days} />
      <Comparison title="Confirmed sleep" current={recovery.sleepMinutes.average == null ? null : recovery.sleepMinutes.average / 60} previous={pastRecovery.sleepMinutes.average == null ? null : pastRecovery.sleepMinutes.average / 60} currentDays={recovery.sleepMinutes.days} previousDays={pastRecovery.sleepMinutes.days} unit={t('hours')} />
      <Comparison title="Average bodyweight" current={recovery.bodyweight.average} previous={pastRecovery.bodyweight.average} currentDays={recovery.bodyweight.days} previousDays={pastRecovery.bodyweight.days} unit={S.unit || 'kg'} />
    </section>
    <section className="card ritm-achievements-card">
      <div className="ritm-section-heading"><div><span className="ritm-eyebrow">{t('MILESTONES')}</span><h2>{t('Achievements')}</h2></div><span className="ritm-achievement-count">{progress.achievements.filter(rule => rule.qualified).length} / {progress.achievements.length}</span></div>
      <p className="small muted">{t('Earned from recorded events. Corrections recalculate qualification while keeping the first award date.')}</p>
      <div className="ritm-achievement-grid">{progress.achievements.map(rule => {
        const [title, description, icon] = awards[rule.id], award = S.progressGoals?.awards?.find(item => item.kind === rule.id)
        return <article key={rule.id} data-achievement={rule.id} data-qualified={rule.qualified} className={`ritm-achievement ${rule.qualified ? 'earned' : ''}`}>
          <div className="ritm-medal"><Icon name={icon} /></div><h3>{t(title)}</h3><p>{t(description)}</p>
          <div className="ritm-progress-track" aria-hidden="true"><i style={{ width: `${Math.min(100, rule.progress / rule.target * 100)}%` }} /></div><small>{Math.min(rule.progress, rule.target)} / {rule.target}</small>
          {award?.firstAwardedAt && <small>{t('First earned: {0}', fmtDate(isoOf(new Date(award.firstAwardedAt))))}</small>}
          {award && !rule.qualified && <small>{t('Needs qualification again')}</small>}
        </article>
      })}</div>
    </section>
  </div>
}
