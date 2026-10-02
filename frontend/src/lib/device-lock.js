import { Capacitor, registerPlugin } from '@capacitor/core'
import { t } from './i18n.js'

export const LOCK_KEY = 'ritm_device_lock_v1'
const ITERATIONS = 600000
const encode = bytes => btoa(String.fromCharCode(...bytes))
const decode = text => Uint8Array.from(atob(text), c => c.charCodeAt(0))
export function validateLockPassword(password) {
  if (typeof password !== 'string' || [...password].length < 8 || [...password].length > 128) throw new Error(t('Use 8–128 characters for your password'))
}
export function createWebDeviceLock({ storage = globalThis.localStorage, crypto = globalThis.crypto, now = Date.now } = {}) {
  let unlocked = false
  const read = () => {
    const raw = storage.getItem(LOCK_KEY)
    if (raw == null) return null
    try {
      const record = JSON.parse(raw)
      if (record.version !== 1 || record.iterations !== ITERATIONS || decode(record.salt).length !== 16 || decode(record.hash).length !== 32
        || !Number.isSafeInteger(record.failures) || record.failures < 0 || !Number.isFinite(record.retryAt) || record.retryAt < 0) throw new Error()
      return record
    } catch { throw new Error(t('App protection settings could not be read. Retry without deleting your data.')) }
  }
  const write = record => storage.setItem(LOCK_KEY, JSON.stringify(record))
  const derive = async (password, salt) => {
    if (!crypto?.subtle) throw new Error(t('Password protection requires a secure browser or the Android app'))
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, key, 256))
  }
  const verify = async password => {
    const record = read()
    if (!record) throw new Error(t('App protection is not enabled'))
    if (record.retryAt > now()) throw new Error(t('Too many attempts. Try again shortly.'))
    if (typeof password !== 'string' || password.length > 512) throw new Error(t('Incorrect password'))
    const actual = await derive(password, decode(record.salt)), expected = decode(record.hash)
    let difference = 0
    for (let i = 0; i < expected.length; i++) difference |= actual[i] ^ expected[i]
    if (difference) {
      record.failures++
      record.retryAt = record.failures >= 5 ? now() + Math.min(300000, 30000 * 2 ** Math.min(4, record.failures - 5)) : 0
      write(record)
      throw new Error(t('Incorrect password'))
    }
    write({ ...record, failures: 0, retryAt: 0 })
  }
  return {
    async getStatus() { const record = read(); return { enabled: !!record, unlocked: !record || unlocked, biometric: false, biometricAvailable: false, retryAt: record?.retryAt || 0, platform: 'web' } },
    async configure({ password, currentPassword } = {}) {
      validateLockPassword(password)
      if (read()) await verify(currentPassword)
      const salt = crypto.getRandomValues(new Uint8Array(16)), hash = await derive(password, salt)
      write({ version: 1, iterations: ITERATIONS, salt: encode(salt), hash: encode(hash), failures: 0, retryAt: 0 })
      unlocked = true
    },
    async unlock({ password } = {}) { await verify(password); unlocked = true },
    async remove({ password } = {}) { await verify(password); storage.removeItem(LOCK_KEY); unlocked = false },
    async lock() { unlocked = false },
    async authenticate() { throw new Error(t('Fingerprint unlock is available in the Android app')) },
  }
}
const NativeLock = registerPlugin('RitmLock')
const WebLock = createWebDeviceLock()
export const DeviceLock = Capacitor.getPlatform() === 'android' ? NativeLock : WebLock
export async function readDeviceLockStatus(service = DeviceLock) {
  const status = await service.getStatus()
  if (!status || typeof status.enabled !== 'boolean' || typeof status.unlocked !== 'boolean'
    || ['biometric', 'biometricAvailable'].some(key => status[key] != null && typeof status[key] !== 'boolean')) {
    throw new Error(t('App protection settings could not be read. Retry without deleting your data.'))
  }
  return status
}
export function notifyDeviceLockChanged() { window.dispatchEvent(new Event('ritm:lock-change')) }
