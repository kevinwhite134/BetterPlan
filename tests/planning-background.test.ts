import test from 'node:test'
import assert from 'node:assert/strict'
import { Worker } from 'node:worker_threads'
import { DEFAULT_SETTINGS } from '../src/planner.ts'
import { computeDeckPlanning, needsBackgroundPlanning, pendingRecommendation } from '../src/planning.ts'
import type { PlanningReply } from '../src/planning.ts'

test('background planning is reserved for large jobs, while small and shape-only inputs remain light',()=>{
  assert.equal(needsBackgroundPlanning(DEFAULT_SETTINGS),false)
  assert.equal(needsBackgroundPlanning({...DEFAULT_SETTINGS,polygon:[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}]}),true)
  assert.equal(pendingRecommendation({...DEFAULT_SETTINGS,selectionObjective:'spread'}).objective,'spread')
  assert.deepEqual(pendingRecommendation(DEFAULT_SETTINGS).options,[])
})

test('the combined planning result uses one support comparison and preserves customer inputs',()=>{
  const input={...DEFAULT_SETTINGS,height:80,variation:0},result=computeDeckPlanning(input,{})
  assert.equal(result.error,'');assert.ok(result.plan?.frame.geometryPass);assert.equal(result.plan?.heightFits,true)
  assert.equal(result.settings.height,input.height);assert.equal(result.settings.variation,input.variation)
  assert.equal(result.recommendation?.selected?.frame,result.settings.frame)
  const invalid=computeDeckPlanning({...input,polygon:[{x:0,y:0},{x:101,y:0},{x:101,y:5},{x:0,y:5}]},{})
  assert.equal(invalid.plan,null);assert.match(invalid.error,/100 m/)
  assert.equal(invalid.settings.polygon[1].x,101)
})

test('the real worker calculates a complete 100 by 100 m plan without blocking its caller', {timeout:120000}, async()=>{
  const source=new URL('../src/planning.worker.ts',import.meta.url).href
  const bridge=`const {parentPort}=require('node:worker_threads');globalThis.self={onmessage:null,postMessage:data=>parentPort.postMessage(data)};parentPort.on('message',data=>self.onmessage({data}));import(${JSON.stringify(source)}).then(()=>parentPort.postMessage({ready:true}));`
  const worker=new Worker(bridge,{eval:true,execArgv:['--experimental-strip-types']})
  let ticks=0
  const timer=setInterval(()=>ticks++,10)
  try{
    const result=await new Promise<PlanningReply>((resolve,reject)=>{
      worker.on('error',reject)
      worker.on('message',data=>{
        if(data.ready){worker.postMessage({key:'large-job',settings:{...DEFAULT_SETTINGS,polygon:[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}],frameLayout:'continuous',frame:'big',frameSelection:'manual',pedestalSelection:'manual',pedestalName:'VersiJack F4 Pedestal',pedestalMin:117,pedestalMax:201,pedestalDiameter:205},prices:{}})}
        else resolve(data)
      })
    })
    assert.equal(result.key,'large-job');assert.equal(result.result.error,'')
    const plan=result.result.plan!
    assert.equal(plan.area,10000);assert.equal(plan.frame.geometryPass,true,plan.frame.issues.join('\n'))
    assert.ok(plan.boards.pieces.length>19000);assert.ok(plan.frame.pedestals.length>10000)
    assert.ok(ticks>2,'The caller remains responsive during calculation')
  }finally{clearInterval(timer);await worker.terminate()}
})
