import { planFingerprint, exerciseFingerprint, canonicalJson, fingerprint } from './plan.js'
import { validDate } from './time.js'
import { buildSessionEntries } from '../session-start.js'
import { modeOf, repStep } from '../history.js'
import { NUTRIENT_KEYS } from './nutrition.js'
export { planFingerprint } from './plan.js'
export const PROPOSAL_FORMAT = 'ritm-weekly-proposal'
const ROOT = ['format', 'formatVersion', 'id', 'profileId', 'generatedAt', 'analysisHash', 'planHash', 'window', 'title', 'summary', 'limitations', 'changes']
const CHANGE = ['id', 'type', 'routineId', 'exerciseId', 'field', 'value', 'unit', 'reason', 'evidence']
const strict = (obj, keys) => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || Object.keys(obj).some(key => !keys.includes(key))) throw new Error('Неизвестное поле предложения')
}
const text = (value, max = 6000) => typeof value === 'string' && value.trim().length > 0 && value.length <= max
const id = value => text(value, 160)
const hash = value => /^[a-f0-9]{64}$/.test(value || '')
export const proposalDocument = proposal => Object.fromEntries(ROOT.map(key => [key, structuredClone(proposal[key])]))
const targetOf = state => state.nutrition?.targets?.find(t => t.id === 'default' && !t.deletedAt)
const cfgOf = (state, change) => state.routines?.find(r => r.id === change.routineId && !r.deletedAt)?.ex?.find(e => e.id === change.exerciseId)
const address = c => `${c.type}:${c.routineId || ''}:${c.exerciseId || ''}:${c.field}`

function checkChanges(changes, state) {
  if (!Array.isArray(changes) || changes.length > 100) throw new Error('Invalid changes')
  const ids = new Set(), addresses = new Set()
  for (const change of changes) {
    strict(change, CHANGE)
    if (!id(change.id) || ids.has(change.id) || addresses.has(address(change))) throw new Error('Повторяющийся ID или параметр изменения')
    ids.add(change.id); addresses.add(address(change))
    if (!text(change.reason, 2000) || !Array.isArray(change.evidence) || change.evidence.length < 1 || change.evidence.length > 20
      || change.evidence.some(e => !text(e, 300)) || typeof change.value !== 'number' || !Number.isFinite(change.value)) throw new Error('Нужны числовое значение, причина и основания')
    if (change.type === 'exercise') {
      const cfg = cfgOf(state, change)
      if (!cfg || modeOf(cfg) !== 'reps' || !['weight', 'sets', 'reps'].includes(change.field)) throw new Error('Неверное упражнение или параметр')
      const unit = change.field === 'weight' ? state.unit || 'kg' : change.field
      if (change.unit !== unit || change.value < (change.field === 'weight' ? 0 : 1)
        || change.value > (change.field === 'sets' ? 30 : change.field === 'weight' && unit === 'lb' ? 2205 : 1000)
        || change.field !== 'weight' && !Number.isInteger(change.value)
        || change.field === 'reps' && change.value % repStep(cfg) !== 0
        || change.field === 'reps' && cfg.repsMin > change.value) throw new Error('Неверное значение или единицы нагрузки')
    } else if (change.type === 'nutrition') {
      if (change.routineId !== undefined || change.exerciseId !== undefined || !NUTRIENT_KEYS.includes(change.field)
        || change.unit !== (change.field === 'kcal' ? 'kcal' : 'g') || change.value < (change.field === 'kcal' ? 1 : 0)
        || change.value > (change.field === 'kcal' ? 10000 : 1000)) throw new Error('Неверная цель питания')
    } else throw new Error('Неизвестный тип изменения')
  }
}

