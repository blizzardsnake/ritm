import { expect, it, vi } from 'vitest'
import { nativeSave } from './mobile.js'
const fs = vi.hoisted(() => ({ writeFile: vi.fn(), readFile: vi.fn(), rename: vi.fn(), deleteFile: vi.fn() }))
vi.mock('@capacitor/filesystem', () => ({ Filesystem: fs, Directory: { Data: 'DATA' }, Encoding: { UTF8: 'utf8' } }))
it('strict native health persistence refuses failed writes/readback and never replaces the old mirror', async () => {
  fs.deleteFile.mockResolvedValue({})
  fs.writeFile.mockRejectedValueOnce(new Error('disk full'))
  await expect(nativeSave({ health: { daily: [] } }, { strict: true })).rejects.toThrow('disk full')
  expect(fs.rename).not.toHaveBeenCalled()
  fs.writeFile.mockResolvedValue({}); fs.readFile.mockResolvedValue({ data: 'partial' })
  await expect(nativeSave({ health: { daily: [] } }, { strict: true })).rejects.toThrow(/readback/i)
  expect(fs.rename).not.toHaveBeenCalled()
  fs.readFile.mockResolvedValue({ data: JSON.stringify({ health: { daily: [] } }) })
  await nativeSave({ health: { daily: [] } }, { strict: true })
  expect(fs.rename).toHaveBeenCalledOnce()
})
