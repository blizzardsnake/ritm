import { describe, expect, it } from 'vitest'
import { migratePersonalState, mergePersonalState, personalHasData } from './state.js'

describe('personal profile lifecycle', () => {
  it('migrates old backups once without altering training history or the caller', () => {
    const legacy = { unit: 'kg', workouts: [{ id: 'w1', start: 42, entries: [] }] }
    const migrated = migratePersonalState(legacy, { now: 100, profileId: 'owner' })
    expect(migrated.workouts).toEqual([{ id: 'w1', start: 42, entries: [] }])
    expect(migrated.personalProfile.id).toBe('owner')
    expect(migratePersonalState(migrated, { now: 999, profileId: 'another' })).toEqual(migrated)
    expect(legacy).not.toHaveProperty('nutrition')
    expect(personalHasData(migrated)).toBe(false)
  })
  it('recognizes profiles containing only food or wearable records', () => {
    const state = migratePersonalState({}, { profileId: 'owner', now: 100 })
    state.nutrition.meals.push({ id: 'm1', items: [] })
    expect(personalHasData(state)).toBe(true)
    state.nutrition.meals = []
    state.health.daily.push({ id: 'd1', steps: 100 })
    expect(personalHasData(state)).toBe(true)
  })
  it('does not resurrect deleted food from an older backup and keeps unrelated records', () => {
    const local = migratePersonalState({}, { profileId: 'owner', now: 1 })
    const remote = structuredClone(local)
    local.nutrition.meals = [{ id: 'm1', createdAt: 2, updatedAt: 20, deletedAt: 20 }]
    remote.nutrition.meals = [{ id: 'm1', createdAt: 2, updatedAt: 10, name: 'old' }, { id: 'm2', createdAt: 3, updatedAt: 3, name: 'Lunch' }]
    const merged = mergePersonalState(local, remote)
    expect(merged.nutrition.meals).toEqual([
      { id: 'm1', createdAt: 2, updatedAt: 20, deletedAt: 20 },
      { id: 'm2', createdAt: 3, updatedAt: 3, name: 'Lunch' },
    ])
    expect(mergePersonalState(remote, local)).toEqual(merged)
    expect(remote.nutrition.meals[0].name).toBe('old')
  })
  it('prefers a tombstone in an exact timestamp conflict and retains it as user data', () => {
    const a = migratePersonalState({}, { profileId: 'owner', now: 1 })
    const b = structuredClone(a)
    a.nutrition.foods = [{ id: 'f1', updatedAt: 20, deletedAt: 20 }]
    b.nutrition.foods = [{ id: 'f1', updatedAt: 20, name: 'old' }]
    expect(mergePersonalState(a, b).nutrition.foods[0].deletedAt).toBe(20)
    expect(personalHasData(a)).toBe(true)
  })
  it('preserves personal sections when merging a legacy copy and keeps food grams independent of kg/lb', () => {
    const state = migratePersonalState({ unit: 'lb' }, { profileId: 'owner', now: 1 })
    state.nutrition.meals = [{ id: 'm1', updatedAt: 5, items: [{ grams: 37.5 }] }]
    expect(mergePersonalState(state, { unit: 'kg' }).nutrition.meals[0].items[0].grams).toBe(37.5)
    expect(mergePersonalState(state, {}).personalProfile.id).toBe('owner')
  })
})
