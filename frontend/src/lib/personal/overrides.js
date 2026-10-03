import { exerciseFingerprint } from './plan.js'
import { isWarmupRow } from '../workout-model.js'

// Pending until this particular prescription is actually performed. Opening or
// cancelling a workout does not consume it; completed history proves consumption.
export function pendingExerciseOverrides(state, cfg, routine) {
  const at = state.personalSessionAt ?? state.active?.start ?? Date.now()
  const key = exerciseFingerprint(cfg, routine, state.unit)
  const consumed = new Set((state.workouts || []).filter(w => !w.deletedAt).flatMap(w => (w.entries || [])
    .filter(e => e.sets?.some(row => row.done && !isWarmupRow(row)))
    .flatMap(e => e.personalOverrideIds || [])))
  return (state.weeklyReviews?.overrides || []).filter(o => !o.deletedAt && o.routineId === routine?.id && o.exerciseId === cfg.id
    && o.unit === (o.field === 'weight' ? state.unit || 'kg' : o.field) && o.baseHash === key && o.appliedAt <= at
    && !consumed.has(o.id) && ['weight', 'sets', 'reps'].includes(o.field) && Number.isFinite(o.value))
}
