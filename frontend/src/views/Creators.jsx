import { useNavigate } from 'react-router-dom'
import { CHANNEL } from '../lib/personal/update-release.js'
import { useUpdates } from '../lib/personal/use-updates.js'
import { t } from '../lib/i18n.js'
import Icon from '../components/Icon.jsx'
import RitmBrand from '../components/RitmBrand.jsx'
import license from '../../../LICENSE?raw'
import notices from '../../../NOTICE.md?raw'
import fontLicense from '../../public/fonts/OFL.txt?raw'

const Link = ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}<Icon name="externalLink" /></a>
export default function Creators() {
  const nav = useNavigate(), updates = useUpdates()
  return <div className="narrow personal-stack ritm-creators-page">
    <div className="hdr"><div><RitmBrand compact /><h1>{t('Creators')}</h1><p className="sub">{t('The people and ideas behind RITM')}</p></div><button className="iconbtn" aria-label={t('Back')} onClick={() => nav('/settings')}><Icon name="chevronLeft" /></button></div>
    <section className="ritm-release-card ritm-creators-brand"><RitmBrand /><h2>{t('Your personal rhythm')}</h2><p className="muted">{updates.installed?.versionName || CHANNEL.versionName} · {t('Personal edition')}</p><Link href={`https://github.com/${CHANNEL.repository}`}>{t('RITM source code')}</Link></section>
    <section className="ritm-credit-card"><span className="ritm-eyebrow">FOUNDATION</span><h2>openGym</h2><p>{t('RITM is based on openGym by Duarte Santos. The training engine and weekly muscle load statistics are preserved.')}</p><Link href="https://github.com/DuarteSantos8/openGym">Duarte Santos · openGym</Link><p className="small muted">GNU AGPL v3.0-or-later</p></section>
    <section className="ritm-credit-card"><h2>{t('Data and design')}</h2><div className="ritm-credit-item"><strong>{t('Exercise data')}</strong><p>ExerciseDB v1 · AscendAPI · Hasan Emir Yıldırım · MIT</p><Link href="https://github.com/hasaneyldrm/exercises-dataset">exercises-dataset</Link></div>
      <div className="ritm-credit-item"><strong>{t('Exercise media')}</strong><p>{t('Third-party media is loaded from the original dataset. Ownership and permissions are described in the notices below.')}</p><Link href="https://gymvisual.com/">Gym visual</Link> · <Link href="https://exercisedb.io/faq">ExerciseDB / AscendAPI</Link></div>
      <div className="ritm-credit-item"><strong>{t('Food data')}</strong><p>USDA FoodData Central · CC0<br />Open Food Facts · ODbL / DbCL</p><Link href="https://fdc.nal.usda.gov/">USDA</Link> · <Link href="https://world.openfoodfacts.org/">Open Food Facts</Link></div>
      <div className="ritm-credit-item"><strong>{t('Typography')}</strong><p>Manrope · The Manrope Project Authors · SIL OFL 1.1</p></div>
    </section>
    <section className="ritm-credit-card ritm-license-text"><h2>{t('Licenses and notices')}</h2><details><summary>GNU AGPL v3.0</summary><pre>{license}</pre></details><details><summary>{t('Third-party notices')}</summary><pre>{notices}</pre></details><details><summary>Manrope · SIL OFL</summary><pre>{fontLicense}</pre></details></section>
  </div>
}
