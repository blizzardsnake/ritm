import { useEffect } from 'react'
import { useStore } from '../../store/useStore.js'
import { healthNativeAvailable, syncPersonalHealth } from './health-native.js'
import { originKey } from './health.js'

export function useHealthSync(enabled) {
  const profileId = useStore(state => state.S.personalProfile?.id)
  const origins = useStore(state => originKey(state.S.health?.config?.origins))
  const background = useStore(state => !!state.S.health?.config?.background)
  useEffect(() => {
    if (!enabled || !healthNativeAvailable()) return
    let gone = false, listener
    const run = () => {
      if (gone) return
      syncPersonalHealth(useStore).catch(error => {
        if (gone) return
        useStore.getState().updatePersonal(state => {
          state.health.status = { ...state.health.status, error: error.message || 'Health import failed', checkedAt: Date.now(), updatedAt: Date.now() }
        })
      })
    }
    const visible = () => { if (document.visibilityState === 'visible') run() }
    run()
    document.addEventListener('visibilitychange', visible)
    import('@capacitor/app').then(async ({ App }) => {
      const handle = await App.addListener('appStateChange', ({ isActive }) => { if (isActive) run() })
      if (gone) handle.remove(); else listener = handle
    }).catch(() => {})
    return () => { gone = true; document.removeEventListener('visibilitychange', visible); listener?.remove() }
  }, [enabled, profileId, origins, background])
}
