import { Capacitor } from '@capacitor/core'
import { nativeFetch } from '../capacitor-fetch.js'
import { setApiKey, withTimeout } from '../coach-secrets.js'
import { OPENROUTER_FREE_SETTINGS } from '../../../../api/coach/core/providers.js'
const TTL=10*60000, SESSION_KEY='ritm.openrouter.pkce'
let memory=null
const storage={
  async get() {
    if (!Capacitor.isNativePlatform()) return memory
    try { const {SecureStorage}=await import('@aparajita/capacitor-secure-storage'); const raw=await withTimeout(SecureStorage.get(SESSION_KEY)); return raw ? JSON.parse(raw) : null } catch { return memory }
  },
  async set(session) {
    memory=session
    if (!Capacitor.isNativePlatform()) return
    const {SecureStorage}=await import('@aparajita/capacitor-secure-storage')
    if (session) await withTimeout(SecureStorage.set(SESSION_KEY,JSON.stringify(session)))
    else try { await withTimeout(SecureStorage.remove(SESSION_KEY)) } catch { /* already removed */ }
  },
}
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')
export function createOpenRouterAuth({storage,fetch,connect,now=Date.now,crypto=globalThis.crypto}) {
  let busy=false
  return {
    async begin() {
      if (busy) throw new Error('Connection is already in progress')
      const verifier=base64url(crypto.getRandomValues(new Uint8Array(48)))
      const challenge=base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))))
      await storage.set({verifier,createdAt:now()})
      const url=new URL('https://openrouter.ai/auth')
      url.search=new URLSearchParams({code_challenge:challenge,code_challenge_method:'S256',key_label:'RITM free AI'}).toString()
      return url.href
    },
    async pending() { const s=await storage.get(); return !!s && now()-s.createdAt>=0 && now()-s.createdAt<TTL },
    async cancel() { if (!busy) await storage.set(null) },
    async complete(input) {
      if (busy) throw new Error('Connection is already in progress')
      const code=String(input||'').trim()
      if (!/^[A-Za-z0-9._-]{8,512}$/.test(code) || code.startsWith('sk-')) throw new Error('Paste the one-time authorization code')
      busy=true
      try {
        const s=await storage.get()
        if (!s || typeof s.verifier!=='string' || now()-s.createdAt<0 || now()-s.createdAt>=TTL) { await storage.set(null); throw new Error('Start the OpenRouter connection again') }
        const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),30000)
        let response
        try { response=await fetch('https://openrouter.ai/api/v1/auth/keys',{method:'POST',headers:{'content-type':'application/json'},signal:controller.signal,
          body:JSON.stringify({code,code_verifier:s.verifier,code_challenge_method:'S256'})}) } catch { throw new Error('Could not connect to OpenRouter. Try signing in again.') } finally { clearTimeout(timer) }
        if (!response.ok) throw new Error('OpenRouter did not accept the authorization code')
        let data
        try { const text=await response.text(); if (text.length>65536) throw new Error(); data=JSON.parse(text) } catch { throw new Error('OpenRouter returned an invalid connection response') }
        if (typeof data.key!=='string' || !data.key || data.key.length>512) throw new Error('OpenRouter returned an invalid connection response')
        await storage.set(null)
        await connect(data.key)
      } finally { busy=false }
    },
  }
}
export async function connectOpenRouterKey(key,{store,saveKey=setApiKey}={}) {
  // No key travels in state exports, source code, a URL, or the public APK.
  if (!store) { const {useStore}=await import('../../store/useStore.js'); store=useStore.getState() }
  await store.setCoachLocal({mode:'byok', ...OPENROUTER_FREE_SETTINGS, requiresOpenRouterAuth:true})
  await saveKey(key,{requireDurable:true})
  // A previous provider's disclosure is not permission to send history to this one.
  store.update(state=>{ if (state.coach) state.coach.consent=null })
  await store.setCoachLocal({requiresOpenRouterAuth:false})
}
export const openRouterAuth=createOpenRouterAuth({storage,fetch:nativeFetch,connect:connectOpenRouterKey})
