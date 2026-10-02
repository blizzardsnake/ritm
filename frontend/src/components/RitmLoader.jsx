import RitmBrand from './RitmBrand.jsx'
import { t } from '../lib/i18n.js'

export default function RitmLoader({ full = false, label = t('Loading…') }) {
  return <div className={'ritm-loader' + (full ? ' full' : '')} role="status" aria-label={label}>
    <div className="ritm-loader-orbit" aria-hidden="true"><RitmBrand compact /><i /></div>
    <div className="ritm-loader-pulse" aria-hidden="true">{[0, 1, 2, 3, 4].map(i => <i key={i} style={{ '--i': i }} />)}</div>
    <p>{label}</p>
  </div>
}
