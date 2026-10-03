import { describe, expect, it, vi } from 'vitest'
import { validateUpdateManifest, fetchPersonalRelease, CHANNEL } from './update-release.js'

const url = name => `https://github.com/blizzardsnake/ritm/releases/download/ritm-v1.3.9-personal.3/${name}`
const apk = { name: 'RITM-1.3.9-personal.3.apk', browser_download_url: url('RITM-1.3.9-personal.3.apk'), size: 18000000, digest: `sha256:${'b'.repeat(64)}` }
const manifest = () => ({ schema: 1, applicationId: 'local.opengym.personal', versionCode: 10003, versionName: '1.3.9-personal.3', minSdk: 26, bytes: apk.size, sha256: 'b'.repeat(64), signingCertSha256: 'ac787bac688d73262907d696c2c410382f88d52155d0a634d3389d14a0d8ac44', apkUrl: apk.browser_download_url, notes: 'Automatic updates' })
const installed = { applicationId: 'local.opengym.personal', versionCode: 10002, versionName: '1.3.9-personal.2', sdk: 35, signingCertSha256: manifest().signingCertSha256 }
describe('personal signed release channel', () => {
  it('compares Android integer codes and validates the matching release asset', () => {
    expect(validateUpdateManifest(manifest(), [apk], installed).hasUpdate).toBe(true)
    expect(validateUpdateManifest(manifest(), [apk], { ...installed, versionCode: 10003 }).hasUpdate).toBe(false)
    expect(validateUpdateManifest(manifest(), [apk], { ...installed, versionCode: 10004 }).hasUpdate).toBe(false)
    expect(CHANNEL.repository).toBe('blizzardsnake/ritm')
  })
  it.each([
    { schema: 2 }, { applicationId: 'ch.duartesantos.opengym' }, { versionCode: '10003' },
    { versionCode: 1.5 }, { versionCode: -1 }, { versionName: '' }, { sha256: null },
    { signingCertSha256: 'c'.repeat(64) }, { bytes: 128 * 1024 * 1024 + 1 }, { bytes: -10 },
    { apkUrl: 'https://github.com/attacker/ritm/releases/download/v/a.apk' },
    { apkUrl: 'http://github.com/blizzardsnake/ritm/releases/download/v/a.apk' },
    { apkUrl: apk.browser_download_url + '?download=1' }, { minSdk: 999 },
  ])('rejects incompatible or untrusted manifest %j', changes => {
    expect(() => validateUpdateManifest({ ...manifest(), ...changes }, [apk], installed)).toThrow()
  })
  it('rejects a manifest without its exact asset, mismatched size or digest, and other installed identities', () => {
    for (const assets of [[], [{ ...apk, size: 19 }], [{ ...apk, digest: `sha256:${'c'.repeat(64)}` }]]) {
      expect(() => validateUpdateManifest(manifest(), assets, installed)).toThrow()
    }
    expect(() => validateUpdateManifest(manifest(), [apk], { ...installed, signingCertSha256: 'd'.repeat(64) })).toThrow()
    expect(() => validateUpdateManifest(manifest(), [apk], { ...installed, applicationId: 'local.opengym.personal.test' })).toThrow()
  })
  it('requires a published stable release and an exact trusted manifest asset', async () => {
    const info = { name: 'ritm-update.json', browser_download_url: url('ritm-update.json'), size: 1200 }
    const get = vi.fn().mockResolvedValueOnce({ draft: false, prerelease: false, assets: [apk, info] }).mockResolvedValueOnce(manifest())
    expect((await fetchPersonalRelease(get, installed)).hasUpdate).toBe(true)
    expect(get.mock.calls[0][0]).toBe('https://api.github.com/repos/blizzardsnake/ritm/releases/latest')
    for (const release of [{ draft: true, assets: [apk, info] }, { prerelease: true, assets: [apk, info] }, { assets: [apk] }, { assets: [apk, { ...info, browser_download_url: 'https://evil.example/x' }] }]) {
      await expect(fetchPersonalRelease(async () => release, installed)).rejects.toThrow()
    }
  })
})
