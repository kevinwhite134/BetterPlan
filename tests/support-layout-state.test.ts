import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { DEFAULT_SETTINGS, planDeck } from '../src/planner.ts'
import type { Settings } from '../src/planner.ts'
import { editableSupports } from '../src/supportEditing.ts'
import { supportLayoutIsCurrent, supportOutlineKey } from '../src/supportLayoutState.ts'
import { installerPlan } from '../src/installerPlan.ts'
import { computeDeckPlanning } from '../src/planning.ts'

const original:Settings={...DEFAULT_SETTINGS,frame:'big',frameSelection:'manual',pedestalSelection:'manual',height:250,variation:0,joints:'butt',pedestalDiameter:205}
const outline=[[0,4.8],[4.2,0],[7.5,2.3],[5.3,4.2],[6.85,7.3],[2.2,7.3]].map(([x,y])=>({x,y}))
test('a changed outline regenerates real supports while preserving the earlier manual layout',()=>{
  const first=planDeck(original),supportLayout=editableSupports(first,original),s={...original,polygon:outline,supportLayout},before=JSON.stringify(s),p=planDeck(s),automatic=planDeck({...s,supportLayout:undefined})
  assert.equal(supportLayoutIsCurrent(s),false);assert.equal(p.frame.geometryPass,true,p.frame.issues.join('; '));assert.equal(p.frame.manual,false)
  assert.deepEqual(p.frame.members,automatic.frame.members);assert.deepEqual(p.frame.pedestals,automatic.frame.pedestals);assert.deepEqual(p.materials,automatic.materials)
  assert.notDeepEqual(p.frame.members,first.frame.members)
  assert.equal(installerPlan(p,s).construction.manual,false)
  assert.equal(JSON.stringify(s),before,'Inactive edits are kept, not overwritten or scheduled as part of the changed shape')
  const fresh=editableSupports(p,s);assert.notDeepEqual(fresh.members,supportLayout.members);assert.equal(fresh.outlineKey,supportOutlineKey(s))
  assert.equal(planDeck({...s,supportLayout:fresh}).frame.geometryPass,true)
  assert.equal(planDeck({...original,supportLayout}).frame.manual,true,'Returning to the original outline restores its edits')
})
test('legacy saved source outlines prevent stale framing after an outline or opening changes',()=>{
  const p=planDeck(original),layout=editableSupports(p,original),legacy={...layout,outlineKey:undefined}
  assert.equal(supportLayoutIsCurrent({...original,supportLayout:legacy}),true)
  assert.equal(supportLayoutIsCurrent({...original,polygon:outline,supportLayout:legacy}),false)
  const s={...original,supportLayout:layout,cutouts:[{id:'new',name:'Opening',shape:'rectangle' as const,polygon:[{x:1,y:1},{x:2,y:1},{x:2,y:2},{x:1,y:2}]}]},changed=planDeck(s)
  assert.equal(changed.frame.geometryPass,true,changed.frame.issues.join('; '));assert.equal(changed.frame.manual,false)
  const imported=JSON.parse(JSON.stringify({...original,polygon:outline,supportLayout:legacy}))
  assert.equal(planDeck(imported).frame.manual,false)
})
test('equivalent windings, starting corners, collinear splits and translated geometry keep edits active',()=>{
  const layout=editableSupports(planDeck(original),original),p=original.polygon,split=[p[0],{x:3,y:0},...p.slice(1)]
  for(const polygon of [[...p].reverse(),[...p.slice(2),...p.slice(0,2)],split,p.map(q=>({x:q.x+12,y:q.y-7}))]){
    const s={...original,polygon,supportLayout:layout}
    assert.equal(supportLayoutIsCurrent(s),true);assert.equal(planDeck(s).frame.manual,true)
  }
})
test('automatic selection and background entry points use the regenerated outline geometry',()=>{
  const layout=editableSupports(planDeck(original),original),s={...original,polygon:outline,supportLayout:layout},result=computeDeckPlanning(s,{})
  assert.equal(result.error,'');assert.equal(result.plan!.frame.geometryPass,true);assert.equal(result.plan!.frame.manual,false)
  assert.deepEqual(result.settings.supportLayout,layout)
  assert.deepEqual(result.plan!.frame.members,planDeck({...result.settings,supportLayout:undefined}).frame.members)
})
test('the 35 mm end limit cannot change an 80 mm-only frame; the applicable limit stays enforced',()=>{
  const fixture:Settings=JSON.parse(fs.readFileSync(new URL('./fixtures/irregular-opening-update.json',import.meta.url),'utf8'))
  const s={...fixture,frame:'big' as const},baseline=planDeck(s),irrelevant=planDeck({...s,joistOverhang35:0})
  assert.equal(baseline.frame.geometryPass,true,baseline.frame.issues.join('; '));assert.equal(irrelevant.frame.geometryPass,true,irrelevant.frame.issues.join('; '))
  assert.deepEqual(irrelevant.frame.members,baseline.frame.members);assert.deepEqual(irrelevant.frame.pedestals,baseline.frame.pedestals)
  assert.ok(irrelevant.frame.members.every(m=>m.size===80))
  const blocked=planDeck({...s,joistOverhang80:0})
  assert.equal(blocked.frame.geometryPass,false);assert.equal(blocked.frame.members.length,0);assert.ok(blocked.frame.diagnostic.members.length)
})
