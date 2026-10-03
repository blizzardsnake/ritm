import { ANALYSIS_FORMAT, ANALYSIS_VERSION } from './report.js'
import { personalId } from './state.js'
import { validDate } from './time.js'
import { sha256Hex } from '../sha256.js'
import { canonicalJson } from './plan.js'
export { canonicalJson } from './plan.js'

export async function sha256(value) {
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : canonicalJson(value))
  return sha256Hex(bytes)
}
export function validateEnvelope(envelope) {
  if (envelope?.format !== ANALYSIS_FORMAT || envelope.formatVersion !== ANALYSIS_VERSION
    || typeof envelope.profileId !== 'string' || !envelope.profileId || !Number.isFinite(envelope.generatedAt)
    || !Number.isFinite(envelope.watermark) || envelope.watermark < 0 || !validDate(envelope.window?.from)
    || !validDate(envelope.window?.to) || !validDate(envelope.window?.contextFrom) || envelope.window.from > envelope.window.to
    || envelope.window.contextFrom > envelope.window.from || !['kg', 'lb'].includes(envelope.units?.weight)
    || !envelope.history || !envelope.plan || !envelope.summaries) throw new Error('Invalid analysis envelope')
}
export async function createExchangeSnapshot(envelope) {
  const payload = JSON.parse(JSON.stringify(envelope))
  validateEnvelope(payload)
  return { format: 'opengym-personal-exchange', formatVersion: 1, profileId: payload.profileId,
    generatedAt: payload.generatedAt, watermark: payload.watermark, checksum: await sha256(payload), payload }
}
export async function verifyExchangeSnapshot(input, { profileId, maxAgeMs, now = Date.now() } = {}) {
  const snapshot = typeof input === 'string' ? JSON.parse(input) : input
  if (snapshot?.format !== 'opengym-personal-exchange' || snapshot.formatVersion !== 1 || !/^[a-f0-9]{64}$/.test(snapshot.checksum || '')) throw new Error('Invalid exchange snapshot')
  validateEnvelope(snapshot.payload)
  if (snapshot.profileId !== snapshot.payload.profileId || (profileId && snapshot.profileId !== profileId)) throw new Error('Wrong profile')
  if (snapshot.watermark !== snapshot.payload.watermark || snapshot.generatedAt !== snapshot.payload.generatedAt) throw new Error('Inconsistent watermark/time')
  if (await sha256(snapshot.payload) !== snapshot.checksum) throw new Error('Invalid checksum')
  if (snapshot.generatedAt > now + 300000 || (maxAgeMs != null && now - snapshot.generatedAt > maxAgeMs)) throw new Error('Stale or future snapshot')
  return structuredClone(snapshot.payload)
}
export async function writeSnapshotAtomic(snapshot, { io, path = 'analysis.json' }) {
  await verifyExchangeSnapshot(snapshot)
  const temp = `${path}.${personalId()}.tmp`
  try {
    await io.write(temp, JSON.stringify(snapshot, null, 2))
    await verifyExchangeSnapshot(await io.read(temp), { profileId: snapshot.profileId })
    await io.rename(temp, path)
  } catch (error) { await io.remove(temp).catch(() => {}); throw error }
  return { path, checksum: snapshot.checksum, generatedAt: snapshot.generatedAt }
}

// Private atomic mirror works without broad storage permissions. A selected
// public exchange folder is handled by the native SAF plugin in the exchange UI.
export async function writePrivateAnalysis(snapshot) {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
  const base = { directory: Directory.Data, encoding: Encoding.UTF8 }
  const io = {
    write: (path, data) => Filesystem.writeFile({ ...base, path, data, recursive: true }),
    read: async path => (await Filesystem.readFile({ ...base, path })).data,
    rename: (from, to) => Filesystem.rename({ directory: Directory.Data, toDirectory: Directory.Data, from, to }),
    remove: path => Filesystem.deleteFile({ directory: Directory.Data, path }),
  }
  return writeSnapshotAtomic(snapshot, { io, path: 'personal-exchange/analysis.json' })
}
