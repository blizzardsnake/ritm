import { useNavigate, useLocation } from 'react-router-dom'
import { useUpdates } from '../lib/personal/use-updates.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'

export default function PersonalUpdateBanner() {
  const state = useUpdates(), nav = useNavigate(), location = useLocation()
  if (!state.release?.hasUpdate || location.pathname === '/updates' || location.pathname === '/workout' || location.pathname === '/coach') return null
  return <button className="ritm-update-banner" onClick={() => nav('/updates')}>
    <Icon name="download" /><span><strong>{t('A new RITM is ready')}</strong><small>{state.downloading ? t('Downloading update…') : t('Version {0}', state.release.versionName)}</small></span><Icon name="chevronRight" />
  </button>
}
