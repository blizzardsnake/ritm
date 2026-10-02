import { t } from '../lib/i18n.js'
import { fmtNum } from '../lib/format.js'
import { summarizeHealthDay } from '../lib/personal/health.js'
import Icon from './Icon.jsx'

const show = (value, digits = 0) => value == null ? '—' : fmtNum(Number(value.toFixed(digits)))
export default function HealthDayCards({ health, date, compact = false }) {
  const day = summarizeHealthDay(health, date)
  const values = [
    ['Steps', day.steps, '', 'figureRun'],
    ['Confirmed sleep', day.sleep.asleepMinutes == null ? null : day.sleep.asleepMinutes / 60, t('hours'), 'moon', 1],
    ['Active energy', day.activeKcal, t('kcal'), 'flame'],
    ['Total energy expenditure', day.totalKcal, t('kcal'), 'heart'],
  ]
  if (!compact) values.push(['Distance', day.distanceM == null ? null : day.distanceM / 1000, 'km', 'figureRun', 2], ['Average heart rate', day.heartRate.mean, t('bpm'), 'heart'])
  return <div className="ritm-health-metrics">
    {values.map(([label, value, unit, icon, digits]) => <div className="ritm-health-metric" key={label}>
      <span className="small muted"><Icon name={icon} />{t(label)}</span>
      <strong>{show(value, digits)}<small>{value == null ? '' : unit}</small></strong>
      {value == null && <span className="small muted">{t('No confirmed data')}</span>}
    </div>)}
  </div>
}
