import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DeviceLock, readDeviceLockStatus, notifyDeviceLockChanged } from '../lib/device-lock.js'
import { t } from '../lib/i18n.js'
import { Button, Switch, TextField } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import RitmBrand from '../components/RitmBrand.jsx'
import RitmLoader from '../components/RitmLoader.jsx'

export default function AppProtection() {
  const nav = useNavigate(), form = useRef(null), submitting = useRef(false)
  const [status, setStatus] = useState(null), [biometric, setBiometric] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [show, setShow] = useState(false)
  const refresh = async () => { const next = await readDeviceLockStatus(); setStatus(next); setBiometric(!!next.biometric) }
  useEffect(() => { refresh().catch(e => setMessage(e.message)) }, [])
  const save = async remove => {
    if (submitting.current) return
    const fields = form.current.elements, currentPassword = fields.currentPassword?.value || '', password = fields.password.value
    if (!remove && password !== fields.confirmPassword.value) { setMessage(t('Passwords do not match')); return }
    submitting.current = true; setBusy(true); setMessage('')
    try {
      if (remove) await DeviceLock.remove({ password: currentPassword })
      else await DeviceLock.configure({ currentPassword, password, biometric })
      form.current.reset(); await refresh(); notifyDeviceLockChanged()
      setMessage(remove ? t('App protection disabled') : t('App protection saved'))
    } catch (e) { setMessage(t(e.message)) }
    finally { submitting.current = false; setBusy(false) }
  }
  return <div className="narrow personal-stack ritm-protection-page">
    <div className="hdr"><div><RitmBrand compact /><h1>{t('App protection')}</h1><p className="sub">{t('Your space. Your access.')}</p></div><button className="iconbtn" aria-label={t('Back')} onClick={() => nav(-1)}><Icon name="chevronLeft" /></button></div>
    <section className="ritm-program-hero ritm-protection-hero"><div><span className="ritm-eyebrow">{t('DEVICE PRIVACY')}</span><h2>{t('Keep your rhythm personal.')}</h2><p className="sub">{status?.enabled ? t('Password protection is on') : t('Protection is optional')}</p></div><Icon name="lock" /></section>
    {!status ? <><RitmLoader />{message && <p role="alert">{message}</p>}</> : <form ref={form} className="personal-panel personal-stack" onSubmit={e => { e.preventDefault(); save(false) }}>
      <h2>{status.enabled ? t('Change your password') : t('Set an app password')}</h2>
      {status.enabled && <label>{t('Current password')}<TextField name="currentPassword" type={show ? 'text' : 'password'} autoComplete="current-password" required /></label>}
      <label>{t('New password')}<TextField name="password" type={show ? 'text' : 'password'} autoComplete="new-password" minLength={8} maxLength={128} required /></label>
      <label>{t('Repeat password')}<TextField name="confirmPassword" type={show ? 'text' : 'password'} autoComplete="new-password" minLength={8} maxLength={128} required /></label>
      <div className="row between"><span>{t('Show password')}</span><Switch checked={show} onChange={setShow} aria-label={t('Show password')} /></div>
      <p className="small muted">{t('Use 8–128 characters for your password')}</p>
      <div className="ritm-biometric-option"><Icon name="fingerprint" /><div className="grow"><strong>{t('Unlock with fingerprint')}</strong><p className="small muted">{status.biometricAvailable ? t('Confirm access with Android system biometrics') : status.platform === 'web' ? t('Available in the Android app') : status.biometricReason === 'not_enrolled' ? t('Set up a fingerprint in your phone settings first') : status.biometricReason === 'not_supported' ? t('System biometrics are not supported on this device') : t('System biometrics are temporarily unavailable')}</p></div><Switch checked={biometric} onChange={setBiometric} disabled={!status.biometricAvailable || busy} aria-label={t('Unlock with fingerprint')} /></div>
      <Button type="submit" variant="primary" busy={busy} icon="lock">{status.enabled ? t('Save protection') : t('Enable protection')}</Button>
      {status.enabled && <><Button type="button" variant="tinted" disabled={busy} onClick={async () => { await DeviceLock.lock(); notifyDeviceLockChanged() }}>{t('Lock now')}</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => save(true)}>{t('Disable protection')}</Button></>}
      {message && <p role="status" className="small">{message}</p>}
      <p className="small muted">{t('This locks the app interface on this device. Exported backups are not encrypted. Your password is not synced or included in reports.')}</p>
      <p className="small muted">{t('Keep your password safe: there is no password reset for local protection.')}</p>
    </form>}
  </div>
}
