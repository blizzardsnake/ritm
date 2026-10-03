import { sha256HexJs } from '../sha256.js'

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Nonfinite value')
  return JSON.stringify(value)
}
export const fingerprint = value => sha256HexJs(new TextEncoder().encode(canonicalJson(value)))
const content = obj => Object.fromEntries(Object.entries(obj || {}).filter(([key]) => !['_ts', 'createdAt', 'updatedAt'].includes(key)))
export const exerciseFingerprint = (cfg, routine, unit) => fingerprint({ cfg: content(cfg), prog: routine?.prog, excludeFromProgression: routine?.excludeFromProgression, unit: unit || 'kg' })

// Includes the history that drives the next prescription. An additional workout
// can change the effective plan even when no routine was edited.
export function planFingerprint(state) {
  return fingerprint({ unit: state.unit || 'kg', startFrom: state.startFrom || 'plan',
    routines: (state.routines || []).filter(r => !r.deletedAt).map(content), week: state.week || {}, dayPlan: state.dayPlan || {},
    exWeights: state.exWeights || {}, plates: state.plates || {}, loadKind: state.loadKind || {}, barWeights: state.barWeights || {},
    customEx: (state.customEx || []).map(content),
    targets: (state.nutrition?.targets || []).filter(r => !r.deletedAt).map(content),
    overrides: (state.weeklyReviews?.overrides || []).filter(r => !r.deletedAt).map(content),
    workouts: (state.workouts || []).filter(w => !w.deletedAt).map(w => ({ id: w.id, d: w.d, start: w.start,
      excludeFromProgression: w.excludeFromProgression, entries: (w.entries || []).map(e => ({ id: e.id, rid: e.rid, noProg: e.noProg,
        target: e.target, planned: e.planned, personalOverrideIds: e.personalOverrideIds, sets: e.sets })) })),
  })
}
