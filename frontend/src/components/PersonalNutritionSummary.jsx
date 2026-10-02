import { t } from '../lib/i18n.js'
import { nutrientLabels } from './PersonalFoodEditor.jsx'
import Icon from './Icon.jsx'
import { nutrientDisplay as number } from '../lib/personal/ui-format.js'

function MacroProgress({ value, target, label }) {
  if (value == null || !(target > 0)) return null
  return <div className="ritm-macro-track" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={Math.max(target, value)} aria-valuetext={`${number(value)} / ${number(target)}`}><i style={{ width: `${Math.min(100, value / target * 100)}%` }} /></div>
}
export default function PersonalNutritionSummary({ summary, target }) {
  return <section className="card personal-stack ritm-nutrition-summary">
    <div className="ritm-section-heading"><span className="ritm-eyebrow">{t('Recorded today')}</span><span className={'ritm-status' + (summary.complete ? ' complete' : '')}><i />{summary.complete ? t('Day complete') : t('Partial diary')}</span></div>
    <div className="ritm-energy" aria-label={t('Calories')}>
      <div className="ritm-energy-number"><span>{number(summary.totals.kcal)}</span><span className="muted">{t('kcal')}</span></div>
      <div className="ritm-energy-context"><span className="ritm-icon-tile"><Icon name="flame" /></span><span className="small muted">{target?.kcal != null ? t('Daily goal: {0} kcal', number(target.kcal)) : t('Your energy, at a glance')}</span></div>
      <MacroProgress value={summary.totals.kcal} target={target?.kcal} label={t('Calories')} />
      {summary.missing.kcal > 0 && <p className="small muted">{t('{0} items missing a value', summary.missing.kcal)}</p>}
    </div>
    <div className="ritm-macro-grid">{['protein', 'fat', 'carbs'].map(key => <div key={key} className={`ritm-macro ${key}`} aria-label={t(nutrientLabels[key])}><span className="ritm-macro-label"><i />{t(nutrientLabels[key])}</span><div className="ritm-macro-number"><strong>{number(summary.totals[key])}</strong><span>{t('g')}</span></div><span className="small muted">{target?.[key] != null ? `/ ${number(target[key])} ${t('g')}` : t('Recorded')}</span><MacroProgress value={summary.totals[key]} target={target?.[key]} label={t(nutrientLabels[key])} />{summary.missing[key] > 0 && <span className="small muted ritm-missing">{t('{0} items missing a value', summary.missing[key])}</span>}</div>)}</div>
  </section>
}
