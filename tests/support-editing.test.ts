import test from 'node:test'
import assert from 'node:assert/strict'
import { Worker } from 'node:worker_threads'
import { DEFAULT_SETTINGS, planDeck, validateSettings } from '../src/planner.ts'
import type { Member, Point, Settings } from '../src/planner.ts'
import { editableSupports, nearestSupport, memberPlacementDiagnostic } from '../src/supportEditing.ts'
import { placePrimary } from '../src/pedestalPlacement.ts'
import { supportCandidates, findSupportSuggestions } from '../src/supportSuggestions.ts'
import { installerPlan } from '../src/installerPlan.ts'
import { buildCsvReport } from '../src/csvExport.ts'
import { structureGeometry } from '../src/structureGeometry.ts'
import { materialEstimate } from '../src/materialEstimate.ts'
import { computeDeckPlanning } from '../src/planning.ts'
import { recommendFrames } from '../src/frameRecommendation.ts'

const fixture:Settings={...DEFAULT_SETTINGS,frame:'big',frameSelection:'manual',pedestalSelection:'manual',height:250,variation:0,joints:'butt'}
const dist=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y)
for(const frame of ['small','big','small-small','big-small'] as const)for(const direction of ['horizontal','vertical'] as const)test(`edited ${frame}/${direction} round-trips the actual solved frame and quantities`,()=>{
  const s={...fixture,frame,direction},p=planDeck(s),layout=editableSupports(p,s),input={...s,supportLayout:layout},edited=planDeck(input)
  assert.equal(edited.frame.geometryPass,true,edited.frame.issues.join('; '))
  assert.equal(edited.frame.manual,true);assert.deepEqual(edited.frame.members,p.frame.members);assert.deepEqual(edited.frame.pedestals,p.frame.pedestals)
  assert.deepEqual(edited.materials,p.materials);assert.deepEqual(edited.frameCuts,p.frameCuts)
  const saved=JSON.parse(JSON.stringify(input));assert.equal(validateSettings(saved),'');assert.deepEqual(planDeck(saved).frame.members,edited.frame.members)
  const drawing=installerPlan(edited,input);assert.equal(drawing.construction.manual,true);assert.equal(drawing.members.length,edited.frame.members.length)
  assert.equal(buildCsvReport('pedestals',edited,input,{}).rows.length,layout.pedestals.length)
  assert.equal(structureGeometry(edited,input,'joists',true).filter(p=>p.kind==='pedestal').length,layout.pedestals.length)
})
test('adding a real support changes actual quantities; removing it restores the original order',()=>{
  const p=planDeck(fixture),layout=editableSupports(p,fixture),member=layout.members.find(m=>m.kind==='joist'&&m.role===undefined&&dist(m.a,m.b)>1)!,point={x:member.a.x,y:(member.a.y+member.b.y)/2}
  const original=layout.pedestals.length,edited=planDeck({...fixture,supportLayout:{...layout,pedestals:[...layout.pedestals,point]}})
  assert.equal(edited.frame.geometryPass,true,edited.frame.issues.join('; '));assert.equal(edited.frame.pedestals.length,original+1)
  assert.equal(edited.materials.find(m=>m.key==='pedestals')!.qty,p.materials.find(m=>m.key==='pedestals')!.qty+1)
  assert.equal(planDeck({...fixture,supportLayout:layout}).frame.pedestals.length,original)
})
test('moved stock-joint bases, floating feet, collisions and missing joists remain visible drafts and cannot produce an order',()=>{
  const source={...fixture,frameStock:1.2},p=planDeck(source),layout=editableSupports(p,source),splice=p.frame.splices[0],foot=layout.pedestals.findIndex(q=>dist(q,splice)<1e-5)
  assert.ok(foot>=0)
  const cases=[
    {...layout,pedestals:layout.pedestals.filter((_,i)=>i!==foot)},
    {...layout,pedestals:[...layout.pedestals,{x:2.123,y:1.234}]},
    {...layout,pedestals:[...layout.pedestals,layout.pedestals[0]]},
    {...layout,members:[]},
  ]
  for(const supportLayout of cases){const s={...source,supportLayout},edited=planDeck(s)
    assert.equal(edited.frame.geometryPass,false);assert.equal(edited.frame.members.length,0);assert.ok(edited.frame.diagnostic.members.length||!supportLayout.members.length)
    assert.ok(buildCsvReport('frame',edited,s,{}).unavailable);assert.ok(materialEstimate(edited,{}).lines.some(l=>l.pending))
  }
  const moved=planDeck({...source,supportLayout:{...layout,pedestals:layout.pedestals.map((q,i)=>i===foot?{x:q.x,y:q.y+.08}:q)}})
  assert.equal(moved.frame.geometryPass,false);assert.ok(moved.frame.conflicts.some(q=>dist(q,splice)<1e-5),'The unsupported stock joint is marked at its actual location')
})
test('edited frame profiles, fascia recess and same-level crossings are enforced',()=>{
  const p=planDeck(fixture),layout=editableSupports(p,fixture)
  const additions:Member[]=[
    {a:{x:-.2,y:.5},b:{x:1,y:.5},kind:'joist',size:80},
    {a:{x:.001,y:.5},b:{x:.001,y:1},kind:'joist',size:80},
    {a:{x:1,y:.5},b:{x:1,y:1},kind:'bearer',size:35},
    {a:{x:.2,y:1},b:{x:1.8,y:1},kind:'noggin',size:80},
  ]
  for(const member of additions){const edited=planDeck({...fixture,supportLayout:{...layout,members:[...layout.members,member]}});assert.equal(edited.frame.geometryPass,false)}
  assert.equal(validateSettings({...fixture,supportLayout:{...layout,members:[{...layout.members[0],a:{x:NaN,y:0}}]}}),'The edited support layout contains invalid members or pedestal coordinates.')
})
test('placement failure records the actual member and its edge-clear and collision-free intervals',()=>{
  const p=[{x:0,y:0},{x:3,y:0},{x:3,y:2},{x:0,y:2}],member:Member={a:{x:.02,y:.2},b:{x:.02,y:1.8},kind:'joist',size:80},s={...fixture,polygon:p,pedestalDiameter:205,pedestalClearance:20}
  const failure=placePrimary([member],p,[],s,{support:1.9})
  assert.ok(failure.error);assert.equal(failure.placementDiagnostics[0].memberIndex,0);assert.deepEqual(failure.placementDiagnostics[0].member,member)
  assert.equal(failure.placementDiagnostics[0].reason,'boundary');assert.deepEqual(failure.placementDiagnostics[0].edgeClear,[])
  const legal={...member,a:{x:1,y:.02},b:{x:1,y:1.98}},diagnostic=memberPlacementDiagnostic(legal,5,p,[],s,[{x:1,y:1}])
  assert.equal(diagnostic.memberIndex,5);assert.ok(diagnostic.edgeClear.length);assert.equal(diagnostic.available.length,2)
  assert.ok(diagnostic.available[0][1]<.98&&diagnostic.available[1][0]>.98)
  const nearest=nearestSupport({x:1.08,y:.7},[legal])!;assert.ok(dist(nearest.point,{x:1,y:.7})<1e-8);assert.ok(Math.abs(nearest.distance-.08)<1e-6)
})
const impossible:Settings={...fixture,polygon:[{x:0,y:0},{x:4,y:0},{x:4,y:.8},{x:0,y:.8}],pedestalDiameter:600,pedestalClearance:300}
test('setting suggestions are tested complete fits and never change height, live load or supplier span/overhang limits',()=>{
  const before=JSON.stringify(impossible),failed=planDeck(impossible);assert.equal(failed.frame.geometryPass,false);assert.ok(failed.frame.placementDiagnostics.length)
  const proposals=findSupportSuggestions(impossible);assert.ok(proposals.some(p=>p.patch.pedestalClearance===0))
  for(const proposal of proposals){const next={...impossible,...proposal.patch},p=planDeck(next);assert.equal(p.frame.geometryPass,true);assert.equal(p.heightFits,true);assert.equal(next.height,impossible.height);assert.equal(next.load,impossible.load);assert.equal(next.joistOverhang35,impossible.joistOverhang35);assert.equal(next.joistOverhang80,impossible.joistOverhang80)}
  assert.equal(JSON.stringify(impossible),before,'Search is read-only')
  for(const candidate of supportCandidates({...impossible,joistOverhang35:0,joistOverhang80:0}))for(const field of ['height','load','joistOverhang35','joistOverhang80'] as const)assert.equal(candidate.patch[field],undefined)
})
test('opening an automatically adjusted joint layout for editing retains its actual board joints',()=>{
  const s={...impossible,pedestalClearance:0},p=planDeck(s),supportLayout=editableSupports(p,s),edited=planDeck({...s,supportLayout})
  assert.equal(p.frame.geometryPass,true);assert.equal(edited.frame.geometryPass,true,edited.frame.issues.join('; '))
  assert.deepEqual(edited.boards.pieces,p.boards.pieces)
  assert.deepEqual(edited.frame.members,p.frame.members)
  const imported=JSON.parse(JSON.stringify({...s,supportLayout}));assert.equal(validateSettings(imported),'');assert.deepEqual(planDeck(imported).boards.pieces,p.boards.pieces)
})
test('automatic recommendation preserves current manual edits while alternative frame cards compare regenerated layouts',()=>{
  const p=planDeck(fixture),s={...fixture,supportLayout:editableSupports(p,fixture)},result=computeDeckPlanning(s,{})
  assert.equal(result.plan!.frame.manual,true);assert.deepEqual(result.plan!.frame.members,p.frame.members)
  const options=recommendFrames(s).options
  assert.ok(options.find(o=>o.frame==='big-small')?.choice)
  assert.equal(options.find(o=>o.frame==='big-small')!.choice!.settings.supportLayout,undefined)
  assert.ok(options.find(o=>o.frame==='big')!.choice!.settings.supportLayout)
})
test('the real support-tools worker validates edited geometry and returns tested setting options',async()=>{
  const source=new URL('../src/supportTools.worker.ts',import.meta.url).href,bridge=`const {parentPort}=require('node:worker_threads');globalThis.self={onmessage:null,postMessage:data=>parentPort.postMessage(data)};parentPort.on('message',data=>self.onmessage({data}));import(${JSON.stringify(source)}).then(()=>parentPort.postMessage({ready:true}));`,worker=new Worker(bridge,{eval:true,execArgv:['--experimental-strip-types']})
  try{
    const answer=await new Promise<{suggestions:unknown[]}>((resolve,reject)=>{worker.on('error',reject);worker.on('message',data=>{if(data.ready)worker.postMessage({key:'fit',kind:'suggestions',settings:impossible});else if(data.suggestions)resolve(data)})})
    assert.ok(answer.suggestions.length)
    const p=planDeck(fixture),layout=editableSupports(p,fixture)
    const audited=await new Promise<{frame:PlanFrame}>((resolve,reject)=>{worker.once('error',reject);worker.once('message',resolve);worker.postMessage({key:'manual',kind:'audit',settings:{...fixture,supportLayout:layout}})})
    assert.equal(audited.frame.geometryPass,true);assert.deepEqual(audited.frame.members,p.frame.members)
  }finally{await worker.terminate()}
})
type PlanFrame=ReturnType<typeof planDeck>['frame']