export function validateProposal(input, state, snapshot) {
  const doc = typeof input === 'string' ? JSON.parse(input.replace(/^\uFEFF/, '')) : structuredClone(input)
  strict(doc, ROOT)
  if (doc.format !== PROPOSAL_FORMAT || doc.formatVersion !== 1 || !id(doc.id) || !Number.isFinite(doc.generatedAt) || doc.generatedAt <= 0
    || doc.generatedAt > Date.now() + 300000 || !text(doc.title, 200) || !text(doc.summary) || !hash(doc.analysisHash) || !hash(doc.planHash)) throw new Error('Неверный формат недельного предложения')
  if (doc.profileId !== state.personalProfile?.id || snapshot?.profileId !== doc.profileId || snapshot?.payload?.profileId !== doc.profileId) throw new Error('Предложение для другого профиля')
  if (snapshot.checksum !== doc.analysisHash || fingerprint(snapshot.payload) !== doc.analysisHash || snapshot.payload.plan?.fingerprint !== doc.planHash) throw new Error('Предложение не соответствует исходному отчёту')
  strict(doc.window, ['from', 'to', 'contextFrom'])
  if (!validDate(doc.window.from) || !validDate(doc.window.to) || !validDate(doc.window.contextFrom) || doc.window.from > doc.window.to
    || canonicalJson(doc.window) !== canonicalJson(snapshot.payload.window)) throw new Error('Неверный период анализа')
  if (snapshot.payload.units?.weight !== (state.unit || 'kg')) throw new Error('Изменились единицы веса — нужен новый анализ')
  if (!Array.isArray(doc.limitations) || doc.limitations.length > 30 || doc.limitations.some(l => !text(l, 1000))
    || !Array.isArray(doc.changes) || doc.changes.length > 100) throw new Error('Неверный список изменений или ограничений')
  checkChanges(doc.changes, state)
  const old = state.weeklyReviews?.proposals?.find(p => p.id === doc.id)
  if (old && canonicalJson(proposalDocument(old)) !== canonicalJson(doc)) throw new Error('Этот ID уже принадлежит другому предложению')
  return doc
}

