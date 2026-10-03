// Mobile build only: how the Coach runs on this phone, and the little it keeps between runs.
//
// Deliberately NOT part of S. S is the training log — it syncs to a paired server, travels in
// the JSON export, and is what "back up your data" means. Which provider this phone talks to,
// the pseudonym it uses, today's run count and a proposal waiting to be looked at are device
// facts, so they live in their own file next to the remote-pairing one. The API key itself is
// not even here: see coach-secrets.js.
//
// This module is intentionally light. The setup screen imports it before the user has chosen
// anything, and the promise there is that nothing AI-shaped loads until they do.
import { readJsonFile, writeJsonFile } from './mobile.js'
import { OPENROUTER_FREE_SETTINGS } from '../../../api/coach/core/providers.js'

const FILE = 'opengym-coach.json'

export const COACH_MODES = ['off', 'server', 'byok']

const DEFAULTS = { mode: 'off', provider: null, model: null, baseUrl: null, handle: null, daily: null, pending: null }

let cache = null
let writes = Promise.resolve()
export async function loadCoachDevice() {
  if (cache) return cache
  const saved = await readJsonFile(FILE)
  cache = { ...DEFAULTS, ...(saved && typeof saved === 'object' ? saved : {}) }
  // A new/unconfigured personal installation selects the official free provider.
  // An explicit Off selection made in this edition is retained across future updates.
  if (!saved || saved.mode === 'off' && !saved.provider && saved.builtinChoice !== false) Object.assign(cache, {mode:'byok', ...OPENROUTER_FREE_SETTINGS, requiresOpenRouterAuth: true})
  if (saved?.provider === 'pollinations' && saved.mode === 'byok') Object.assign(cache, {mode:'byok', ...OPENROUTER_FREE_SETTINGS, requiresOpenRouterAuth: true})
  if (!COACH_MODES.includes(cache.mode)) cache.mode = 'off'
  return cache
}
export function saveCoachDevice(patch) {
  const operation = writes.then(async () => {
    const next = { ...(await loadCoachDevice()), ...patch, ...(patch.mode === 'off' ? { builtinChoice: false } : {}) }
    await writeJsonFile(FILE, next)
    cache = next
    return next
  })
  writes = operation.catch(() => {})
  return operation
}
/** The part of it a UI may show: never the pending proposal, never the handle. */
export const coachDeviceSettings = d => d ? { mode: d.mode, provider: d.provider, model: d.model, baseUrl: d.baseUrl, ...(d.freeOnly === true ? { freeOnly: true } : {}), ...(d.requiresOpenRouterAuth ? { requiresOpenRouterAuth: true } : {}) } : null

// Test seam.
export function _resetCoachDevice() { cache = null; writes = Promise.resolve() }
