import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t, dateLocale } from '../lib/i18n.js'
import { fmtNum, todayISO } from '../lib/format.js'
import { HEALTH_METRICS, originKey, summarizeHealthDay } from '../lib/personal/health.js'
import { healthNativeAvailable, PersonalHealth as NativeHealth, syncPersonalHealth } from '../lib/personal/health-native.js'
import { Button, Switch, TextField } from '../components/ui.jsx'
import HealthDayCards from '../components/HealthDayCards.jsx'
import Icon from '../components/Icon.jsx'
import RitmBrand from '../components/RitmBrand.jsx'
import '../personal.css'

const labels = { steps: 'Steps', distance: 'Distance', activeKcal: 'Active energy', totalKcal: 'Total energy expenditure', sleep: 'Sleep', heartRate: 'Heart rate', activities: 'Recorded activities' }
const permissionLabel = status => status === true ? 'Permitted' : 'Not permitted'
const availabilityLabel = status => ({ available: 'Health Connect is available', provider_update_required: 'Install or update Health Connect', unavailable: 'Health Connect is unavailable', android_only: 'Android app required' })[status] || 'Not checked yet'
const timeLabel = value => value ? new Date(value).toLocaleString(dateLocale()) : t('Not synced yet')
const workerLabel = status => ({ never: 'Background job not run yet', success: 'Background read completed', permission_or_provider_unavailable: 'Read paused', partial_read_error: 'Some measurements could not be read', read_or_storage_error: 'Retrying read' })[status] || 'Unknown'

