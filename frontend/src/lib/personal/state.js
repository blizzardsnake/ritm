export const PERSONAL_SCHEMA_VERSION = 1
export const PERSONAL_RECORDS = Object.freeze({
  nutrition: ['foods', 'recipes', 'meals', 'dayCompleteness', 'targets'],
  health: ['daily', 'sleep', 'heartRate', 'activities'],
  progressGoals: ['goals', 'awards'],
  weeklyReviews: ['proposals', 'journal', 'overrides'],
})

export function personalId() {
  return globalThis.crypto?.randomUUID?.() ?? `personal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function migratePersonalState(state = {}, { now = Date.now(), profileId } = {}) {
  const result = structuredClone(state)
  if (result.personalProfile?.schemaVersion > PERSONAL_SCHEMA_VERSION) throw new Error('Нужна более новая версия openGym Personal')
  result.personalProfile = {
    schemaVersion: PERSONAL_SCHEMA_VERSION, id: profileId ?? personalId(),
    createdAt: now, updatedAt: now, observationStartedAt: null,
    ...result.personalProfile,
  }
  for (const [section, records] of Object.entries(PERSONAL_RECORDS)) {
    const old = result[section] ?? {}
    if (old.schemaVersion > PERSONAL_SCHEMA_VERSION) throw new Error('Нужна более новая версия openGym Personal')
    result[section] = { ...old, schemaVersion: PERSONAL_SCHEMA_VERSION }
    for (const field of records) result[section][field] = Array.isArray(old[field]) ? old[field] : []
  }
  result.health.config ??= { origins: [], updatedAt: 0 }
  result.health.status ??= {}
  return result
}

// The same timestamp can result from two offline devices. Stable ordering makes
// a merge repeatable; a tombstone wins a tie so a deletion cannot resurrect.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

function winner(a, b) {
  if (!a) return b
  if (!b) return a
  const aTime = Math.max(Number(a.updatedAt) || 0, Number(a.deletedAt) || 0)
  const bTime = Math.max(Number(b.updatedAt) || 0, Number(b.deletedAt) || 0)
  if (aTime !== bTime) return aTime > bTime ? a : b
  if (!!a.deletedAt !== !!b.deletedAt) return a.deletedAt ? a : b
  return canonical(a) >= canonical(b) ? a : b
}

export function mergePersonalRecords(a = [], b = []) {
  const byId = new Map()
  for (const record of [...a, ...b]) {
    if (!record || typeof record.id !== 'string' || !record.id) continue
    byId.set(record.id, winner(byId.get(record.id), record))
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)).map(record => structuredClone(record))
}

export function mergePersonalState(a = {}, b = {}) {
  const result = {}
  const profile = winner(a.personalProfile, b.personalProfile)
  if (profile) result.personalProfile = structuredClone(profile)
  for (const [section, fields] of Object.entries(PERSONAL_RECORDS)) {
    if (!a[section] && !b[section]) continue
    result[section] = { ...structuredClone(a[section] ?? {}), ...structuredClone(b[section] ?? {}), schemaVersion: PERSONAL_SCHEMA_VERSION }
    for (const field of fields) result[section][field] = mergePersonalRecords(a[section]?.[field], b[section]?.[field])
    if (section === 'health') {
      result.health.config = structuredClone(winner(a.health?.config, b.health?.config) ?? { origins: [], updatedAt: 0 })
      result.health.status = structuredClone(winner(a.health?.status, b.health?.status) ?? {})
    }
  }
  return result
}

export function personalHasData(state = {}) {
  // Tombstones are data too: dropping them would revive an older remote record.
  return Object.entries(PERSONAL_RECORDS).some(([section, fields]) =>
    fields.some(field => (state[section]?.[field]?.length ?? 0) > 0))
}

// Schema installation and generated identity are not edits by the owner. Leaving
// those out preserves the original unsynced-change count after an old profile loads.
export function personalSyncContent(state = {}) {
  const out = {}
  for (const [section, fields] of Object.entries(PERSONAL_RECORDS)) {
    const content = {}
    for (const field of fields) if (state[section]?.[field]?.length) content[field] = state[section][field]
    if (section === 'health') {
      const config = state.health?.config
      if (config?.origins?.length || config?.background) content.config = config
      if (Object.keys(state.health?.status || {}).length) content.status = state.health.status
    }
    if (Object.keys(content).length) out[section] = content
  }
  const profile = Object.fromEntries(Object.entries(state.personalProfile || {}).filter(([key, value]) =>
    !['schemaVersion', 'id', 'createdAt', 'updatedAt', 'deletedAt'].includes(key) && value !== null && value !== '' && value !== undefined))
  if (Object.keys(profile).length) out.personalProfile = profile
  return out
}
