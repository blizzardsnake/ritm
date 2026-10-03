// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import Assistant from './Assistant.jsx'
import { DEF, useStore } from '../store/useStore.js'
import { getApiKey } from '../lib/coach-secrets.js'
import { localModels } from '../lib/coach-local.js'

const nav = vi.fn()
vi.mock('react-router-dom', () => ({ useNavigate: () => nav }))
vi.mock('../lib/mobile.js', async importOriginal => ({ ...await importOriginal(), MOBILE: true }))
vi.mock('../lib/coach-secrets.js', () => ({ getApiKey: vi.fn(), setApiKey: vi.fn(), clearApiKey: vi.fn() }))
vi.mock('../lib/coach-local.js', () => ({ localModels: vi.fn(), localForget: vi.fn() }))

let host, root, original
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  original = useStore.getState()
  useStore.setState({ S: structuredClone(DEF), user: null, config: null, coachLocal: { mode: 'off' } })
  getApiKey.mockReset().mockResolvedValue(null)
  localModels.mockClear(); nav.mockClear()
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); useStore.setState(original) })
const mount = () => act(async () => root.render(<Assistant />))
const button = text => [...host.querySelectorAll('button')].find(b => b.textContent.includes(text))
const configured = () => useStore.setState({ coachLocal: { mode: 'byok', provider: 'compatible', baseUrl: 'https://openrouter.ai/api', freeOnly: true, model: 'openrouter/free' } })

it('is usable from first launch, opens free setup and lets the owner preview a combined report without an AI key', async () => {
  await mount()
  expect(host.textContent).toContain('Connect free AI once')
  expect(host.querySelector('input[type=password]')).toBeTruthy()
  expect(localModels).not.toHaveBeenCalled()
  expect(button('Start a conversation')).toBeUndefined()
  act(() => button('Review my week').click())
  expect(nav).toHaveBeenCalledWith('/analysis')
  act(() => button('Connect Mi Fitness data').click())
  expect(nav).toHaveBeenLastCalledWith('/health')
})
it('resumes the existing training conversation only when the configured phone has a key', async () => {
  configured(); getApiKey.mockResolvedValue('fixture-key-not-a-real-secret')
  await mount()
  expect(host.textContent).toContain('Connected · ready when you are')
  expect(host.textContent).not.toContain('fixture-key-not-a-real-secret')
  expect(host.querySelector('input[type=password]')).toBeNull()
  act(() => button('Start a conversation').click())
  expect(nav).toHaveBeenCalledWith('/coach')
  expect(localModels).not.toHaveBeenCalled()
})
it('offers reconnection after a lost key instead of claiming the assistant is ready', async () => {
  configured(); await mount()
  expect(host.textContent).not.toContain('Connected · ready when you are')
  expect(host.querySelector('input[type=password]')).toBeTruthy()
  expect(nav).not.toHaveBeenCalled()
})
it('waits for secure storage on a cold open instead of flashing setup or sending a request', async () => {
  configured()
  let resolveKey
  getApiKey.mockImplementation(() => new Promise(resolve => { resolveKey = resolve }))
  await mount()
  expect(host.querySelector('[role=status]').textContent).toBe('Checking connection…')
  expect(host.querySelector('input[type=password]')).toBeNull()
  await act(async () => resolveKey('fixture-key'))
  expect(button('Start a conversation')).toBeTruthy()
  expect(localModels).not.toHaveBeenCalled()
})
