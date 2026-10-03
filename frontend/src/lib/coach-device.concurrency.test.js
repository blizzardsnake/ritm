import {beforeEach,expect,it,vi} from 'vitest'
const file=vi.hoisted(()=>({value:null,fail:false}))
vi.mock('./mobile.js',()=>({readJsonFile:async()=>structuredClone(file.value),writeJsonFile:async(_name,value)=>{await Promise.resolve();if(file.fail){file.fail=false;throw new Error('disk unavailable')}file.value=structuredClone(value)}}))
import {loadCoachDevice,saveCoachDevice,_resetCoachDevice} from './coach-device.js'
beforeEach(()=>{_resetCoachDevice();file.value={mode:'byok',provider:'compatible',freeOnly:true,freeUsage:Array(49).fill(1000)};file.fail=false})
it('keeps a reserved request and a concurrently completed training proposal',async()=>{
  await loadCoachDevice()
  await Promise.all([saveCoachDevice({freeUsage:Array(50).fill(1000)}),saveCoachDevice({pending:{id:'completed-training'}})])
  expect(file.value.freeUsage).toHaveLength(50)
  expect(file.value.pending.id).toBe('completed-training')
  _resetCoachDevice(); expect((await loadCoachDevice()).freeUsage).toHaveLength(50)
})
it('a failed write does not publish phantom usage or prevent the next settings write',async()=>{
  await loadCoachDevice();file.fail=true
  await expect(saveCoachDevice({freeUsage:Array(50).fill(1000)})).rejects.toThrow('disk unavailable')
  await saveCoachDevice({pending:{id:'retry'}})
  expect(file.value.freeUsage).toHaveLength(49);expect(file.value.pending.id).toBe('retry')
})
it('migrates anonymous AI without reusing a legacy key or changing an explicit server',async()=>{
  file.value={mode:'byok',provider:'pollinations'}
  expect(await loadCoachDevice()).toMatchObject({provider:'compatible',requiresOpenRouterAuth:true})
  _resetCoachDevice();file.value={mode:'server',provider:'pollinations'}
  expect(await loadCoachDevice()).toMatchObject({mode:'server',provider:'pollinations'})
})