export default function PersonalHealth() {
  const nav = useNavigate(), S = useStore(state => state.S), health = S.health
  const android = healthNativeAvailable(), status = health.status || {}
  const [date, setDate] = useState(todayISO()), [origins, setOrigins] = useState(health.config.origins || [])
  const [requested, setRequested] = useState([...HEALTH_METRICS]), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  const running = useRef(false), activeOrigins = originKey(health.config.origins)
  useEffect(() => { setOrigins(health.config.origins || []) }, [activeOrigins])
  async function run(action, { days = 7 } = {}) {
    if (running.current || !android) return
    running.current = true; setBusy(true); setMessage('')
    try {
      if (action) await action()
      await syncPersonalHealth(useStore, { force: true, discoverOrigins: true, days })
      setMessage(t('Health status refreshed'))
    } catch (error) { setMessage(error.message || t('Health import failed')) }
    finally { running.current = false; setBusy(false) }
  }
  useEffect(() => { if (android) run() }, [])
  function applySources() {
    if (!origins.length) { setMessage(t('Choose at least one source')); return }
    run(() => useStore.getState().updatePersonal(state => { state.health.config = { ...state.health.config, origins: [...origins], updatedAt: Date.now() } }))
  }
  function setBackground(enabled) {
    run(async () => {
      useStore.getState().updatePersonal(state => { state.health.config = { ...state.health.config, background: enabled, updatedAt: Date.now() } })
      if (enabled && !status.backgroundGranted) await NativeHealth.requestPermissions({ metrics: [], background: true })
    })
  }
  const sources = new Map((status.sources || []).map(source => [source.packageName, source]))
  for (const packageName of health.config.origins || []) if (!sources.has(packageName)) sources.set(packageName, { packageName, label: t('Previously selected source') })
  const day = summarizeHealthDay(health, date)
  return <div className="narrow personal-stack ritm-health-page">
    <div className="hdr"><div><RitmBrand compact /><h1>{t('Watch & recovery')}</h1><p className="sub">{t('Your activity, with its real source')}</p></div><Button variant="ghost" onClick={() => nav(-1)}>{t('Back')}</Button></div>
    <section className="ritm-health-hero personal-stack">
      <span className="ritm-eyebrow"><Icon name="heart" />{t('Recovery signals')}</span>
      <h2>{t(android ? availabilityLabel(status.availability) : 'Android app required')}</h2>
      <p>{t('Mi Fitness must publish the band data to Health Connect first. Only sources you select are imported.')}</p>
      {!android ? <p className="ritm-health-notice">{t('Live watch import works in the Android app.')}</p> : <div className="row ritm-health-actions">
        <Button busy={busy} variant="primary" icon="reset" onClick={() => run()}>{t('Refresh health data')}</Button>
        <Button disabled={busy} variant="ghost" onClick={() => NativeHealth.openSettings().catch(error => setMessage(error.message))}>{t('Health Connect settings')}</Button>
      </div>}
      <span className="small muted">{t('Last successful read')}: {timeLabel(status.lastSyncAt)} · {t('Status checked')}: {timeLabel(status.checkedAt)}</span>
    </section>
    {message && <p role="status" className="personal-panel">{message}</p>}
    <section className="personal-panel personal-stack">
      <div className="row between"><h2>{t('Daily measurements')}</h2><TextField type="date" aria-label={t('Measurement date')} value={date} max={todayISO()} onChange={event => { if (event.target.value) setDate(event.target.value) }} /></div>
      <HealthDayCards health={health} date={date} />
      {day.sleep.intervalMinutes != null && <p className="small muted">{t('Recorded sleep interval')}: {fmtNum(Math.round(day.sleep.intervalMinutes))} {t('min')} · {t('Sleep stage coverage')}: {t({ complete: 'Complete', partial: 'Partial', unstaged: 'No stages supplied', conflicting: 'Conflicting sources', missing: 'No confirmed data' }[day.sleep.coverage])}</p>}
      {day.heartRate.count > 0 && <p className="small muted">{t('Heart rate')}: {day.heartRate.min}–{day.heartRate.max} {t('bpm')} · {t('{0} measured samples', day.heartRate.count)}</p>}
      {day.activities.length > 0 && <p className="small muted">{t('Recorded activities')}: {day.activities.length}</p>}
      <p className="small muted">{t('A dash means missing data, not zero. Band wear detection is unknown; an unstaged interval is not confirmed sleep.')}</p>
      {day.daily && <p className="small muted">{t('Measurement sources')}: {day.daily.origins.join(', ')} · {t('Imported')}: {timeLabel(day.daily.ingestedAt)}</p>}
    </section>
    <section className="personal-panel personal-stack">
      <h2>{t('Data sources')}</h2>
      <p className="small muted">{t('Choose Mi Fitness if it appears here. Phone steps are not automatically treated as band steps.')}</p>
      {!sources.size && <p>{t('No publishing apps found yet')}</p>}
      {[...sources.values()].map(source => <label key={source.packageName} className="ritm-health-source"><input type="checkbox" disabled={!android || busy} checked={origins.includes(source.packageName)} onChange={event => setOrigins(previous => event.target.checked ? [...previous, source.packageName] : previous.filter(origin => origin !== source.packageName))} /><span><b>{source.label || source.packageName}</b><small>{source.packageName}</small></span></label>)}
      {android && <Button disabled={busy || !origins.length} variant="tinted" onClick={applySources}>{t('Use selected sources')}</Button>}
      {Object.keys(status.discoveryErrors || {}).length > 0 && <p className="small muted">{t('Some source queries failed. Refresh after checking permissions.')}</p>}
    </section>
    {android && <section className="personal-panel personal-stack">
      <h2>{t('Read permissions')}</h2>
      {HEALTH_METRICS.map(metric => <label key={metric} className="ritm-health-permission"><input type="checkbox" disabled={busy} checked={requested.includes(metric)} onChange={event => setRequested(previous => event.target.checked ? [...previous, metric] : previous.filter(item => item !== metric))} /><span>{t(labels[metric])}</span><small className={status.permissions?.[metric] ? 'ritm-health-granted' : 'muted'}>{t(permissionLabel(status.permissions?.[metric]))}</small></label>)}
      <Button data-health-permissions disabled={busy || !requested.length || status.availability !== 'available'} variant="tinted" onClick={() => run(() => NativeHealth.requestPermissions({ metrics: HEALTH_METRICS.filter(metric => requested.includes(metric)) }))}>{t('Request selected permissions')}</Button>
      <div className="row between"><div><b>{t('Background refresh')}</b><p className="small muted">{t('Hourly when Android allows it. The system may delay the worker.')}</p></div><Switch aria-label={t('Background refresh')} checked={!!health.config.background} disabled={busy || !status.backgroundSupported || status.availability !== 'available'} onChange={setBackground} /></div>
      <p className="small muted">{t(status.backgroundScheduled ? 'Background job scheduled' : health.config.background ? 'Background refresh is waiting for permission or availability' : 'Background refresh is off')}</p>
      {!status.backgroundSupported && status.availability === 'available' && <p className="small muted">{t('Background reads are not supported on this Android version')}</p>}
      {!!status.lastWorkerAt && <p className="small muted">{t('Last background attempt')}: {timeLabel(status.lastWorkerAt)} · {t(workerLabel(status.workerStatus))}</p>}
      {status.historySupported && <Button disabled={busy || !health.config.origins.length} variant="ghost" onClick={() => run(async () => { if (!status.historyGranted) await NativeHealth.requestPermissions({ metrics: [], history: true }) }, { days: 365 })}>{t('Import up to one year of permitted history')}</Button>}
      {status.historyLimited && <p className="small muted">{t('History access is limited by the granted permission')}</p>}
      <p className="small muted">{t('Revoking permission stops new reads; previously imported history remains in your diary.')}</p>
    </section>}
    <Button icon="share" variant="ghost" onClick={() => nav('/analysis')}>{t('Share for analysis')}</Button>
  </div>
}
