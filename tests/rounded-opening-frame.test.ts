import test from 'node:test'
import assert from 'node:assert/strict'
import { Worker } from 'node:worker_threads'
import { DEFAULT_SETTINGS, planDeck } from '../src/planner.ts'
import type { Member, Point, Settings } from '../src/planner.ts'
import { ellipseOutline, memberCrossesOpening } from '../src/shapeGeometry.ts'
import { boundaryDistance, insetPolygon, pointSegmentDistance } from '../src/deckGeometry.ts'
import { installerPlan } from '../src/installerPlan.ts'
import { buildCsvReport } from '../src/csvExport.ts'
import { structureGeometry } from '../src/structureGeometry.ts'
import { computeDeckPlanning } from '../src/planning.ts'
import type { PlanningResult } from '../src/planning.ts'

const T=2e-5,distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y)
const base:Settings={...DEFAULT_SETTINGS,polygon:[{x:0,y:0},{x:6,y:0},{x:6,y:5},{x:0,y:5}],height:261,variation:0,joints:'butt',frameSelection:'manual',pedestalSelection:'auto',pedestalDiameter:205}
function settings(shape:'circle'|'oval',patch:Partial<Settings>={}):Settings{
  return {...base,cutouts:[{id:'round',name:'Round opening',shape,polygon:ellipseOutline(2,shape==='circle'?2:1.4).map(q=>({x:q.x+2,y:q.y+1.5}))}],...patch}
}
// Independent line intersection. Rim-to-rim mitres never count as an external
// bearing; measure the whole closed path between actual joists and ties.
function crossing(a:Point,b:Point,m:Member):number[]{
  const ux=b.x-a.x,uy=b.y-a.y,vx=m.b.x-m.a.x,vy=m.b.y-m.a.y,dx=m.a.x-a.x,dy=m.a.y-a.y,den=ux*vy-uy*vx
  if(Math.abs(den)<1e-10)return []
  const t=(dx*vy-dy*vx)/den,u=(dx*uy-dy*ux)/den
  return t>=-T&&t<=1+T&&u>=-T&&u<=1+T?[Math.max(0,Math.min(1,t))*distance(a,b)]:[]
}
function audit(s:Settings){
  const p=planDeck(s),f=p.frame,ms=f.members
  assert.equal(f.geometryPass,true,`${s.frame}/${s.load}/${s.direction}/${s.pictureFrameRows}: ${f.issues.join('; ')}`)
  const rims=ms.filter(m=>m.role==='opening-rim'),ties=ms.filter(m=>m.role==='opening-tie')
  assert.ok(rims.length>=32)
  assert.ok(!f.rule.bearer?ms.every(m=>m.kind!=='bearer'):true,'Do not add a lower tier to a joist-only option')
  for(const [i,q] of f.pedestals.entries()){
    for(const other of f.pedestals.slice(0,i))assert.ok(distance(q,other)>=(s.pedestalDiameter??150)/1000-T)
    for(const h of p.holes)assert.ok(boundaryDistance(h,q)>=(s.pedestalDiameter??150)/2000+(s.pedestalClearance??0)/1000-T)
  }
  for(const m of ms){assert.equal(memberCrossesOpening(m,p.holes,f.faceWidth),false);assert.ok(distance(m.a,m.b)<=s.frameStock+T)}
  for(const [i,h] of p.holes.entries())for(let row=0;row<(s.pictureFrameRows??1);row++){
    const ring=insetPolygon(h,-(row*(s.board.width+s.board.gap)/1000+s.board.width/2000)),segments=ring.map((a,j)=>({a,b:ring[(j+1)%ring.length]})),supports=ms.filter(m=>m.role!=='opening-rim'&&m.kind!=='bearer')
    let offset=0;const nodes:number[]=[]
    for(const edge of segments){nodes.push(...supports.flatMap(m=>crossing(edge.a,edge.b,m)).map(t=>t+offset));offset+=distance(edge.a,edge.b)}
    nodes.sort((a,b)=>a-b);assert.ok(nodes.length>=3,'The rim needs external supports, not a self-supporting cycle')
    const gaps=nodes.map((a,j)=>(nodes[j+1]??nodes[0]+offset)-a)
    assert.ok(Math.max(...gaps)<=s.joistSpacing/1000+T,'Actual bearing spacing around the whole opening is bounded')
    for(const m of rims.filter(m=>m.openingIndex===i&&m.openingRow===row)){
      assert.ok(segments.some(e=>pointSegmentDistance(m.a,e.a,e.b)<T&&pointSegmentDistance(m.b,e.a,e.b)<T),'The metal rim follows the opening, rather than its rectangular bounds')
      assert.ok(f.connections.some(c=>c.members.includes(ms.indexOf(m))),'Rim mitres/connectors are explicitly scheduled')
    }
  }
  assert.ok(ties.length<=24*(s.pictureFrameRows??1),'Only spaced local ties are needed, not a comb around every board facet')
  assert.ok(ties.every(m=>distance(m.a,m.b)<.6),'Opening ties reach a nearby real joist')
  assert.ok(f.boardChecks.every(c=>c.ok),'Opening border and infill pieces retain real bearing')
  assert.equal(f.verification.status,'provisional')
  assert.ok(f.verification.notes.some(n=>n.includes('mitre connectors')))
  const drawing=installerPlan(p,s),csv=buildCsvReport('frame',p,s,{}),parts=structureGeometry(p,s,'joists',true)
  assert.equal(drawing.members.length,ms.length);assert.equal(parts.filter(m=>m.kind==='joist').length,ms.filter(m=>m.kind!=='bearer').length)
  assert.equal(csv.rows.length,Object.values(p.framePieces).reduce((n,a)=>n+a.length,0))
  assert.equal(drawing.members.filter(m=>m.name.includes('opening rim')).length,rims.length+ties.length)
  assert.ok(csv.rows.some(r=>String(r[4]).includes('opening rim section')))
  return p
}

