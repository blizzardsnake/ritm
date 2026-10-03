import { t, dateLocale } from '../lib/i18n.js'
import { fmtNum } from '../lib/format.js'
import { summarizeHealthDay } from '../lib/personal/health.js'
import Icon from './Icon.jsx'

const show = (value, digits = 0) => value == null ? '—' : fmtNum(Number(value.toFixed(digits)))
export default function HealthDayCards({ health, date, compact = false }) {
  const day = summarizeHealthDay(health, date)
  const values = [
    ['Steps', day.steps, '', 'figureRun', 0, 'steps'],
    ['Confirmed sleep', day.sleep.asleepMinutes == null ? null : day.sleep.asleepMinutes / 60, t('hours'), 'moon', 1, 'sleep'],
    ['Active energy', day.activeKcal, t('kcal'), 'flame', 0, 'activeKcal'],
    ['Total energy expenditure', day.totalKcal, t('kcal'), 'heart', 0, 'totalKcal'],
  ]
  if (!compact) values.push(['Distance', day.distanceM == null ? null : day.distanceM / 1000, 'km', 'figureRun', 2, 'distance'], ['Average heart rate', day.heartRate.mean, t('bpm'), 'heart', 0, 'heartRate'])
  return <div className="ritm-health-metrics">
    {values.map(([label, value, unit, icon, digits, metric]) => {
      const status = day.daily?.metricStatus?.[metric] ?? health.status?.metricStatus?.[metric]
      const importedAt = day.daily?.metricIngestedAt?.[metric] ?? (value != null ? day.daily?.ingestedAt : null)
      const notice = status === 'read_error' ? (value == null ? 'Could not read this measurement' : 'Could not refresh; showing recorded value')
        : status === 'permission_denied' ? 'Read permission is missing' : null
      return <div className="ritm-health-metric" data-health-metric={metric} data-health-imported-at={importedAt ?? undefined} key={label}>
      <span className="small muted"><Icon name={icon} />{t(label)}</span>
      <strong>{show(value, digits)}<small>{value == null ? '' : unit}</small></strong>
      {value == null && <span className="small muted">{t('No confirmed data')}</span>}
      {notice && <span className="small muted">{t(notice)}</span>}
      {!compact && importedAt != null && <span className="small muted">{t('Imported')}: {new Date(importedAt).toLocaleString(dateLocale())}</span>}
    </div>})}
  </div>
}
