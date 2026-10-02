// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import AppLockGate from './AppLockGate.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT = true

it('conceals the app after a failed password or cancelled biometric request and reveals it only after success', async () => {
  const host = document.createElement('div'), root = createRoot(host)
  document.body.append(host)
  let unlocked = false
  const service = {
    getStatus: async () => ({ enabled: true, unlocked, biometric: true, biometricAvailable: true }),
    unlock: vi.fn(async ({ password }) => { if (password !== 'fixture-password') throw new Error('Wrong password'); unlocked = true }),
    authenticate: vi.fn(async () => { throw new Error('Cancelled') }),
  }
  try {
    await act(async () => { root.render(<AppLockGate service={service}><div>private history</div></AppLockGate>) })
    expect(host.textContent).not.toContain('private history')
    const input = host.querySelector('input[type=password]')
    const change = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    await act(async () => { change.call(input, 'wrong'); input.dispatchEvent(new Event('input', { bubbles: true })); host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(host.textContent).not.toContain('private history')
    await act(async () => { host.querySelector('[data-biometric]').click() })
    expect(host.textContent).not.toContain('private history')
    await act(async () => { change.call(input, 'fixture-password'); input.dispatchEvent(new Event('input', { bubbles: true })); host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(host.textContent).toContain('private history')
  } finally { act(() => root.unmount()); host.remove() }
})
it('shows a recovery error without mounting private content when protection status cannot be read', async () => {
  const host = document.createElement('div'), root = createRoot(host)
  try {
    await act(async () => { root.render(<AppLockGate service={{ getStatus: async () => { throw new Error('Damaged settings') } }}><div>private history</div></AppLockGate>) })
    expect(host.textContent).toContain('Damaged settings')
    expect(host.textContent).not.toContain('private history')
  } finally { act(() => root.unmount()) }
})
it('fails closed on malformed bridge status, including retry', async () => {
  const host = document.createElement('div'), root = createRoot(host)
  const service = { getStatus: vi.fn(async () => ({})) }
  try {
    await act(async () => { root.render(<AppLockGate service={service}><div>private history</div></AppLockGate>) })
    expect(host.textContent).not.toContain('private history')
    expect(host.querySelector('[role=alert]')).not.toBeNull()
    await act(async () => { host.querySelector('button').click() })
    expect(service.getStatus).toHaveBeenCalledTimes(2)
    expect(host.textContent).not.toContain('private history')
    expect(host.querySelector('[role=alert]')).not.toBeNull()
  } finally { act(() => root.unmount()) }
})