for(const shape of ['circle','oval'] as const)for(const frame of ['small','big','small-small','big-small'] as const)for(const direction of ['horizontal','vertical'] as const)for(const load of [3,5] as const)for(const pictureFrameRows of [1,2] as const){
  test(`shape-following ${shape} rim: ${frame}/${direction}/${load}/${pictureFrameRows}`,()=>audit(settings(shape,{frame,direction,load,pictureFrameRows})))
}
test('small openings between joist lines and multiple round openings have anchored local rims',()=>{
  for(const frame of ['small','big-small'] as const){
    const cutouts=[.65,3.35].map((x,i)=>({id:`h${i}`,name:`Opening ${i}`,shape:'circle' as const,polygon:ellipseOutline(.45,.45,16).map(q=>({x:q.x+x,y:q.y+2.1}))}))
    const s=settings('circle',{frame,cutouts}),p=planDeck(s)
    assert.equal(p.frame.geometryPass,true,p.frame.issues.join('; '))
    assert.ok(p.frame.members.some(m=>m.openingIndex===0&&m.role==='opening-tie'))
    assert.ok(p.frame.members.some(m=>m.openingIndex===1&&m.role==='opening-tie'))
    for(const m of p.frame.members)assert.equal(memberCrossesOpening(m,p.holes,p.frame.faceWidth),false)
  }
})
test('round trims preserve winding and use actual optional projection limits',()=>{
  const s=settings('circle',{frame:'big-small',pictureFrameRows:2}),p=audit(s)
  const reversed=audit({...s,polygon:[...s.polygon].reverse(),cutouts:s.cutouts!.map(h=>({...h,polygon:[...h.polygon].reverse()}))})
  assert.equal(reversed.frame.members.length,p.frame.members.length)
  const limited=planDeck({...s,joistOverhang35:0,joistOverhang80:0})
  assert.equal(limited.frame.geometryPass,false,'An entered impossible limit remains blocking')
  assert.equal(limited.frame.members.length,0);assert.ok(limited.frame.diagnostic.members.length)
})
test('long opening facets are cut from short stock only at actual transverse supports',()=>{
  for(const frame of ['big','big-small'] as const){
    const s=settings('circle',{frame,frameStock:.5,cutouts:[{id:'coarse',name:'Faceted opening',shape:'circle',polygon:ellipseOutline(2,2,8).map(q=>({x:q.x+2,y:q.y+1.5}))}]}),p=planDeck(s),f=p.frame
    assert.equal(f.geometryPass,true,f.issues.join('; '))
    const rims=f.members.filter(m=>m.role==='opening-rim')
    assert.ok(rims.every(m=>distance(m.a,m.b)<=.5+T))
    const joints=f.splices.filter(q=>rims.filter(m=>pointSegmentDistance(q,m.a,m.b)<T).length>=2)
    assert.ok(joints.length>=8,'The long facets actually require stock cuts')
    for(const q of joints)assert.ok(f.members.some(m=>m.role!=='opening-rim'&&m.kind!=='bearer'&&pointSegmentDistance(q,m.a,m.b)<T),'A mitre between rim pieces alone cannot support a stock splice')
  }
})
test('automatic and real worker planning retain the same rounded-opening geometry and quantities',async()=>{
  const s=settings('circle',{frame:'big',frameSelection:'auto',pictureFrameRows:2}),expected=computeDeckPlanning(s,{})
  assert.equal(expected.error,'');assert.equal(expected.plan?.frame.geometryPass,true)
  const source=new URL('../src/planning.worker.ts',import.meta.url).href,bridge=`const {parentPort}=require('node:worker_threads');globalThis.self={onmessage:null,postMessage:data=>parentPort.postMessage(data)};parentPort.on('message',data=>self.onmessage({data}));import(${JSON.stringify(source)}).then(()=>parentPort.postMessage({ready:true}));`,worker=new Worker(bridge,{eval:true,execArgv:['--experimental-strip-types']})
  try{
    const result=await new Promise<PlanningResult>((resolve,reject)=>{worker.on('error',reject);worker.on('message',data=>data.ready?worker.postMessage({key:'round',settings:s,prices:{}}):resolve(data.result))})
    assert.deepEqual(result.plan!.frame.members,expected.plan!.frame.members);assert.deepEqual(result.plan!.frame.pedestals,expected.plan!.frame.pedestals)
    assert.deepEqual(result.plan!.materials,expected.plan!.materials)
  }finally{await worker.terminate()}
})

