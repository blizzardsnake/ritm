import { describe, expect, it, vi } from 'vitest'
import { createUpdateController } from './update-controller.js'

function rig(extra = {}) {
  let time = 1000000
  const native = { getStatus: vi.fn(async () => ({ applicationId: 'local.opengym.personal', versionCode: 10002, versionName: 'old' })), download: vi.fn(async () => ({})), install: vi.fn(async () => ({ needsPermission: false })), cancelDownload: vi.fn(async () => ({})), addListener: vi.fn(async () => ({ remove: vi.fn() })) }
  const release = { hasUpdate: true, versionCode: 10003, versionName: 'new', bytes: 1000000, apkUrl: 'https://github.com/a.apk' }
  const fetchRelease = vi.fn(async () => release)
  const controller = createUpdateController({ native, fetchRelease, available: () => true, now: () => time, storage: { getItem: () => null, setItem: vi.fn() }, ...extra })
  return { controller, native, fetchRelease, release, tick: ms => { time += ms } }
}
describe('update lifecycle and recovery', () => {
  it('cancels before a delayed progress listener is ready without starting a native download', async () => {
    const { controller: c, native } = rig(); let ready
    native.addListener.mockImplementationOnce(() => new Promise(resolve => { ready = resolve }))
    await c.check(); const download = c.download(); await c.cancel()
    ready({ remove: vi.fn() }); await download
    expect(native.download).not.toHaveBeenCalled(); expect(native.install).not.toHaveBeenCalled()
    expect(c.getSnapshot().downloading).toBe(false)
  })
  it('cancel in the post-download cleanup gap does not open the installer', async () => {
    const { controller: c, native } = rig(); let removed
    native.addListener.mockResolvedValueOnce({ remove: () => new Promise(resolve => { removed = resolve }) })
    await c.check(); const download = c.download()
    await vi.waitFor(() => expect(c.getSnapshot().downloaded).toBe(true))
    await c.cancel(); removed(); await download
    expect(native.install).not.toHaveBeenCalled()
    await c.install(); expect(native.install).toHaveBeenCalledOnce()
  })
  it('checks by default, throttles automatic checks, and manual checks bypass the throttle', async () => {
    const { controller: c, fetchRelease, tick } = rig()
    expect(c.getSnapshot().automatic).toBe(true)
    await c.check(); await c.check()
    expect(fetchRelease).toHaveBeenCalledTimes(1)
    await c.check({ force: true }); expect(fetchRelease).toHaveBeenCalledTimes(2)
    tick(15 * 60 * 1000); await c.check(); expect(fetchRelease).toHaveBeenCalledTimes(3)
  })
  it('disabled automatic checks and web previews do not contact a release endpoint', async () => {
    const { controller: c, fetchRelease } = rig()
    c.setAutomatic(false); await c.check(); expect(fetchRelease).not.toHaveBeenCalled()
    await c.check({ force: true }); expect(fetchRelease).toHaveBeenCalledTimes(1)
    const web = rig({ available: () => false }); await web.controller.check({ force: true }); expect(web.fetchRelease).not.toHaveBeenCalled()
  })
  it('coalesces simultaneous checks and retains the discovered update on an offline failure', async () => {
    const { controller: c, fetchRelease, release } = rig()
    await Promise.all([c.check(), c.check({ force: true })]); expect(fetchRelease).toHaveBeenCalledTimes(1)
    fetchRelease.mockRejectedValueOnce(new Error('offline'))
    await c.check({ force: true }); expect(c.getSnapshot().release).toEqual(release)
    expect(c.getSnapshot().error).toBe('offline'); expect(c.getSnapshot().checking).toBe(false)
  })
  it('failed status checks remain retryable and never report latest', async () => {
    const { controller: c, native, fetchRelease } = rig()
    native.getStatus.mockRejectedValueOnce(new Error('native failed'))
    await c.check(); expect(fetchRelease).not.toHaveBeenCalled(); expect(c.getSnapshot().checkedAt).toBeNull()
    await c.check({ force: true }); expect(c.getSnapshot().release.hasUpdate).toBe(true)
  })
  it('reports actual progress, avoids duplicate downloads and keeps the verified file retryable after installer cancellation', async () => {
    const { controller: c, native } = rig()
    let finish
    native.download.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    native.install.mockResolvedValueOnce({ needsPermission: true })
    await c.check()
    const first = c.download(); const second = c.download()
    await vi.waitFor(() => expect(native.download).toHaveBeenCalledTimes(1))
    const progress = native.addListener.mock.calls[0][1]
    progress({ received: 500000, total: 1000000 }); expect(c.getSnapshot().received).toBe(500000)
    finish({}); await Promise.all([first, second])
    expect(c.getSnapshot().downloaded).toBe(true); expect(c.getSnapshot().needsPermission).toBe(true)
    await c.install(); expect(native.install).toHaveBeenCalledTimes(2)
    expect(c.getSnapshot().downloaded).toBe(true)
    progress({ received: 1, total: 1000000 }); expect(c.getSnapshot().received).toBe(1000000)
  })
  it('download failure is recoverable and clears the progress listener', async () => {
    const { controller: c, native } = rig()
    const remove = vi.fn(); native.addListener.mockResolvedValue({ remove })
    native.download.mockRejectedValueOnce(new Error('broken download'))
    await c.check(); await c.download()
    expect(c.getSnapshot().downloaded).toBe(false); expect(c.getSnapshot().downloading).toBe(false)
    expect(remove).toHaveBeenCalledTimes(1)
    await c.download(); expect(c.getSnapshot().downloaded).toBe(true)
  })
  it('a newer manifest invalidates an earlier downloaded APK', async () => {
    const { controller: c, fetchRelease, release } = rig()
    await c.check(); await c.download()
    fetchRelease.mockResolvedValueOnce({ ...release, versionCode: 10004, versionName: 'newer' })
    await c.check({ force: true }); expect(c.getSnapshot().downloaded).toBe(false)
  })
})
