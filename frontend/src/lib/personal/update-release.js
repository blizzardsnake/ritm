import config from '../../../../ritm-release.json'

export const CHANNEL = Object.freeze({ ...config })
export const RELEASE_PAGE = `https://github.com/${CHANNEL.repository}/releases`
const MAX_APK = 128 * 1024 * 1024
const hashOK = hash => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash)
export function trustedReleaseUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'github.com' && !url.port && !url.username && !url.password && !url.search && !url.hash
      && url.pathname.startsWith(`/${CHANNEL.repository}/releases/download/`)
      && /^\/[^/]+\/[^/]+\/releases\/download\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(url.pathname)
  } catch { return false }
}
export function validateUpdateManifest(value, assets, installed) {
  if (!value || value.schema !== 1 || value.applicationId !== CHANNEL.applicationId
    || installed?.applicationId !== CHANNEL.applicationId || installed.signingCertSha256 !== CHANNEL.signingCertSha256
    || !Number.isSafeInteger(installed.versionCode) || !Number.isSafeInteger(installed.sdk)
    || !Number.isSafeInteger(value.versionCode) || value.versionCode <= 0 || value.versionCode > 2147483647
    || typeof value.versionName !== 'string' || !/^[A-Za-z0-9.+_-]{1,80}$/.test(value.versionName)
    || !Number.isSafeInteger(value.minSdk) || value.minSdk < CHANNEL.minSdk || value.minSdk > installed.sdk
    || !Number.isSafeInteger(value.bytes) || value.bytes < 100000 || value.bytes > MAX_APK
    || !hashOK(value.sha256) || value.signingCertSha256 !== CHANNEL.signingCertSha256
    || !trustedReleaseUrl(value.apkUrl) || !value.apkUrl.endsWith('.apk')) throw new Error('Release verification failed')
  const asset = assets?.find(a => a.browser_download_url === value.apkUrl)
  if (!asset || asset.size !== value.bytes || (asset.digest && asset.digest !== `sha256:${value.sha256}`)) throw new Error('Release verification failed')
  return { schema: 1, applicationId: value.applicationId, versionCode: value.versionCode, versionName: value.versionName,
    minSdk: value.minSdk, bytes: value.bytes, sha256: value.sha256, signingCertSha256: value.signingCertSha256, apkUrl: value.apkUrl,
    notes: typeof value.notes === 'string' ? value.notes.slice(0, 4000) : '', hasUpdate: value.versionCode > installed.versionCode }
}
export async function fetchPersonalRelease(getJSON, installed) {
  const release = await getJSON(`https://api.github.com/repos/${CHANNEL.repository}/releases/latest`)
  if (!release || release.draft || release.prerelease || !Array.isArray(release.assets)) throw new Error('Release verification failed')
  const asset = release.assets.find(a => a.name === 'ritm-update.json')
  if (!asset || !trustedReleaseUrl(asset.browser_download_url) || !Number.isSafeInteger(asset.size) || asset.size < 2 || asset.size > 65536) throw new Error('Release verification failed')
  return validateUpdateManifest(await getJSON(asset.browser_download_url), release.assets, installed)
}
