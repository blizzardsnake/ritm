// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../lib/api.js', () => ({ api: vi.fn(), setRemoteAuth: vi.fn() }))
vi.mock('./useUI.js', () => ({ useUI: { getState: () => ({ toast: vi.fn() }) } }))
import { DEF, hasData, restoredStateFor, useStore } from './useStore.js'
import { migratePersonalState } from '../lib/personal/state.js'
import { mergeStates, localExtras, resetIdsOf } from '../lib/sync-merge.js'
import { syncFingerprint, countChanges } from '../lib/sync-changes.js'
import { convertStateUnit } from '../lib/units.js'
import { api } from '../lib/api.js'

const meal = { id: 'm1', createdAt: 1, updatedAt: 2, date: '2026-10-02', items: [{ grams: 37.5, nutrients: { kcal: 75, protein: 1.5, fat: 0, carbs: null } }] }
const personal = () => migratePersonalState(DEF, { now: 1, profileId: 'owner' })
beforeEach(() => { api.mockReset(); localStorage.clear(); useStore.setState({ S: personal(), user: null, ready: false, config: { coach: null } }) })
afterEach(() => { localStorage.clear(); useStore.setState({ S: structuredClone(DEF), user: null, ready: false }) })

describe('personal data in original persistence and sync', () => {
  it('adopts food-only guest edits through the real sign-in flow while keeping the account report identity', async () => {
    const account = personal(); account.personalProfile.id = 'account-owner'; account.personalProfile.updatedAt = 10
    account.weeklyReviews.proposals = [{ id: 'account-proposal', profileId: 'account-owner' }]; account._ts = 10
    const guest = personal(); guest.personalProfile.id = 'newer-guest'; guest.personalProfile.updatedAt = 100; guest._ts = 100
    guest.nutrition.meals = [meal]
    useStore.setState({ S: guest })
    useStore.getState().setUser({ id: 'user', name: 'Owner' }, { adopt: true })
    api.mockResolvedValueOnce({ state: account, rev: 4 }).mockResolvedValueOnce({ state: account, rev: 4 }).mockResolvedValueOnce({ ok: true, rev: 5 })
    const ask = vi.fn(async () => true)
    expect(await useStore.getState().adoptProfile(ask)).toMatchObject({ adopted: true, added: true })
    expect(ask.mock.calls[0][0].personal).toBeGreaterThan(0)
    const saved = JSON.parse(localStorage.getItem('gym_state_v1'))
    expect(saved.personalProfile.id).toBe('account-owner')
    expect(saved.weeklyReviews.proposals[0].profileId).toBe(saved.personalProfile.id)
    expect(saved.nutrition.meals).toEqual([meal])
  })
  it('keeps the destination account identity when adopting a newer food-only guest and preserves both histories', () => {
    const account = personal(); account.personalProfile.id = 'account-owner'; account.personalProfile.updatedAt = 10
    account.weeklyReviews.proposals = [{ id: 'account-proposal', profileId: 'account-owner' }]
    const guest = personal(); guest.personalProfile.id = 'fresh-device'; guest.personalProfile.updatedAt = 100
    guest.nutrition.meals = [meal]; guest._ts = 100
    const adopted = mergeStates(account, guest, { prefer: 'a' })
    expect(adopted.personalProfile.id).toBe('account-owner')
    expect(adopted.weeklyReviews.proposals[0].profileId).toBe(adopted.personalProfile.id)
    expect(adopted.nutrition.meals).toEqual([meal])
    expect(mergeStates(guest, account, { prefer: 'b' }).personalProfile.id).toBe('account-owner')
  })
  it('protects a food-only local profile against an older remote replacement', () => {
    const local = personal()
    local.nutrition.meals = [meal]
    local._ts = 20
    expect(hasData(local)).toBe(true)
    expect(restoredStateFor(local, { ...DEF, _ts: 10 })).toBeNull()
    expect(localExtras(local, DEF).personal).toBe(1)
  })
  it('unions meals and honors tombstones even when the live backup has a newer global stamp', () => {
    const local = personal(), remote = personal()
    local.nutrition.meals = [{ ...meal, updatedAt: 20, deletedAt: 20 }]
    remote.nutrition.meals = [meal, { ...meal, id: 'm2' }]
    remote._ts = 999
    expect(mergeStates(local, remote).nutrition.meals).toHaveLength(2)
    expect(mergeStates(local, remote).nutrition.meals.find(item => item.id === 'm1').deletedAt).toBe(20)
  })
  it('persists food edits through the original save flow and counts unsynced changes', () => {
    const before = syncFingerprint(useStore.getState().S)
    useStore.getState().updatePersonal(state => { state.nutrition.meals.push(meal) })
    const saved = JSON.parse(localStorage.getItem('gym_state_v1'))
    expect(saved.nutrition.meals[0].items[0].grams).toBe(37.5)
    expect(saved.personalProfile.id).toBe('owner')
    expect(countChanges(saved, before)).toBeGreaterThan(0)
    useStore.getState().importBackup(saved)
    expect(useStore.getState().S.nutrition.meals[0]).toEqual(meal)
  })
  it('migrates a v1.3.9 backup without losing workout timestamps', () => {
    useStore.getState().importBackup({ unit: 'kg', workouts: [{ id: 'old', start: 123, end: 456, entries: [] }] })
    expect(useStore.getState().S.workouts[0]).toMatchObject({ start: 123, end: 456 })
    expect(useStore.getState().S.nutrition.meals).toEqual([])
    expect(useStore.getState().S.personalProfile.id).toBe('owner')
  })
  it('reset removes personal records and excludes them when an older device returns', async () => {
    const old = personal()
    old.nutrition.meals = [meal]
    old.health.daily = [{ id: 'day1', createdAt: 1, updatedAt: 2, steps: 100 }]
    useStore.setState({ S: old })
    expect(Object.values(resetIdsOf(old)).flat()).toContain('m1')
    await useStore.getState().resetEverything()
    const reset = useStore.getState().S
    expect(reset.personalProfile.id).toBe('owner')
    expect(reset.nutrition.meals).toEqual([])
    expect(mergeStates(reset, old).nutrition.meals).toEqual([])
    expect(mergeStates(reset, old).health.daily).toEqual([])
  })
  it('keeps meal grams and nutrients unchanged when switching barbell units', () => {
    const state = personal()
    state.nutrition.meals = [meal]
    expect(convertStateUnit(state, 'lb').nutrition).toEqual(state.nutrition)
  })
})
