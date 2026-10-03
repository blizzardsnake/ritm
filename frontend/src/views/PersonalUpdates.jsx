import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { personalUpdates, useUpdates } from '../lib/personal/use-updates.js'
import { CHANNEL, RELEASE_PAGE } from '../lib/personal/update-release.js'
import { t } from '../lib/i18n.js'
import { Button, Section, Row, Switch } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import RitmBrand from '../components/RitmBrand.jsx'

export default function PersonalUpdates() {
  const nav = useNavigate(), state = useUpdates(), release = state.release
  useEffect(() => { void personalUpdates.check() }, [])
  const pct = state.total ? Math.min(100, Math.round(state.received / state.total * 100)) : 0
  return <div className="narrow personal-stack ritm-updates-page">
    <div className="hdr"><div><RitmBrand compact /><h1>{t('RITM updates')}</h1><p className="sub">{t('Fresh features. Right here.')}</p></div><button className="iconbtn" aria-label={t('Back')} onClick={() => nav('/settings')}><Icon name="chevronLeft" /></button></div>
    <section className="ritm-release-card">
      <div className="ritm-release-symbol"><Icon name={release?.hasUpdate ? 'download' : 'sparkles'} /></div>
      <span className="ritm-eyebrow">RITM PERSONAL</span>
      <h2>{release?.hasUpdate ? t('A new RITM is ready') : state.checking ? t('Checking…') : state.checkedAt && !state.error ? t('Everything is up to date') : t('Your RITM, getting better')}</h2>
      <p className="muted">{t('Installed version: {0}', state.installed?.versionName || CHANNEL.versionName)}</p>
      {release?.hasUpdate && <><div className="ritm-release-version">{release.versionName}<small>{(release.bytes / 1000000).toFixed(1)} MB</small></div>{release.notes && <p className="ritm-release-notes">{release.notes}</p>}</>}
      {state.downloading && <div className="ritm-download-progress" role="progressbar" aria-label={t('Downloading update…')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div><i style={{ width: pct + '%' }} /></div><span>{pct}% · {(state.received / 1000000).toFixed(1)} / {(state.total / 1000000).toFixed(1)} MB</span>
      </div>}
      {state.needsPermission && <p className="ritm-update-help">{t('Allow RITM to install apps in the Android window, return here and continue installation.')}</p>}
      {state.downloaded && !state.needsPermission && <p className="small muted">{t('The file is verified. Confirm installation in the Android window. If you closed it, you can open it again.')}</p>}
      {state.error && <p role="alert" className="ritm-update-error">{t(state.error)}</p>}
      {state.supported ? <div className="ritm-release-actions">
        {release?.hasUpdate && <Button variant="primary" icon="download" busy={state.installing} disabled={state.downloading || state.checking} onClick={() => state.downloaded ? personalUpdates.install() : personalUpdates.download()}>
          {state.downloading ? t('Downloading update…') : state.downloaded ? t('Continue installation') : t('Download and install')}
        </Button>}
        {state.downloading ? <Button onClick={() => personalUpdates.cancel()}>{t('Cancel download')}</Button> : <Button icon="refresh" busy={state.checking} disabled={state.installing} onClick={() => personalUpdates.check({ force: true })}>{t('Check RITM updates')}</Button>}
      </div> : <p className="ritm-update-help">{t('In-app updates work in the Android version of RITM.')}</p>}
    </section>
    <Section title={t('Delivery')}>
      <Row icon="refresh" iconTint="var(--acc)" title={t('Automatic update checks')} subtitle={t('When opening RITM and returning to the app.')}>
        <Switch checked={state.automatic} onChange={value => personalUpdates.setAutomatic(value)} />
      </Row>
      <Row icon="link" iconTint="var(--blue)" title={t('Published versions')} subtitle="GitHub · RITM" accessory="chevron" onClick={() => window.open(RELEASE_PAGE, '_blank', 'noopener,noreferrer')} />
    </Section>
    {state.checkedAt && <p className="small muted ritm-update-stamp">{t('Last successful check: {0}', new Date(state.checkedAt).toLocaleString())}</p>}
    <p className="small muted ritm-update-stamp">{t('Your diaries stay on the device. Android asks you to confirm installation.')}</p>
  </div>
}
