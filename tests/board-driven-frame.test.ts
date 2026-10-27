import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, planDeck, distance, frameRule } from '../src/planner.ts'
import type { Settings } from '../src/planner.ts'
import { boundaryDistance, pointSegmentDistance } from '../src/deckGeometry.ts'
import { buildCsvReport } from '../src/csvExport.ts'
import { installerPlan } from '../src/installerPlan.ts'
import { materialEstimate } from '../src/materialEstimate.ts'
import { computeDeckPlanning } from '../src/planning.ts'
import { structureGeometry } from '../src/structureGeometry.ts'

const rect=[{x:0,y:0},{x:6,y:0},{x:6,y:4},{x:0,y:4}]
const settings=(patch:Partial<Settings>={}):Settings=>({...DEFAULT_SETTINGS,polygon:rect,frameSelection:'manual',pedestalSelection:'manual',...patch})
function audit(s:Settings){
  const p=planDeck(s),f=p.frame
  assert.equal(f.geometryPass,true,f.issues.join('\n'))
  for(const [i,q] of f.pedestals.entries()){
    assert.ok(boundaryDistance(p.p,q)>=(s.pedestalDiameter??150)/2000+(s.pedestalClearance??0)/1000-1e-5)
    assert.ok(f.members.some(m=>m.kind===(f.rule.bearer?'bearer':'joist')&&pointSegmentDistance(q,m.a,m.b)<1e-5))
    for(let j=0;j<i;j++)assert.ok(distance(q,f.pedestals[j])>=(s.pedestalDiameter??150)/1000-1e-5)
  }
  for(const q of f.projections){assert.ok(Math.abs(distance(q.point,q.support)-q.distance)<1e-5);assert.ok(q.limit===null||q.distance<=q.limit+1e-5)}
  assert.ok(f.members.every(m=>distance(m.a,m.b)<=s.frameStock+1e-5))
  assert.ok(f.maxPrimarySpan<=frameRule(s.frame,s.load).support+1e-5)
  assert.ok(!f.rule.bearer||f.maxSecondarySpan<=f.rule.bearerSpacing+1e-5)
  return p
}

test('selected top edge boards change real transverse framing in both runs and windings',()=>{
  for(const direction of ['horizontal','vertical'] as const)for(const reverse of [false,true]){
    const polygon=reverse?[...rect].reverse():rect
    const full=audit(settings({polygon,direction})),none=audit(settings({polygon,direction,perimeterEdges:rect.map(()=>false)}))
    assert.equal(none.boards.pieces.filter(q=>q.kind==='perimeter').length,0)
    assert.notDeepEqual(none.frame.members,full.frame.members)
    assert.ok(none.frame.members.filter(m=>m.kind==='noggin').length<full.frame.members.filter(m=>m.kind==='noggin').length)
    assert.ok(full.frame.members.filter(m=>m.kind==='rim').every(m=>m.role==='edge-rail'&&Math.abs(m.a.x-m.b.x)<1e-5),'Only the cross-running edge ladders get outer rails; no full upper ring')
    audit(settings({polygon,direction,perimeterEdges:[true,false,true,false]}))
  }
})
test('fascia control changes the actual frame-end plane; unknown caps retain provisional quantities',()=>{
  const s=settings(),p=audit(s),changed=audit({...s,fasciaClearance:60})
  assert.notDeepEqual(changed.frame.members,p.frame.members)
  for(const m of changed.frame.members)for(const q of [m.a,m.b])assert.ok(boundaryDistance(changed.p,q)>=.06-1e-5)
  assert.equal(changed.frame.fasciaClearance,.06)
  assert.equal(p.frame.verification.status,'provisional')
  assert.ok(p.frame.projections.some(q=>q.limit===null&&q.distance>0))
  assert.ok(materialEstimate(p,{}).lines.filter(q=>q.key==='pedestals'||q.key.startsWith('profile')).every(q=>!q.pending))
})
test('entered profile overhang limits constrain geometry and prevent a complete order if exceeded',()=>{
  const s=settings({frame:'big'}),p=audit(s)
  const max=Math.max(...p.frame.projections.filter(q=>q.size===80).map(q=>q.distance))*1000
  audit({...s,joistOverhang80:Math.ceil(max)+1})
  const rejected=planDeck({...s,joistOverhang80:0})
  assert.equal(rejected.frame.geometryPass,false)
  assert.equal(rejected.frame.members.length,0)
  assert.ok(rejected.frame.diagnostic.members.length>0)
  assert.ok(materialEstimate(rejected,{}).lines.some(q=>q.pending))
  assert.ok(buildCsvReport('frame',rejected,s,{}).unavailable)
})
test('collinear selected segments retain original identities and change only their necessary structure',()=>{
  const polygon=[{x:0,y:0},{x:3,y:0},{x:6,y:0},{x:6,y:4},{x:0,y:4}],s=settings({polygon,perimeterEdges:[true,false,true,false,true]})
  const p=audit(s),model=installerPlan(p,s)
  assert.deepEqual(model.edges.map(q=>q.framingBoard),s.perimeterEdges)
  assert.equal(p.boards.pieces.filter(q=>q.kind==='perimeter'&&q.x===0&&q.y===0).length,1)
})
test('inside corners, angled outlines and round openings retain actual checked structure',()=>{
  const shapes=[rect,[{x:0,y:0},{x:6,y:0},{x:6,y:2},{x:4,y:2},{x:4,y:4},{x:0,y:4}],[{x:0,y:0},{x:5.2,y:0},{x:4,y:3},{x:1,y:3}]]
  for(const polygon of shapes)for(const direction of ['horizontal','vertical'] as const)audit(settings({polygon,direction}))
  const hole={id:'hole',name:'Planter',polygon:Array.from({length:16},(_,i)=>({x:2+Math.cos(i*Math.PI/8)*.5,y:2+Math.sin(i*Math.PI/8)*.5}))}
  const p=audit(settings({cutouts:[hole]}))
  assert.ok(p.frame.members.some(m=>m.role==='opening-rim'))
  assert.ok(p.frame.checks.some(c=>c.name==='Opening rim support spacing'&&c.ok))
})
test('worker result, installer schedules, CSV quantities and 3D consume the same solved frame',()=>{
  const s=settings({perimeterEdges:[true,false,true,false],fasciaClearance:30}),result=computeDeckPlanning(s,{}),p=result.plan!
  assert.ok(p.frame.geometryPass)
  const m=installerPlan(p,result.settings),csv=buildCsvReport('project',p,result.settings,{})
  assert.equal(m.members.length,p.frame.members.length);assert.equal(m.pedestals.length,p.frame.pedestals.length)
  assert.equal(m.construction.fasciaClearance,30)
  assert.equal(m.construction.projections.length,p.frame.projections.length)
  assert.equal(csv.rows.filter(q=>q[0]==='Calculated overhang').length,p.frame.projections.length)
  assert.equal(buildCsvReport('pedestals',p,s,{}).rows.length,p.frame.pedestals.length)
  assert.equal(structureGeometry(p,s,'joists',true).filter(q=>q.kind==='pedestal').length,p.frame.pedestals.length)
})

