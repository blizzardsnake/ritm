export function stampSetCompletion(set, { side, editing = false, now = Date.now() } = {}) {
  const result = structuredClone(set)
  const row = side ? result.sides?.[side] : result
  if (!row) return result
  if (editing) row.modifiedAt = now
  else if (row.done) row.completedAt = now
  else delete row.completedAt
  if (side && !editing) {
    const times = [result.sides.L.completedAt, result.sides.R.completedAt]
    if (result.done && times.every(Number.isFinite)) result.completedAt = Math.max(...times)
    else delete result.completedAt
  }
  return result
}
