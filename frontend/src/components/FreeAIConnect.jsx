import {useEffect,useState} from 'react'
import {Capacitor} from '@capacitor/core'
import {Browser} from '@capacitor/browser'
import {t} from '../lib/i18n.js'
import {openRouterAuth} from '../lib/personal/openrouter-auth.js'
import {Button,TextField} from './ui.jsx'
export default function FreeAIConnect({onConnected}) {
  const [pending,setPending]=useState(false),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  useEffect(()=>{let live=true; openRouterAuth.pending().then(value=>live&&setPending(value)); return()=>{live=false}},[])
  async function begin() {
    setMessage(''); setBusy(true)
    try {
      const url=await openRouterAuth.begin(); setPending(true)
      if (Capacitor.isNativePlatform()) await Browser.open({url,toolbarColor:'#0a1015'})
      else window.open(url,'_blank','noopener,noreferrer')
    } catch(error) { setMessage(t(error.message)) } finally {setBusy(false)}
  }
  async function connect() {
    setMessage(''); setBusy(true)
    try { await openRouterAuth.complete(code); setCode(''); setPending(false); onConnected?.() } catch(error) {setMessage(t(error.message))} finally {setBusy(false)}
  }
  return <section className="card ritm-free-ai-card personal-stack">
    <span className="ritm-eyebrow">RITM · FREE AI</span><h2>OpenRouter</h2>
    <p>{t('Free AI: up to 50 API requests a day. RITM also limits usage to 200 requests in seven days.')}</p>
    <p className="small muted">{t('Sign in once, authorize RITM, then paste the one-time connection code here. Your API key is saved automatically on this phone.')}</p>
    <Button variant="primary" icon="sparkles" busy={busy} onClick={begin}>{t(pending?'Open sign-in again':'Sign in to OpenRouter')}</Button>
    {pending&&<><label>{t('One-time connection code')}<TextField type="password" value={code} autoComplete="off" autoCapitalize="none" autoCorrect="off" onChange={e=>setCode(e.target.value)} /></label>
      <Button variant="primary" icon="check" busy={busy} disabled={!code.trim()} onClick={connect}>{t('Connect RITM')}</Button>
      <Button variant="ghost" disabled={busy} onClick={async()=>{await openRouterAuth.cancel();setCode('');setPending(false)}}>{t('Cancel')}</Button></>}
    {message&&<p role="alert">{message}</p>}
    <p className="small muted">{t('Only free models. No automatic paid fallback.')}</p>
  </section>
}