export function saveProposal(state, proposal, { now = Date.now(), author = { type: 'file' } } = {}) {
  const old = state.weeklyReviews.proposals.find(p => p.id === proposal.id)
  if (old) {
    if (canonicalJson(proposalDocument(old)) !== canonicalJson(proposalDocument(proposal))) throw new Error('Этот ID уже занят')
    return old
  }
  const record = { ...structuredClone(proposal), author: structuredClone(author), createdAt: now, updatedAt: now, deletedAt: null }
  state.weeklyReviews.proposals.push(record)
  return record
}
function selection(proposal, selectedIds) {
  if (!Array.isArray(selectedIds) || new Set(selectedIds).size !== selectedIds.length || selectedIds.some(id => !proposal.changes.some(c => c.id === id))) throw new Error('Неверный выбор изменений')
  return proposal.changes.filter(c => selectedIds.includes(c.id))
}
function conflictsOf(state, proposal) {
  const result = []
  if (state.personalProfile?.id !== proposal.profileId) result.push({ code: 'wrong_profile' })
  if (planFingerprint(state) !== proposal.planHash) result.push({ code: 'stale_plan' })
  if (state.active) result.push({ code: 'active_workout' })
  return result
}
const read = (state, c) => {
  const obj = c.type === 'exercise' ? cfgOf(state, c) : targetOf(state)
  return { present: obj != null && Object.hasOwn(obj, c.field), value: obj?.[c.field] ?? null }
}
function simulate(state, proposal, changes, now) {
  const after = structuredClone(state)
  const before = changes.map(c => ({ changeId: c.id, ...read(state, c) }))
  const priorOverrides = after.weeklyReviews.overrides.filter(o => !o.deletedAt && changes.some(c => c.type === 'exercise' && o.routineId === c.routineId && o.exerciseId === c.exerciseId))
  for (const change of changes) {
    if (change.type === 'exercise') cfgOf(after, change)[change.field] = change.value
    else {
      let target = targetOf(after)
      if (!target) {
        target = { id: 'default', ...Object.fromEntries(NUTRIENT_KEYS.map(key => [key, null])), createdAt: now, updatedAt: now, deletedAt: null }
        const old = after.nutrition.targets.findIndex(t => t.id === 'default')
        if (old < 0) after.nutrition.targets.push(target); else after.nutrition.targets[old] = target
      }
      target[change.field] = change.value; target.updatedAt = now
    }
  }
  for (const old of priorOverrides) {
    if (changes.some(c => address({ ...old, type: 'exercise' }) === address(c))) old.deletedAt = now
    else {
      const routine = after.routines.find(r => r.id === old.routineId)
      old.baseHash = exerciseFingerprint(cfgOf(after, old), routine, after.unit)
    }
    old.updatedAt = now
  }
  for (const c of changes.filter(c => c.type === 'exercise')) {
    const routine = after.routines.find(r => r.id === c.routineId)
    after.weeklyReviews.overrides.push({ id: `override:${proposal.id}:${c.id}`, reviewId: proposal.id,
      routineId: c.routineId, exerciseId: c.exerciseId, field: c.field, value: c.value, unit: c.unit,
      baseHash: exerciseFingerprint(cfgOf(after, c), routine, after.unit), appliedAt: now, createdAt: now, updatedAt: now, deletedAt: null })
  }
  return { after, before, priorOverrides: structuredClone(state.weeklyReviews.overrides.filter(o => priorOverrides.some(p => p.id === o.id))) }
}
export function previewProposal(state, proposal, selectedIds) {
  const changes = selection(proposal, selectedIds), conflicts = conflictsOf(state, proposal)
  if (conflicts.length) return { before: [], after: null, nextSessions: [], conflicts }
  const simulated = simulate(state, proposal, changes, Date.now())
  return { before: simulated.before, after: simulated.after,
    nextSessions: simulated.after.routines.filter(r => !r.deletedAt && changes.some(c => c.routineId === r.id))
      .map(r => ({ routineId: r.id, name: r.name, entries: buildSessionEntries(simulated.after, r) })), conflicts }
}
export function applyProposal(state, proposal, selectedIds, { now = Date.now() } = {}) {
  const old = state.weeklyReviews?.journal?.find(j => j.id === proposal.id)
  if (old) {
    if (!old.undoneAt && canonicalJson(old.selectedIds) === canonicalJson(selectedIds)) return structuredClone(state)
    throw new Error('Предложение уже было применено — сформируйте новое')
  }
  checkChanges(proposal.changes, state)
  const changes = selection(proposal, selectedIds)
  if (!changes.length) throw new Error('Выберите хотя бы одно изменение')
  const conflicts = conflictsOf(state, proposal)
  if (conflicts.length) throw new Error(conflicts.some(c => c.code === 'active_workout') ? 'Завершите текущую тренировку' : 'План изменился — нужен новый анализ')
  const { after, before, priorOverrides } = simulate(state, proposal, changes, now)
  const savedProposal = saveProposal(after, proposal, { now })
  after.weeklyReviews.journal.push({ ...proposalDocument(proposal), author: structuredClone(savedProposal.author), status: 'applied', appliedAt: now, undoneAt: null,
    selectedIds: [...selectedIds], before, priorOverrides, unit: state.unit || 'kg', targetExisted: !!targetOf(state),
    createdAt: now, updatedAt: now, deletedAt: null })
  return after
}
export function undoProposal(state, reviewId, { now = Date.now() } = {}) {
  const journal = state.weeklyReviews?.journal?.find(j => j.id === reviewId)
  if (!journal || journal.undoneAt) return { state: structuredClone(state), conflicts: [] }
  const changes = journal.changes.filter(c => journal.selectedIds.includes(c.id))
  const conflicts = changes.filter(c => read(state, c).value !== c.value || c.type === 'exercise' && c.field === 'weight' && journal.unit !== (state.unit || 'kg')
    || c.type === 'exercise' && state.weeklyReviews.overrides.some(o => !o.deletedAt && o.routineId === c.routineId && o.exerciseId === c.exerciseId && o.reviewId !== reviewId && o.appliedAt > journal.appliedAt))
    .map(c => ({ code: 'manual_edit', changeId: c.id }))
  if (state.active) conflicts.push({ code: 'active_workout' })
  if (conflicts.length) return { state: structuredClone(state), conflicts }
  const next = structuredClone(state)
  for (const c of changes) {
    const obj = c.type === 'exercise' ? cfgOf(next, c) : targetOf(next)
    const before = journal.before.find(b => b.changeId === c.id)
    if (before.present) obj[c.field] = before.value; else delete obj[c.field]
    if (c.type === 'nutrition') obj.updatedAt = now
  }
  if (!journal.targetExisted && targetOf(next) && NUTRIENT_KEYS.every(key => targetOf(next)[key] == null)) {
    targetOf(next).deletedAt = now; targetOf(next).updatedAt = now
  }
  for (const o of next.weeklyReviews.overrides.filter(o => o.reviewId === reviewId)) { o.deletedAt = now; o.updatedAt = now }
  for (const previous of journal.priorOverrides || []) {
    const index = next.weeklyReviews.overrides.findIndex(o => o.id === previous.id)
    if (index >= 0) next.weeklyReviews.overrides[index] = { ...previous, updatedAt: now, deletedAt: null }
  }
  const saved = next.weeklyReviews.journal.find(j => j.id === reviewId)
  saved.undoneAt = now; saved.updatedAt = now; saved.status = 'undone'
  return { state: next, conflicts: [] }
}
