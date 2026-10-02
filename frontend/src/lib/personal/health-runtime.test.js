import { expect, it, vi } from 'vitest'
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'android' }, registerPlugin: () => ({}) }))
import { migratePersonalState } from './state.js'
import { selectedHealthDaily } from './health.js'
import { syncPersonalHealth, preparePersonalExport } from './health-native.js'

function fixture({ failDisk = false, availability = 'available' } = {}) {
  let state = migratePersonalState({ nutrition: { meals: [{ id: 'existing-food' }] } }, { profileId: 'owner' })
  state.health.config.origins = ['mi']
  const queue = [], archive = []
  const snapshot = () => ({ schemaVersion: 1, generation: 'fixture-200', profileId: 'owner', generatedAt: 200,
    timezone: 'UTC', window: { from: '2026-10-01', to: '2026-10-02' }, origins: ['mi'],
    permissions: { steps: true }, completedMetrics: ['steps'], metricStatus: { steps: 'available' },
    daily: [{ date: '2026-10-02', steps: 3500 }], sleep: [], heartRate: [], activities: [] })
  const store = { getState: () => ({ S: state,
    updatePersonal: mutator => { const next = structuredClone(state); mutator(next); state = next },
    flushNativeMirror: async () => { if (failDisk) throw new Error('disk full') },
  }) }
  const native = {
    getStatus: async () => ({ availability, permissions: { steps: true, sleep: false }, sources: [{ packageName: 'mi', label: 'fixture source' }], backgroundSupported: true, backgroundGranted: false, historySupported: true, historyGranted: false }),
    readSnapshot: async ({ origins, profileId, days }) => {
      if (origins.join('|') !== 'mi' || profileId !== 'owner' || days !== 7) throw new Error('wrong Android read request')
      queue.push(snapshot())
    },
    readMailbox: async () => structuredClone(queue[0] || {}),
    ackMailbox: async ({ generation, archive: keep }) => {
      if (queue[0]?.generation === generation) { const record = queue.shift(); if (keep) archive.push(record) }
      return { acknowledged: true }
    },
    scheduleSync: async ({ enabled }) => { if (enabled) throw new Error('background permission was not granted'); return { backgroundScheduled: false } },
  }
  return { store, native, queue, archive, snapshot }
}
it('imports a source-filtered foreground snapshot and records permissions without enabling background reads', async () => {
  const f = fixture()
  await syncPersonalHealth(f.store, { native: f.native })
  expect(selectedHealthDaily(f.store.getState().S.health).at(-1).steps).toBe(3500)
  expect(f.store.getState().S.nutrition.meals[0].id).toBe('existing-food')
  expect(f.store.getState().S.health.status.permissions.sleep).toBe(false)
  expect(f.queue).toHaveLength(0)
})
it('exports only after native results are durably imported and keeps an unrelated food edit', async () => {
  const f = fixture()
  f.queue.push(f.snapshot())
  let first = true
  f.native.readMailbox = async () => {
    if (first) { first = false; f.store.getState().updatePersonal(state => state.nutrition.meals.push({ id: 'new-food' })) }
    return structuredClone(f.queue[0] || {})
  }
  const exported = await preparePersonalExport(f.store, { native: f.native })
  expect(exported.nutrition.meals.map(meal => meal.id)).toEqual(['existing-food', 'new-food'])
  expect(selectedHealthDaily(exported.health).at(-1).steps).toBe(3500)
  expect(f.queue).toHaveLength(0)
  const blocked = fixture({ failDisk: true }); blocked.queue.push(blocked.snapshot())
  await expect(preparePersonalExport(blocked.store, { native: blocked.native })).rejects.toThrow('disk full')
  expect(blocked.queue).toHaveLength(1)
})
it('preserves archived foreign-profile payloads instead of mixing them into the current profile', async () => {
  const f = fixture()
  f.queue.push({ ...f.snapshot(), profileId: 'previous-owner' })
  await preparePersonalExport(f.store, { native: f.native })
  expect(selectedHealthDaily(f.store.getState().S.health)).toHaveLength(0)
  expect(f.archive[0].profileId).toBe('previous-owner')
})
it('records provider unavailability while retaining measurements already in the history', async () => {
  const f = fixture({ availability: 'unavailable' })
  f.queue.push(f.snapshot())
  await syncPersonalHealth(f.store, { native: f.native })
  expect(f.store.getState().S.health.status.availability).toBe('unavailable')
  expect(selectedHealthDaily(f.store.getState().S.health).at(-1).steps).toBe(3500)
})
