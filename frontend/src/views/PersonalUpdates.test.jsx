// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocked = vi.hoisted(() => ({ state: null, nav: vi.fn(), check: vi.fn(), download: vi.fn(), install: vi.fn(), cancel: vi.fn(), setAutomatic: vi.fn() }))
vi.mock('react-router-dom', () => ({ useNavigate: () => mocked.nav }))
vi.mock('../lib/personal/use-updates.js', () => ({ useUpdates: () => mocked.state, personalUpdates: mocked }))
import PersonalUpdates from './PersonalUpdates.jsx'
import Creators from './Creators.jsx'
let root, host
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  mocked.state = { supported: true, automatic: true, installed: { versionName: '1.3.9-personal.2' }, release: { hasUpdate: true, versionName: '1.3.9-personal.3', bytes: 18000000, notes: 'Fresh features' }, total: 18000000, received: 9000000 }
  vi.clearAllMocks(); host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })
const button = text => [...host.querySelectorAll('button')].find(node => node.textContent.includes(text))
it('offers in-app download and displays real byte progress with an available cancel action', async () => {
  await act(async () => root.render(<PersonalUpdates />))
  act(() => button('Download and install').click()); expect(mocked.download).toHaveBeenCalledOnce()
  mocked.state.downloading = true; await act(async () => root.render(<PersonalUpdates />))
  expect(host.querySelector('[role=progressbar]').getAttribute('aria-valuenow')).toBe('50')
  act(() => button('Cancel download').click()); expect(mocked.cancel).toHaveBeenCalledOnce()
})
it('unknown-source permission keeps a continue installation action without another download', async () => {
  mocked.state.downloaded = true; mocked.state.needsPermission = true
  await act(async () => root.render(<PersonalUpdates />))
  expect(host.textContent).toContain('Allow RITM to install apps')
  act(() => button('Continue installation').click()); expect(mocked.install).toHaveBeenCalledOnce(); expect(mocked.download).not.toHaveBeenCalled()
})
it('an unsuccessful check never claims the installed version is latest', async () => {
  mocked.state.release = null; mocked.state.checkedAt = 1; mocked.state.error = 'Could not check for updates'
  await act(async () => root.render(<PersonalUpdates />))
  expect(host.textContent).not.toContain('Everything is up to date'); expect(host.querySelector('[role=alert]')).toBeTruthy()
})
it('credits preserve the source, openGym, full licenses and data attribution on their own screen', async () => {
  await act(async () => root.render(<Creators />))
  expect(host.textContent).toContain('Duarte Santos'); expect(host.textContent).toContain('FoodData Central')
  expect(host.textContent).toContain('GNU AFFERO GENERAL PUBLIC LICENSE')
  expect(host.querySelector('a[href="https://github.com/blizzardsnake/ritm"]')).toBeTruthy()
  act(() => host.querySelector('button[aria-label=Back]').click()); expect(mocked.nav).toHaveBeenCalledWith('/settings')
})
