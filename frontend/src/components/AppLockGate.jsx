import { useEffect, useRef, useState } from 'react'
import { App as NativeApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { DeviceLock, readDeviceLockStatus } from '../lib/device-lock.js'
import { installViewportGuard } from '../lib/viewport-guard.js'
import { t } from '../lib/i18n.js'
import { Button, TextField } from './ui.jsx'
import Icon from './Icon.jsx'
import RitmBrand from './RitmBrand.jsx'
import RitmLoader from './RitmLoader.jsx'

export default function AppLockGate({ children, service = DeviceLock }) {
  const [status, setStatus] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [show, setShow] = useState(false)
  const [covered, setCovered] = useState(false)
  const password = useRef(null), submitting = useRef(false), backgroundAt = useRef(null)
  const locked = status?.enabled === true && status.unlocked === false
  useEffect(() => { if (locked) return installViewportGuard() }, [locked])
  useEffect(() => {
    let alive = true, listener = null
    const refresh = async () => {
      try { const next = await readDeviceLockStatus(service); if (alive) { setStatus(next); setError('') } }
      catch (e) { if (alive) { setStatus(null); setError(e.message) } }
    }
    const visibility = async isActive => {
      if (!isActive) { backgroundAt.current ??= Date.now(); setCovered(true); return }
      try {
        if (backgroundAt.current != null && Date.now() - backgroundAt.current >= 30000) await service.lock()
        backgroundAt.current = null
        await refresh()
      } catch (e) { if (alive) { setStatus(null); setError(e.message) } }
      finally { if (alive) setCovered(false) }
    }
    const webVisibility = () => { visibility(document.visibilityState !== 'hidden') }
    refresh()
    window.addEventListener('ritm:lock-change', refresh)
    document.addEventListener('visibilitychange', webVisibility)
    if (Capacitor.getPlatform() === 'android') NativeApp.addListener('appStateChange', state => { visibility(state.isActive) }).then(handle => { if (alive) listener = handle; else handle.remove() })
    return () => { alive = false; listener?.remove(); window.removeEventListener('ritm:lock-change', refresh); document.removeEventListener('visibilitychange', webVisibility) }
  }, [service])
  const authenticate = async biometric => {
    if (submitting.current) return
    submitting.current = true; setBusy(true); setError('')
    try {
      if (biometric) await service.authenticate()
      else await service.unlock({ password: password.current.value })
      const next = await readDeviceLockStatus(service)
      if (!next.unlocked) throw new Error(t('Could not unlock the app'))
      setStatus(next)
    } catch (e) { setError(t(e.message || 'Could not unlock the app')) }
    finally { submitting.current = false; setBusy(false) }
  }
  if (!status && !error) return <RitmLoader full label={t('Opening your space…')} />
  if (status && (!status.enabled || status.unlocked)) return <><div style={covered ? { visibility: 'hidden' } : undefined} aria-hidden={covered || undefined}>{children}</div>{covered && <div className="ritm-privacy-cover"><RitmLoader full label={t('Your space is protected')} /></div>}</>
  return <main className="ritm-lock-page">
    <div className="ritm-lock-visual" aria-hidden="true"><div /><div /><div /><Icon name="lock" /></div>
    <div className="ritm-lock-card">
      <RitmBrand compact /><span className="ritm-eyebrow">{t('YOUR PERSONAL SPACE')}</span>
      <h1>{t('Back to your rhythm.')}</h1><p className="sub">{t('Unlock your training, food and progress.')}</p>
      {status && <form onSubmit={e => { e.preventDefault(); authenticate(false) }}>
        <label className="ritm-password-label">{t('App password')}<div className="ritm-password-input"><Icon name="key" /><TextField ref={password} name="password" type={show ? 'text' : 'password'} autoComplete="current-password" required placeholder={t('Enter your password')} /><button type="button" className="iconbtn" aria-label={show ? t('Hide password') : t('Show password')} onClick={() => setShow(!show)}><Icon name={show ? 'eyeSlash' : 'eye'} /></button></div></label>
        <Button type="submit" variant="primary" busy={busy} trailingIcon="arrowRight">{t('Unlock RITM')}</Button>
        {status.biometric && status.biometricAvailable && <Button type="button" data-biometric variant="tinted" icon="fingerprint" disabled={busy} onClick={() => authenticate(true)}>{t('Unlock with fingerprint')}</Button>}
      </form>}
      {!status && <Button variant="primary" onClick={() => { setError(''); readDeviceLockStatus(service).then(setStatus).catch(e => setError(e.message)) }}>{t('Retry')}</Button>}
      {error && <p role="alert" className="ritm-lock-error">{error}</p>}
      <p className="ritm-lock-footer"><Icon name="lock" />{t('Private access on this device')}</p>
    </div>
  </main>
}
