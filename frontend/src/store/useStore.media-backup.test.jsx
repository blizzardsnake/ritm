// @vitest-environment happy-dom

/* QA, v1.3.9: the phone's auto-backup is written when a workout is finished — before the finish
   screen offers to add its photos and videos, so the day's backup never had them. A change to a
   workout's media now writes it again, once for a batch picked together. */
import { afterEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  vi.stubEnv('VITE_MOBILE', '1')
  return { files: new Map(), queue: [] }
})
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Data: 'DATA', Documents: 'DOCUMENTS', Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: {
    readFile: async ({ path, directory }) => {
      const k = directory + '/' + path
      if (!h.files.has(k)) throw new Error('File does not exist')
      return { data: h.files.get(k) }
    },
    writeFile: async ({ path, directory, data }) => { h.files.set(directory + '/' + path, data); return { uri: 'file://' + path } },
    readdir: async () => ({ files: [] }),
    deleteFile: async () => {},
    rename: async ({ from, to, directory, toDirectory }) => { const source = directory + '/' + from; h.files.set((toDirectory || directory) + '/' + to, h.files.get(source)); h.files.delete(source) },
  },
}))
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: { cancel: async () => {}, checkPermissions: async () => ({ display: 'granted' }), requestPermissions: async () => ({ display: 'granted' }), schedule: async () => {} },
}))
vi.mock('@capacitor/app', () => ({ App: { addListener: () => ({ remove() {} }) } }))
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: name => name === 'PersonalHealth' ? {
  readMailbox: async () => structuredClone(h.queue[0] || {}),
  ackMailbox: async ({ generation }) => { if (h.queue[0]?.generation === generation) h.queue.shift(); return { acknowledged: true } },
} : {} }))
vi.mock('./useUI.js', () => ({ useUI: { getState: () => ({ toast: () => {} }) } }))

import { DEF, useStore } from './useStore.js'
import { addWorkoutMedia, removeWorkoutMedia } from '../lib/workout-media.js'
import { migratePersonalState } from '../lib/personal/state.js'

const clone = v => JSON.parse(JSON.stringify(v))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const W = { id: 'w1', d: '2026-09-27', start: 1, end: 2, entries: [] }
const ref = c => ({ kind: 'image', hash: c.repeat(64), mime: 'image/webp', size: 3, width: 8, height: 6, at: 1 })
const backups = () => [...h.files].filter(([k]) => k.startsWith('DOCUMENTS/')).map(([, v]) => JSON.parse(v))

afterEach(() => { h.files.clear(); h.queue.length = 0; useStore.setState({ S: clone(DEF), user: null, ready: false }) })

describe('auto-backup and a workout\'s photos and videos', () => {
  it('includes durably imported pending watch data before writing an automatic backup', async () => {
    const S = migratePersonalState(clone(DEF), { profileId: 'owner' }); S.autoBackup = true; S.health.config.origins = ['mi']
    useStore.setState({ S, user: null, ready: true })
    h.queue.push({ schemaVersion: 1, generation: 'pending-1', profileId: S.personalProfile.id, generatedAt: 100,
      timezone: 'UTC', origins: ['mi'], window: { from: '2026-10-02', to: '2026-10-02' }, permissions: { steps: true }, completedMetrics: ['steps'],
      metricStatus: { steps: 'available' }, daily: [{ date: '2026-10-02', steps: 3500 }] })
    await useStore.getState().autoBackupNow()
    expect(backups()[0].health.daily[0].steps).toBe(3500)
    expect(h.queue).toHaveLength(0)
  })
  it('a photo added after finishing is in the day\'s backup, one write for two picked together', async () => {
    useStore.setState({ S: { ...clone(DEF), autoBackup: true, workouts: [clone(W)] }, ready: true })
    useStore.getState().update(s => { addWorkoutMedia(s, W, ref('a')) })
    useStore.getState().update(s => { addWorkoutMedia(s, W, ref('b')) })
    await sleep(2300)
    const all = backups()
    expect(all).toHaveLength(1)
    expect(all[0].workouts[0].media.map(m => m.hash)).toEqual(['a'.repeat(64), 'b'.repeat(64)])

  })

  // Review of 771184c9: a removal wrote the day's backup over the copy that still had the photo.
  it('taking a photo off, or deleting the workout, leaves the day\'s backup as it was', async () => {
    useStore.setState({ S: { ...clone(DEF), autoBackup: true, workouts: [{ ...clone(W), media: [ref('a'), ref('b')] }] }, ready: true })
    useStore.getState().update(s => { removeWorkoutMedia(s, W, 'a'.repeat(64)) })
    useStore.getState().update(s => { s.workouts = [] })
    await sleep(2300)
    expect(backups()).toHaveLength(0)
  })

  it('nothing written for other changes, or with the setting off', async () => {
    useStore.setState({ S: { ...clone(DEF), autoBackup: true, workouts: [clone(W)] }, ready: true })
    useStore.getState().update(s => { s.restSec = 60 })
    useStore.setState({ S: { ...clone(DEF), autoBackup: false, workouts: [clone(W)] } })
    useStore.getState().update(s => { addWorkoutMedia(s, W, ref('a')) })
    await sleep(2300)
    expect(backups()).toHaveLength(0)
  })
})
