import { eventTime, validDate, datesBetween } from './time.js'

export const HEALTH_METRICS = Object.freeze(['steps', 'distance', 'activeKcal', 'totalKcal', 'sleep', 'heartRate', 'activities'])
const DAILY_FIELDS = { steps: 'steps', distance: 'distanceM', activeKcal: 'activeKcal', totalKcal: 'totalKcal' }
export const originKey = origins => [...new Set(origins || [])].sort().join('|')
export function selectedHealthDaily(health) {
  const key = originKey(health?.config?.origins)
  return (health?.daily || []).filter(day => !day.deletedAt && key && (day.originKey || originKey(day.origins)) === key).sort((a, b) => a.date.localeCompare(b.date))
}
function unionDuration(intervals) {
  const sorted = intervals.filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start).sort((a, b) => a[0] - b[0])
  let total = 0, start = null, end = null
  for (const range of sorted) {
    if (start == null) [start, end] = range
    else if (range[0] <= end) end = Math.max(end, range[1])
    else { total += end - start; [start, end] = range }
  }
  return total + (start == null ? 0 : end - start)
}
/** Shared selected-source summary. A session interval alone is never counted as confirmed sleep. */
export function summarizeHealthDay(health, date) {
  const origins = health?.config?.origins || []
  const selected = records => (records || []).filter(record => !record.deletedAt && origins.includes(record.origin))
  const daily = selectedHealthDaily(health).find(day => day.date === date)
  const sessions = selected(health?.sleep).filter(record => record.date === date)
  const ranges = sessions.map(record => [record.start, record.end])
  const stages = sessions.flatMap(record => (record.stages || []).map(stage => ({ ...stage, start: Math.max(stage.start, record.start), end: Math.min(stage.end, record.end) })))
  const known = stages.filter(stage => [1, 2, 3, 4, 5, 6, 7].includes(stage.stage)).map(stage => [stage.start, stage.end])
  const asleep = stages.filter(stage => [2, 4, 5, 6].includes(stage.stage)).map(stage => [stage.start, stage.end])
  const awake = stages.filter(stage => [1, 3, 7].includes(stage.stage)).map(stage => [stage.start, stage.end])
  const intervalMs = unionDuration(ranges), coverageMs = unionDuration(known), asleepMs = unionDuration(asleep)
  const conflict = asleepMs + unionDuration(awake) > coverageMs
  const coverage = !intervalMs ? 'missing' : conflict ? 'conflicting' : coverageMs === intervalMs ? 'complete' : coverageMs ? 'partial' : 'unstaged'
  const readings = [], sources = new Map(), seen = new Set()
  for (const record of selected(health?.heartRate)) for (const sample of record.samples || []) {
    if (!(sample.bpm > 0) || !Number.isFinite(sample.bpm) || !Number.isFinite(sample.at)) continue
    let sampleDate
    try {
      sampleDate = Number.isInteger(record.endOffsetMinutes) && Math.abs(record.endOffsetMinutes) <= 1080
        ? new Date(sample.at + record.endOffsetMinutes * 60000).toISOString().slice(0, 10)
        : eventTime(sample.at, { timezone: record.timezone }).date
    } catch { continue }
    const key = `${record.origin}|${record.sourceId}|${sample.at}`
    if (sampleDate !== date || seen.has(key)) continue
    seen.add(key); readings.push(sample.bpm)
    sources.set(`${record.origin}|${record.sourceId}`, { origin: record.origin, sourceId: record.sourceId })
  }
  const min = readings.reduce((value, sample) => value == null ? sample : Math.min(value, sample), null)
  const max = readings.reduce((value, sample) => value == null ? sample : Math.max(value, sample), null)
  return { date, origins: [...origins], steps: daily?.steps ?? null, distanceM: daily?.distanceM ?? null,
    activeKcal: daily?.activeKcal ?? null, totalKcal: daily?.totalKcal ?? null, daily: daily || null, offWrist: 'unknown',
    sleep: { records: sessions, intervalMinutes: intervalMs ? intervalMs / 60000 : null,
      asleepMinutes: coverage === 'complete' ? asleepMs / 60000 : null,
      knownAsleepMinutes: known.length ? asleepMs / 60000 : null, coverage },
    heartRate: { count: readings.length, min, max, mean: readings.length ? readings.reduce((sum, bpm) => sum + bpm, 0) / readings.length : null, sources: [...sources.values()] },
    activities: selected(health?.activities).filter(record => record.date === date) }
}
function valueOf(value) {
  if (value == null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Invalid health measurement')
  return value
}
function interval(record, snapshot) {
  if (!snapshot.origins.includes(record.origin) || !record.sourceId || !Number.isFinite(record.start)
    || !Number.isFinite(record.end) || record.end < record.start) throw new Error('Invalid health origin/interval')
  const clock = eventTime(record.end, { timezone: snapshot.timezone })
  if (record.endOffsetMinutes != null) {
    if (!Number.isInteger(record.endOffsetMinutes) || Math.abs(record.endOffsetMinutes) > 1080) throw new Error('Invalid source offset')
    clock.date = new Date(record.end + record.endOffsetMinutes * 60000).toISOString().slice(0, 10)
    clock.offsetMinutes = record.endOffsetMinutes
  }
  return { ...structuredClone(record), ...clock,
    id: `${record.origin}:${record.sourceId}`, ingestedAt: snapshot.generatedAt, updatedAt: snapshot.generatedAt,
    createdAt: snapshot.generatedAt, deletedAt: null }
}
function sleepRecord(record, snapshot) {
  const result = interval(record, snapshot)
  const stages = (record.stages || []).map(stage => {
    if (!Number.isFinite(stage.start) || !Number.isFinite(stage.end) || stage.end < stage.start || stage.start < record.start || stage.end > record.end || !Number.isInteger(stage.stage)) throw new Error('Invalid sleep stage')
    return { start: stage.start, end: stage.end, stage: stage.stage }
  }).sort((a, b) => a.start - b.start)
  for (let index = 1; index < stages.length; index++) if (stages[index].start < stages[index - 1].end) throw new Error('Overlapping sleep stages')
  const known = stages.filter(stage => [1, 2, 3, 4, 5, 6, 7].includes(stage.stage))
  const covered = unionDuration(known.map(stage => [stage.start, stage.end]))
  const asleep = unionDuration(stages.filter(stage => [2, 4, 5, 6].includes(stage.stage)).map(stage => [stage.start, stage.end])) / 60000
  const stageCoverage = !stages.length ? 'unstaged' : covered === record.end - record.start ? 'complete' : 'partial'
  return { ...result, stages, hasStages: stages.length > 0, stageCoverage, durationMinutes: (record.end - record.start) / 60000,
    knownAsleepMinutes: known.length ? asleep : null, asleepMinutes: stageCoverage === 'complete' ? asleep : null }
}
function replaceIntervals(old, incoming, snapshot) {
  const result = structuredClone(old || [])
  const ids = new Set(incoming.map(item => item.id))
  for (const record of result) {
    if (snapshot.origins.includes(record.origin) && record.date >= snapshot.window.from && record.date <= snapshot.window.to && !ids.has(record.id) && (record.updatedAt || 0) <= snapshot.generatedAt) {
      record.deletedAt = snapshot.generatedAt; record.updatedAt = snapshot.generatedAt
    }
  }
  for (const item of incoming) {
    const index = result.findIndex(record => record.id === item.id)
    if (index < 0) result.push(item)
    else if ((result[index].updatedAt || 0) <= snapshot.generatedAt) result[index] = { ...item, createdAt: result[index].createdAt || item.createdAt }
  }
  return result.sort((a, b) => a.id.localeCompare(b.id))
}
export function mergeHealthSnapshot(health, snapshot) {
  if (snapshot?.schemaVersion !== 1 || !snapshot.generation || !Number.isFinite(snapshot.generatedAt)
    || !Array.isArray(snapshot.origins) || !validDate(snapshot.window?.from) || !validDate(snapshot.window?.to)
    || snapshot.window.from > snapshot.window.to || !Array.isArray(snapshot.completedMetrics)
    || snapshot.completedMetrics.some(metric => !HEALTH_METRICS.includes(metric))) throw new Error('Invalid health snapshot')
  const key = originKey(snapshot.origins)
  if (!key || key !== originKey(health.config?.origins)) return structuredClone(health)
  const result = structuredClone(health)
  result.daily ||= []
  const dates = datesBetween(snapshot.window.from, snapshot.window.to)
  const completed = new Set(snapshot.completedMetrics)
  const byDate = new Map((snapshot.daily || []).map(day => [day.date, day]))
  for (const date of dates) {
    const incoming = byDate.get(date)
    const id = `daily:${key}:${date}`
    const index = result.daily.findIndex(day => day.id === id)
    const previous = index >= 0 ? result.daily[index] : null
    if ((previous?.updatedAt || 0) > snapshot.generatedAt) continue
    const day = { ...previous, id, date, originKey: key, origins: [...snapshot.origins], timezone: snapshot.timezone,
      ingestedAt: completed.size ? snapshot.generatedAt : previous?.ingestedAt ?? null,
      metricIngestedAt: { ...previous?.metricIngestedAt },
      createdAt: previous?.createdAt ?? snapshot.generatedAt, updatedAt: snapshot.generatedAt, deletedAt: null,
      metricStatus: { ...previous?.metricStatus, ...snapshot.metricStatus, ...incoming?.metricStatus },
      permissions: structuredClone(snapshot.permissions || {}), generation: snapshot.generation,
      sourceRecords: { ...previous?.sourceRecords }, intervals: { ...previous?.intervals } }
    for (const [metric, field] of Object.entries(DAILY_FIELDS)) {
      if (day.metricIngestedAt[metric] == null && previous?.[field] != null && previous.ingestedAt != null) day.metricIngestedAt[metric] = previous.ingestedAt
      if (completed.has(metric)) {
        day.metricIngestedAt[metric] = snapshot.generatedAt
        day[field] = valueOf(incoming?.[field])
        day.sourceRecords[metric] = (incoming?.sourceRecords?.[metric] || []).map(record => { interval(record, snapshot); return structuredClone(record) })
        const aggregate = incoming?.intervals?.[metric]
        if (aggregate && ((!Number.isFinite(aggregate.start) && aggregate.start != null) || (!Number.isFinite(aggregate.end) && aggregate.end != null)
          || (aggregate.start != null && aggregate.end != null && aggregate.end < aggregate.start)
          || !Array.isArray(aggregate.origins) || aggregate.origins.some(origin => !snapshot.origins.includes(origin)))) throw new Error('Invalid health aggregate interval')
        day.intervals[metric] = aggregate ? structuredClone(aggregate) : null
      }
      else if (!previous) day[field] = null
    }
    for (const metric of ['sleep', 'heartRate', 'activities']) if (completed.has(metric)) day.metricIngestedAt[metric] = snapshot.generatedAt
    if (index < 0) result.daily.push(day); else result.daily[index] = day
  }
  result.daily.sort((a, b) => a.id.localeCompare(b.id))
  if (completed.has('sleep')) result.sleep = replaceIntervals(result.sleep, (snapshot.sleep || []).map(record => sleepRecord(record, snapshot)), snapshot)
  if (completed.has('heartRate')) result.heartRate = replaceIntervals(result.heartRate, (snapshot.heartRate || []).map(record => {
    const next = interval(record, snapshot)
    next.samples = (record.samples || []).map(sample => {
      if (!Number.isFinite(sample.at) || sample.at < record.start || sample.at > record.end) throw new Error('Invalid heart-rate time')
      return { at: sample.at, bpm: valueOf(sample.bpm) }
    })
    return next
  }), snapshot)
  if (completed.has('activities')) result.activities = replaceIntervals(result.activities, (snapshot.activities || []).map(record => interval(record, snapshot)), snapshot)
  if (health.status?.originKey !== key || (health.status?.lastAttemptAt ?? health.status?.lastSyncAt ?? 0) <= snapshot.generatedAt) result.status = { ...result.status, updatedAt: snapshot.generatedAt,
    lastAttemptAt: snapshot.generatedAt,
    lastSyncAt: completed.size ? snapshot.generatedAt : health.status?.originKey === key ? health.status.lastSyncAt ?? null : null,
    availability: 'available', originKey: key,
    permissions: structuredClone(snapshot.permissions || {}), metricStatus: structuredClone(snapshot.metricStatus || {}),
    origins: [...snapshot.origins], generation: snapshot.generation, offWrist: 'unknown', background: !!snapshot.background, historyLimited: !!snapshot.historyLimited }
  return result
}
