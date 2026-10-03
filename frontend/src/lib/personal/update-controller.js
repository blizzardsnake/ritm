const AUTOMATIC_KEY = 'ritm:automatic-updates'
const INTERVAL = 15 * 60 * 1000
export function createUpdateController({ native, fetchRelease, available, now = Date.now, storage }) {
  let automatic = true
  try { automatic = storage?.getItem(AUTOMATIC_KEY) !== 'off' } catch {}
  let state = { automatic, supported: available(), installed: null, release: null, checking: false, checkedAt: null,
    error: '', downloading: false, installing: false, downloaded: false, needsPermission: false, received: 0, total: 0 }
  let lastAttempt = null, checkPromise = null, downloadPromise = null, installPromise = null
  let downloadOperation = null
  const listeners = new Set()
  const patch = changes => { state = { ...state, ...changes }; for (const fn of listeners) fn() }
  const controller = {
    getSnapshot: () => state,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn) },
    setAutomatic(value) {
      patch({ automatic: !!value })
      try { storage?.setItem(AUTOMATIC_KEY, value ? 'on' : 'off') } catch {}
      if (value) void controller.check()
    },
    check({ force = false } = {}) {
      if (checkPromise) return checkPromise
      if (!state.supported || state.downloading || state.installing || (!force && (!state.automatic || (lastAttempt !== null && now() - lastAttempt < INTERVAL)))) return Promise.resolve(state.release)
      lastAttempt = now(); patch({ checking: true, error: '' })
      checkPromise = (async () => {
        try {
          const installed = await native.getStatus()
          const release = await fetchRelease(installed)
          const changed = state.release?.versionCode !== release.versionCode || state.release?.sha256 !== release.sha256 || !release.hasUpdate
          patch({ installed, release, checkedAt: now(), ...(changed ? { downloaded: false, needsPermission: false, received: 0, total: 0 } : {}) })
          return release
        } catch (error) { patch({ error: error.message || 'Could not check for updates' }); return null }
        finally { patch({ checking: false }); checkPromise = null }
      })()
      return checkPromise
    },
    download() {
      if (downloadPromise) return downloadPromise
      if (!state.release?.hasUpdate || state.installing) return Promise.resolve()
      if (state.downloaded) return controller.install()
      const release = state.release
      const operation = { cancelled: false }; downloadOperation = operation
      patch({ downloading: true, error: '', received: 0, total: release.bytes, needsPermission: false })
      downloadPromise = (async () => {
        let handle, live = true
        try {
          handle = await native.addListener('downloadProgress', progress => {
            if (live && !operation.cancelled && state.downloading && progress.total === release.bytes) patch({ received: Math.max(state.received, Math.min(release.bytes, Math.max(0, Number(progress.received) || 0))) })
          })
          if (operation.cancelled) throw new Error('Download cancelled')
          await native.download(release)
          patch({ downloaded: true, received: release.bytes })
        } catch (error) { patch({ downloaded: false, error: error.message || 'Download failed' }) }
        finally {
          live = false
          try { await handle?.remove() } catch {}
          patch({ downloading: false }); downloadPromise = null
        }
        if (state.downloaded && !operation.cancelled) await controller.install()
        if (downloadOperation === operation) downloadOperation = null
      })()
      return downloadPromise
    },
    install() {
      if (installPromise) return installPromise
      if (!state.downloaded || state.downloading || !state.release?.hasUpdate) return Promise.resolve()
      patch({ installing: true, error: '' })
      installPromise = (async () => {
        try { const result = await native.install(state.release); patch({ needsPermission: !!result.needsPermission }) }
        catch (error) { patch({ downloaded: false, error: error.message || 'Installation failed' }) }
        finally { patch({ installing: false }); installPromise = null }
      })()
      return installPromise
    },
    async cancel() {
      if (downloadOperation) downloadOperation.cancelled = true
      try { await native.cancelDownload() } catch (error) { patch({ error: error.message || 'Download failed' }) }
    },
  }
  return controller
}
