// A real stdio handshake and tool call using disposable data, no network.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { migratePersonalState } from '../../frontend/src/lib/personal/state.js'
import { buildAnalysis } from '../../frontend/src/lib/personal/report.js'
import { createExchangeSnapshot } from '../../frontend/src/lib/personal/exchange.js'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ritm-stdio-test-'))
const file = path.join(dir, 'analysis.json')
const day = new Date().toISOString().slice(0, 10)
const snapshot = await createExchangeSnapshot(buildAnalysis(migratePersonalState({ workouts: [], routines: [], unit: 'kg' }, { profileId: 'stdio-fixture' }), { from: day, to: day }))
fs.writeFileSync(file, JSON.stringify(snapshot))
const client = new Client({ name: 'ritm-test', version: '1.0.0' })
const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../src/index.js', import.meta.url))],
  env: { ...process.env, OPENGYM_ANALYSIS_FILE: file, OPENGYM_PROFILE_ID: 'stdio-fixture', OPENGYM_DATA: path.join(dir, 'no-db') }, stderr: 'pipe' })
try {
  await client.connect(transport)
  const listed = await client.listTools()
  assert.equal(listed.tools.length, 13)
  const reply = await client.callTool({ name: 'get_personal_report', arguments: { profile_id: 'stdio-fixture' } })
  assert.ok(!reply.isError); assert.deepEqual(JSON.parse(reply.content[0].text).report, snapshot.payload)
  const foreign = await client.callTool({ name: 'get_record_quality', arguments: { profile_id: 'foreign' } })
  assert.equal(foreign.isError, true); assert.match(foreign.content[0].text, /WRONG_PROFILE/)
  fs.writeFileSync(file, '{')
  const broken = await client.callTool({ name: 'get_personal_report', arguments: {} })
  assert.equal(broken.isError, true)
  console.log('PASS: real stdio handshake, 13 tools, exact report, foreign and corrupt file rejected; fixture only.')
} finally { await client.close(); fs.rmSync(dir, { recursive: true, force: true }) }
