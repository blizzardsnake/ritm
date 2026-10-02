import { expect, it } from 'vitest'
import { buildAnalysis } from './report.js'
import { migratePersonalState } from './state.js'
import { createExchangeSnapshot, verifyExchangeSnapshot, writeSnapshotAtomic } from './exchange.js'
const report = () => buildAnalysis(migratePersonalState({ unit: 'kg', workouts: [], bodyweight: [], routines: [] }, { now: 100, profileId: 'owner' }), { from: '2026-10-02', to: '2026-10-02', now: Date.parse('2026-10-02T12:00:00Z') })
it('verifies JSON round trip and refuses corruption, incomplete transfer, wrong profile and altered watermark', async () => {
  const snapshot = await createExchangeSnapshot(report())
  expect(await verifyExchangeSnapshot(JSON.stringify(snapshot), { profileId: 'owner' })).toEqual(snapshot.payload)
  const corrupt = structuredClone(snapshot); corrupt.payload.units.weight = 'lb'
  await expect(verifyExchangeSnapshot(corrupt)).rejects.toThrow(/checksum/i)
  await expect(verifyExchangeSnapshot(JSON.stringify(snapshot).slice(0, -5))).rejects.toThrow()
  await expect(verifyExchangeSnapshot(snapshot, { profileId: 'stranger' })).rejects.toThrow(/profile/i)
  const watermark = structuredClone(snapshot); watermark.watermark++
  await expect(verifyExchangeSnapshot(watermark)).rejects.toThrow(/watermark/i)
})
it('failed writes/rename leave the previous good exchange intact; successful publication uses one rename', async () => {
  const files = new Map([['analysis.json', 'previous']])
  const io = { write: async (path, text) => files.set(path, text), read: async path => files.get(path),
    rename: async () => { throw new Error('interrupted') }, remove: async path => files.delete(path) }
  const snapshot = await createExchangeSnapshot(report())
  await expect(writeSnapshotAtomic(snapshot, { io, path: 'analysis.json' })).rejects.toThrow('interrupted')
  expect(files.get('analysis.json')).toBe('previous')
  expect(files.size).toBe(1)
  io.rename = async (from, to) => { files.set(to, files.get(from)); files.delete(from) }
  await writeSnapshotAtomic(snapshot, { io, path: 'analysis.json' })
  expect(await verifyExchangeSnapshot(files.get('analysis.json'))).toEqual(snapshot.payload)
  expect(files.size).toBe(1)
})
