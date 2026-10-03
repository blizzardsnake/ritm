import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { MOBILE } from '../lib/mobile.js'
import { DEMO } from '../lib/demo.js'
import { coachAvailable } from '../lib/coach.js'
import { getApiKey } from '../lib/coach-secrets.js'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import CoachSetup from './CoachSetup.jsx'

// Presence is separate from provider readiness: opening the assistant sends no history.
export default function Assistant() {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const config = useStore(s => s.config)
  const coachLocal = useStore(s => s.coachLocal)
  const [keyReady, setKeyReady] = useState(null)
  const connectionRef = useRef(null)
  useEffect(() => {
    let live = true
    setKeyReady(null)
    getApiKey().then(key => { if (live) setKeyReady(!!key) }).catch(() => { if (live) setKeyReady(false) })
    return () => { live = false }
  }, [coachLocal])
  const available = coachAvailable(config, user, { demo: DEMO, mobile: MOBILE, coachMode: coachLocal?.mode })
  const connected = available && (coachLocal?.mode !== 'byok' || keyReady === true)
  const checking = available && coachLocal?.mode === 'byok' && keyReady === null
  return <div className="narrow ritm-assistant-page">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/home')} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div className="grow"><h1>{t('RITM assistant')}</h1><p className="sub">{t('Training. Nutrition. Recovery.')}</p></div>
      <button className="iconbtn" onClick={() => nav('/coach/setup')} aria-label={t('AI settings')}><Icon name="gear" /></button>
    </div>
    <section className="ritm-assistant-hero">
      <div className="ritm-assistant-orbit" aria-hidden="true"><span className="ritm-assistant-orb" /><i /><i /></div>
      <span className="ritm-eyebrow">RITM INTELLIGENCE</span>
      <h2>{t('A little clarity. Every day.')}</h2>
      <p>{t('Your training, food diary and recovery in one place. Suggestions become changes only after your approval.')}</p>
      <button className="ritm-assistant-status" disabled={checking} onClick={() => connected ? nav('/coach') : connectionRef.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })}><i />{t(checking ? 'Checking connection…' : connected ? 'Connected · ready when you are' : 'Connect free AI once')}<Icon name="arrowUp" /></button>
    </section>
    <div className="ritm-assistant-actions">
      <button onClick={() => nav('/analysis')}><Icon name="chart" /><div><strong>{t('Review my week')}</strong><span>{t('Training + food + sleep. Preview the report before sending.')}</span></div><Icon name="chevronRight" /></button>
      {connected && <button onClick={() => nav('/coach')}><Icon name="sparkles" /><div><strong>{t('Talk about my training')}</strong><span>{t('Build a program, adjust weights or review a workout.')}</span></div><Icon name="chevronRight" /></button>}
      <button onClick={() => nav('/health')}><Icon name="heart" /><div><strong>{t('Connect Mi Fitness data')}</strong><span>{t('Choose watch sources in Health Connect.')}</span></div><Icon name="chevronRight" /></button>
    </div>
    {checking ? <p className="small muted" role="status">{t('Checking connection…')}</p> : !connected ? <section className="ritm-assistant-connect" ref={connectionRef}>
      <div className="ritm-section-heading"><div><h2>{t('One connection. Always at hand.')}</h2><p className="small muted">{t('Paste your free OpenRouter key. It stays on this phone. No computer needed.')}</p></div></div>
      <CoachSetup embedded initialFree />
    </section> : <Button variant="primary" className="ritm-assistant-talk" icon="sparkles" onClick={() => nav('/coach')}>{t('Start a conversation')}</Button>}
  </div>
}
