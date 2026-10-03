import { useEffect, useSyncExternalStore } from 'react'
import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core'
import { App } from '@capacitor/app'
import { MOBILE } from '../mobile.js'
import { createUpdateController } from './update-controller.js'
import { fetchPersonalRelease } from './update-release.js'

const native = registerPlugin('RitmUpdate')
async function getJSON(url) {
  const response = await CapacitorHttp.get({ url, headers: { Accept: 'application/json' }, connectTimeout: 15000, readTimeout: 20000, responseType: 'json' })
  if (response.status !== 200) throw new Error(response.status === 403 || response.status === 429 ? 'Update checks are temporarily limited. Try again later.' : 'Could not check for updates')
  const text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
  if (!text || text.length > (url.endsWith('ritm-update.json') ? 65536 : 512000)) throw new Error('Release verification failed')
  return typeof response.data === 'string' ? JSON.parse(text) : response.data
}
export const personalUpdates = createUpdateController({
  native, fetchRelease: installed => fetchPersonalRelease(getJSON, installed),
  available: () => MOBILE && Capacitor.getPlatform() === 'android', now: Date.now,
  storage: typeof window === 'undefined' ? undefined : window.localStorage,
})
export const useUpdates = () => useSyncExternalStore(personalUpdates.subscribe, personalUpdates.getSnapshot, personalUpdates.getSnapshot)

export function startUpdateChecks(controller, { doc = globalThis.document, app = App, every = setInterval, stopEvery = clearInterval } = {}) {
  if (!controller.getSnapshot().supported) return () => {}
  let stopped = false, handle
  const run = () => { if (!stopped) void controller.check() }
  const visible = () => { if (doc.visibilityState === 'visible') run() }
  run()
  doc.addEventListener('visibilitychange', visible)
  const timer = every(visible, 15 * 60 * 1000)
  Promise.resolve(app.addListener('appStateChange', ({ isActive }) => { if (isActive) run() })).then(result => {
    if (stopped) void result.remove(); else handle = result
  }).catch(() => {})
  return () => { stopped = true; doc.removeEventListener('visibilitychange', visible); stopEvery(timer); void handle?.remove() }
}
export function useUpdateChecks(enabled) {
  useEffect(() => enabled ? startUpdateChecks(personalUpdates) : undefined, [enabled])
}
