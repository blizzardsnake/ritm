import { registerPlugin, Capacitor } from '@capacitor/core'
import { mergeHealthSnapshot, originKey } from './health.js'
import { refreshProgressAwards } from './progress.js'

export const PersonalHealth = registerPlugin('PersonalHealth')
export const healthNativeAvailable = () => Capacitor.getPlatform() === 'android'
const operations = new WeakMap()
const lastRead = new WeakMap()
const onAndroid = native => native !== PersonalHealth || healthNativeAvailable()
// Launch/resume, manual reads and exports share one acknowledgement barrier per store.
function serialized(store, operation) {
  const next = (operations.get(store) || Promise.resolve()).catch(() => {}).then(operation)
  operations.set(store, next.catch(() => {}))
  return next
}
export async function flushHealthMailbox({ native = PersonalHealth, readState, commit } = {}) {
  const snapshot = await native.readMailbox()
  if (!snapshot?.generation) return { imported: false }
  const state = readState()
  const reason = snapshot.profileId !== state.personalProfile?.id ? 'different-profile'
    : originKey(snapshot.origins) !== originKey(state.health?.config?.origins) ? 'different-origins' : null
  if (reason) {
    await native.ackMailbox({ generation: snapshot.generation, archive: true })
    return { imported: false, reason, generation: snapshot.generation }
  }
  const next = { ...structuredClone(state), health: mergeHealthSnapshot(state.health, snapshot) }
  await commit(next)
  await native.ackMailbox({ generation: snapshot.generation })
  return { imported: true, generation: snapshot.generation }
}
export async function drainHealthMailbox(options) {
  let importedCount = 0
  const seen = new Set()
  for (;;) {
    const result = await flushHealthMailbox(options)
    if (!result.generation) return { imported: importedCount > 0, importedCount }
    if (seen.has(result.generation)) throw new Error('Health import queue did not advance')
    seen.add(result.generation)
    if (result.imported) importedCount++
  }
}
async function importUnlocked(store, native) {
  return drainHealthMailbox({ native, readState: () => store.getState().S,
    commit: async next => {
      store.getState().updatePersonal(state => { state.health = next.health })
      await store.getState().flushNativeMirror()
    } })
}
export async function importPendingHealth(store, { native = PersonalHealth } = {}) {
  if (!onAndroid(native)) return { imported: false, importedCount: 0 }
  return serialized(store, () => importUnlocked(store, native))
}
function saveDeviceStatus(store, status) {
  store.getState().updatePersonal(state => {
    state.health.status = { ...state.health.status, ...structuredClone(status), checkedAt: Date.now(), updatedAt: Date.now(), offWrist: 'unknown' }
  })
}
export async function syncPersonalHealth(store, { native = PersonalHealth, days = 7, force = false, discoverOrigins = false } = {}) {
  if (!onAndroid(native)) return { availability: 'android_only' }
  return serialized(store, async () => {
    await importUnlocked(store, native)
    const state = store.getState().S
    const key = `${state.personalProfile?.id}|${originKey(state.health?.config?.origins)}|${!!state.health?.config?.background}|${days}`
    const last = lastRead.get(store)
    if (!force && !discoverOrigins && last?.key === key && Date.now() - last.at < 15000) return state.health.status
    const status = await native.getStatus({ discoverOrigins })
    saveDeviceStatus(store, status)
    const current = store.getState().S
    const origins = current.health?.config?.origins || []
    const profileId = current.personalProfile?.id
    if (status.availability === 'available' && origins.length && profileId) {
      await native.readSnapshot({ origins, days, profileId })
      await importUnlocked(store, native)
    }
    const refreshed = await native.getStatus()
    if (discoverOrigins) refreshed.discoveryErrors = status.discoveryErrors || {}
    saveDeviceStatus(store, refreshed)
    const latest = store.getState().S
    const enabled = !!latest.health?.config?.background && refreshed.availability === 'available'
      && refreshed.backgroundSupported === true && refreshed.backgroundGranted === true
      && (latest.health?.config?.origins?.length || 0) > 0
      && Object.values(refreshed.permissions || {}).some(value => value === true)
    const scheduled = await native.scheduleSync({ enabled, origins: latest.health?.config?.origins || [], profileId: latest.personalProfile?.id || '' })
    saveDeviceStatus(store, { ...refreshed, backgroundScheduled: scheduled.backgroundScheduled === true })
    await store.getState().flushNativeMirror()
    lastRead.set(store, { key, at: Date.now() })
    return store.getState().S.health.status
  })
}
export async function preparePersonalExport(store, { native = PersonalHealth } = {}) {
  if (!onAndroid(native)) { refreshProgressAwards(store); return structuredClone(store.getState().S) }
  return serialized(store, async () => {
    await importUnlocked(store, native)
    refreshProgressAwards(store)
    await store.getState().flushNativeMirror()
    return structuredClone(store.getState().S)
  })
}
