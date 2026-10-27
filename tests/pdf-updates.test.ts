import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { DEFAULT_SETTINGS, planDeck, planBoardsOnly } from '../src/planner.ts'
import type { Member, Point, Settings } from '../src/planner.ts'
import { computeDeckPlanning } from '../src/planning.ts'
import { placePrimary } from '../src/pedestalPlacement.ts'
import { dragBreakerWithinOutline, validBreakerPlacement } from '../src/breakerPlacement.ts'
import { rotatedViewBox, rotatePlanSvg } from '../src/planRotation.ts'
import { installerPlan } from '../src/installerPlan.ts'
import { buildCsvReport } from '../src/csvExport.ts'
import { structureGeometry } from '../src/structureGeometry.ts'

const fixture:Settings=JSON.parse(fs.readFileSync(new URL('./fixtures/irregular-opening-update.json',import.meta.url),'utf8'))
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y)
function edgeDistance(q:Point,a:Point,b:Point){const x=b.x-a.x,y=b.y-a.y,t=Math.max(0,Math.min(1,((q.x-a.x)*x+(q.y-a.y)*y)/(x*x+y*y)));return distance(q,{x:a.x+t*x,y:a.y+t*y})}
function auditBases(points:Point[],diameter:number){for(let i=0;i<points.length;i++)for(let j=0;j<i;j++)assert.ok(distance(points[i],points[j])>=diameter-1e-5,`Bases ${i}/${j} overlap`)}

test('the supplied irregular project works with its real opening, fixed height and full extra base clearance',()=>{
  const before=JSON.stringify(fixture),r=computeDeckPlanning(fixture,{}),p=r.plan!
  assert.equal(p.frame.geometryPass,true,p.frame.issues.join('\n'))
  assert.equal(r.settings.height,261);assert.equal(r.settings.variation,0);assert.equal(r.settings.pedestalDiameter,205);assert.equal(r.settings.pedestalClearance,120)
  assert.deepEqual(r.settings.polygon,fixture.polygon);assert.deepEqual(r.settings.cutouts,fixture.cutouts)
  auditBases(p.frame.pedestals,.205)
  for(const q of p.frame.pedestals)for(const ring of [p.p,...p.holes])for(let i=0;i<ring.length;i++)assert.ok(edgeDistance(q,ring[i],ring[(i+1)%ring.length])>=.2225-1e-5)
  assert.equal(p.boards.fit.cornerGaps.length,1)
  assert.ok(p.boards.pieces.every(q=>q.kind!=='infill'||q.length>.01||q.width>.01),'No separate gap-sized corner sliver is ordered')
  assert.equal(installerPlan(p,r.settings).cornerGaps.length,1)
  assert.equal(buildCsvReport('project',p,r.settings,{}).rows.filter(q=>q[0]==='Corner installation gap').length,1)
  assert.equal(JSON.stringify(fixture),before)
})

test('nearby joists move earlier bases as well as later rows instead of reporting a greedy-placement conflict',()=>{
  const ends=[[.159,2.152],[.227,2.06],[.298,2.031],[.204,1.931],[.189,2.153],[.282,2.137],[.256,2.155],[.206,1.96],[.328,1.993],[.297,2.165],[.321,2.177],[.224,1.946]]
  const members:Member[]=ends.map(([a,b],i)=>({a:{x:.3+i*.06,y:a},b:{x:.3+i*.06,y:b},kind:'joist',size:80}))
  const outer=[{x:0,y:0},{x:4,y:0},{x:4,y:4},{x:0,y:4}],r=placePrimary(members,outer,[],{...DEFAULT_SETTINGS,pedestalDiameter:205},{support:.9})
  assert.equal(r.error,'');auditBases(r.pedestals,.205)
  for(const m of members){const nodes=r.pedestals.filter(q=>edgeDistance(q,m.a,m.b)<1e-5).sort((a,b)=>a.y-b.y);assert.ok(nodes.length>=2);for(let i=1;i<nodes.length;i++)assert.ok(distance(nodes[i],nodes[i-1])<=.9+1e-5)}
})

test('double picture frames change actual board rows, clear infill and framing in either run and winding',()=>{
  const rect=[{x:0,y:0},{x:6,y:0},{x:6,y:4},{x:0,y:4}]
  for(const direction of ['horizontal','vertical'] as const)for(const reverse of [false,true]){
    const s={...DEFAULT_SETTINGS,polygon:reverse?[...rect].reverse():rect,direction,joints:'butt' as const},single=planDeck(s),double=planDeck({...s,pictureFrameRows:2})
    assert.equal(double.frame.geometryPass,true,double.frame.issues.join('; '))
    assert.ok(double.boards.pieces.some(q=>q.perimeterRow===1))
    assert.ok(double.boards.pieces.filter(q=>q.kind==='perimeter').length>single.boards.pieces.filter(q=>q.kind==='perimeter').length)
    assert.ok(Math.abs(Math.min(...double.boards.fit.inner.map(q=>q.x))-(2*s.board.width+2*s.board.gap)/1000)<1e-5)
    assert.notDeepEqual(double.frame.members,single.frame.members)
    const omitted=planDeck({...s,pictureFrameRows:2,perimeterEdges:[false,false,false,false]})
    assert.equal(omitted.boards.pieces.filter(q=>q.kind==='perimeter').length,0)
    assert.equal(omitted.frame.members.filter(q=>q.role==='edge-rail').length,0)
  }
})