test('professional-plan concepts from the update PDF retain checked angled and house-edge framing',()=>{
  const examples=[
    {points:[[0,0],[5,0],[5,1.2],[4.6,1.2],[4.6,5.3],[2.5,7.5],[-.5,7.5],[-1.3,6.7],[-1.3,6],[0,4.7]],omit:[0,9]},
    {points:[[0,1.5],[1.2,.3],[1.6,.7],[1.6,0],[7.5,0],[7.5,5.5],[5.8,4.3],[3.8,4.3],[2.8,5.4],[2.8,9.8],[0,9.8]],omit:[3,5,6,7,8]},
    {points:[[0,0],[1,.3],[1.5,1],[2.3,1.2],[3,1],[2.7,2.3],[2.4,3.5],[2.2,4.7],[2.3,6],[1.3,6],[.4,5.7],[-.6,5],[.3,3.5],[.9,2.5],[-.2,1.8]],omit:[]},
  ]
  for(const example of examples){
    const p=audit(settings({polygon:example.points.map(([x,y])=>({x,y})),perimeterEdges:example.points.map((_,i)=>!example.omit.includes(i)),direction:'vertical',height:300,pedestalMin:117,pedestalMax:201,pedestalDiameter:205,pedestalName:'VersiJack F4 Pedestal'}))
    assert.equal(p.heightFits,true);assert.equal(p.frame.construction,'board-driven')
    assert.ok(p.frame.projections.filter(q=>q.tier==='secondary').every(q=>q.distance<=.103),'Local bearer rows avoid long projections where a house-side arm starts between global rows')
    assert.ok(p.frame.connections.length>0);assert.ok(p.frame.boardChecks.every(q=>q.ok))
  }
})

test('exported recess and limits come from solved geometry even if a caller supplies stale settings',()=>{
  const s=settings({fasciaClearance:30,joistOverhang35:200,joistOverhang80:250}),p=audit(s)
  const model=installerPlan(p,{...s,fasciaClearance:400,joistOverhang35:0})
  assert.equal(model.construction.fasciaClearance,30);assert.equal(model.construction.joistOverhang35,200)
  const report=buildCsvReport('frame',p,s,{})
  assert.ok(report.rows.length>0)
  for(const row of report.rows){assert.equal(row[report.headers.indexOf('Applied fascia recess mm')],30);assert.match(String(row[report.headers.indexOf('Status')]),/Provisional/)}
})
