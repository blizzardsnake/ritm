import { afterEach, expect, test, vi } from 'vitest'
vi.mock('./mobile.js', () => ({ MOBILE: true }))
vi.mock('./personal/edition.js', () => ({ ALLOW_UPSTREAM_APK_UPDATES: false }))
import { checkForUpdate, downloadAndInstall, resetUpdateCheck } from './update.js'
afterEach(() => { vi.unstubAllGlobals(); resetUpdateCheck() })
test('personal updater blocks the actual network/install functions even outside Settings', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
  expect(await checkForUpdate()).toMatchObject({ hasUpdate: false, disabled: true, apkUrl: null })
  await expect(downloadAndInstall('https://example.test/upstream.apk')).rejects.toThrow(/personal|RITM|disabled/i)
  expect(fetch).not.toHaveBeenCalled()
})