test('double opening borders stay separate, supported and included in all schedules',()=>{
  const s:Settings={...DEFAULT_SETTINGS,polygon:[{x:0,y:0},{x:6,y:0},{x:6,y:4},{x:0,y:4}],joints:'butt',pictureFrameRows:2,cutouts:[{id:'h',name:'Opening',shape:'rectangle',polygon:[{x:2,y:1.5},{x:3,y:1.5},{x:3,y:2.5},{x:2,y:2.5}]}]},p=planDeck(s)
  assert.equal(p.frame.geometryPass,true,p.frame.issues.join('; '));assert.ok(p.frame.boardChecks.every(q=>q.ok))
  assert.equal(installerPlan(p,s).members.length,p.frame.members.length)
  assert.equal(buildCsvReport('frame',p,s,{}).rows.length,Object.values(p.framePieces).flat().length)
  assert.equal(structureGeometry(p,s,'joists',true).filter(q=>q.kind!=='pedestal').length,p.frame.members.length)
})

test('the supplied irregular deck also supports double borders by aligning real perimeter stock cuts',()=>{
  const s={...fixture,pictureFrameRows:2 as const},p=planDeck(s)
  assert.equal(p.frame.geometryPass,true,p.frame.issues.join('; '));assert.ok(p.frame.boardChecks.every(q=>q.ok))
  assert.deepEqual(p.boards.breakers,fixture.breakerPositions,'The manual breaker is not moved to fix automatic stock joints')
  const horizontal=p.boards.perimeterSplices.filter(q=>q.horizontal)
  assert.equal(horizontal.length,2);assert.ok(Math.abs(horizontal[0].point.x-horizontal[1].point.x)<1e-7,'Both border rows end over the same real support line')
  assert.ok(p.boards.pieces.every(q=>q.length<=s.board.stock+1e-6));auditBases(p.frame.pedestals,.205)
})

test('bearers run under both rails of a rectangular edge ladder, with real pedestal support',()=>{
  const s={...DEFAULT_SETTINGS,joints:'butt' as const},p=planDeck(s),rows=p.frame.members.filter(m=>m.kind==='bearer'&&m.role!=='bearer-link')
  assert.equal(p.frame.geometryPass,true,p.frame.issues.join('; '))
  for(const rail of p.frame.members.filter(m=>m.role==='edge-rail')){
    assert.ok(rows.some(m=>m.a.x<=rail.a.x+1e-5&&m.b.x>=rail.a.x-1e-5&&m.a.y>=Math.min(rail.a.y,rail.b.y)-1e-5&&m.a.y<=Math.max(rail.a.y,rail.b.y)+1e-5&&p.frame.pedestals.some(q=>edgeDistance(q,m.a,m.b)<1e-5)),'The outer rail has an actual bearer and a real pedestal beneath that bearer')
  }
})

test('free breaker dragging follows the requested in-bounds point even across an invalid stock bay',()=>{
  const next=dragBreakerWithinOutline(DEFAULT_SETTINGS,[3],0,1,false)
  assert.deepEqual(next,[1]);assert.equal(validBreakerPlacement(DEFAULT_SETTINGS,next),false)
  assert.throws(()=>planBoardsOnly({...DEFAULT_SETTINGS,breakerMode:'manual',breakerPositions:next}))
  const edge=dragBreakerWithinOutline(DEFAULT_SETTINGS,[3],0,-100,false)
  assert.ok(edge[0]>0&&edge[0]<1)
})

test('plan rotation changes only presentation bounds, including measured SVGs',()=>{
  const [x,y,w,h]=rotatedViewBox(0,0,12,6,90).split(' ').map(Number)
  assert.ok(Math.abs(x-3)<1e-8&&Math.abs(y+3)<1e-8&&Math.abs(w-6)<1e-8&&Math.abs(h-12)<1e-8)
  const p=planDeck(DEFAULT_SETTINGS),svg=rotatePlanSvg('<svg viewBox="0 0 12 6"><path d="M1 2L3 4"/></svg>',90)
  assert.match(svg,/rotate\(90 6 3\)/);assert.match(svg,/M1 2L3 4/)
  assert.deepEqual(p.physical,DEFAULT_SETTINGS.polygon)
})
