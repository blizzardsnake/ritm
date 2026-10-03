import fs from 'node:fs'
import { buildAnalysis } from '../../frontend/src/lib/personal/report.js'
import { validateEnvelope } from '../../frontend/src/lib/personal/exchange.js'
import { fingerprint } from '../../frontend/src/lib/personal/plan.js'
import { migratePersonalState } from '../../frontend/src/lib/personal/state.js'
import { validDate, shiftDate } from '../../frontend/src/lib/personal/time.js'

export const analysisFile = () => (process.env.OPENGYM_ANALYSIS_FILE || '').trim()
const error = (code, message) => Object.assign(new Error(message), { code })

// Read every call: atomic replacement, unchanged mtimes and watcher omissions
// cannot leave a stale snapshot masquerading as the latest report.
export function readAnalysisFile({ profileId } = {}) {
  const file = analysisFile()
  const maxBytes = 16 * 1024 * 1024
  const ageHours = Number(process.env.OPENGYM_ANALYSIS_MAX_AGE_HOURS || '168')
  if (!Number.isFinite(ageHours) || ageHours <= 0 || ageHours > 8760) throw error('CONFIG', 'Invalid analysis maximum age')
  if (fs.statSync(file).size > maxBytes) throw error('INVALID_REPORT', 'Analysis file is too large')
  const raw = fs.readFileSync(file, 'utf8')
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) throw error('INVALID_REPORT', 'Analysis file is too large')
  const snapshot = JSON.parse(raw.replace(/^\uFEFF/, ''))
  if (snapshot?.format !== 'opengym-personal-exchange' || snapshot.formatVersion !== 1 || !/^[a-f0-9]{64}$/.test(snapshot.checksum || '')) throw error('INVALID_REPORT', 'Invalid exchange snapshot')
  validateEnvelope(snapshot.payload)
  const expected = (process.env.OPENGYM_PROFILE_ID || '').trim()
  if (snapshot.profileId !== snapshot.payload.profileId || (expected && snapshot.profileId !== expected) || (profileId && snapshot.profileId !== profileId)) throw error('WRONG_PROFILE', 'Wrong analysis profile')
  if (snapshot.watermark !== snapshot.payload.watermark || snapshot.generatedAt !== snapshot.payload.generatedAt) throw error('INVALID_REPORT', 'Inconsistent snapshot watermark/time')
  if (fingerprint(snapshot.payload) !== snapshot.checksum) throw error('INVALID_REPORT', 'Invalid checksum')
  const ageMs = Date.now() - snapshot.generatedAt
  if (ageMs < -300000 || ageMs > ageHours * 3600000) throw error('STALE_REPORT', 'Stale or future snapshot; prepare and transfer a fresh report')
  return { report: snapshot.payload, source: { mode: 'file', verifiedCurrent: true, profileId: snapshot.profileId, generatedAt: snapshot.generatedAt,
    watermark: snapshot.watermark, checksum: snapshot.checksum, ageMs, maxAgeMs: ageHours * 3600000 } }
}

export function personalReport(state, user, { profile_id, from, to } = {}) {
  if (analysisFile()) {
    const result = readAnalysisFile({ profileId: profile_id })
    const window = result.report.window
    if ((from && from !== window.from) || (to && to !== window.to)) throw error('REPORT_WINDOW', 'Full report uses its original snapshot window; prepare a different range on the phone')
    return result
  }
  if (!state) throw error('NO_STATE', 'No synced state or analysis file')
  const profileId = state.personalProfile?.id || user.id
  if (profile_id && profile_id !== profileId) throw error('WRONG_PROFILE', 'Wrong analysis profile')
  to ||= new Date().toISOString().slice(0, 10); from ||= shiftDate(to, -6)
  const report = buildAnalysis(migratePersonalState(state, { profileId }), { from, to })
  return { report, source: { mode: 'database', verifiedCurrent: true, profileId, generatedAt: report.generatedAt, watermark: report.watermark, ageMs: 0 } }
}

export function withinSnapshot(report, { from, to } = {}) {
  from ||= report.window.from; to ||= report.window.to
  if (!validDate(from) || !validDate(to) || from > to || from < report.window.from || to > report.window.to) throw error('REPORT_WINDOW', 'Requested date range is outside the snapshot window')
  return { from, to }
}
