import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, planDeck } from '../src/planner.ts'
import type { Member, Point, Settings } from '../src/planner.ts'
import { structureGeometry } from '../src/structureGeometry.ts'
import { buildCsvReport } from '../src/csvExport.ts'
import { installerPlan } from '../src/installerPlan.ts'

const rect=[{x:0,y:0},{x:6,y:0},{x:6,y:4},{x:0,y:4}],T=2e-5
const length=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y)
function distanceTo(q:Point,m:{a:Point;b:Point}){
  const dx=m.b.x-m.a.x,dy=m.b.y-m.a.y,t=Math.max(0,Math.min(1,((q.x-m.a.x)*dx+(q.y-m.a.y)*dy)/(dx*dx+dy*dy)))
  return length(q,{x:m.a.x+t*dx,y:m.a.y+t*dy})
}
const settings=(patch:Partial<Settings>={}):Settings=>({...DEFAULT_SETTINGS,polygon:rect,joints:'butt',frameSelection:'manual',pedestalSelection:'manual',...patch})
function checked(s:Settings){const p=planDeck(s);assert.equal(p.frame.geometryPass,true,p.frame.issues.join('\n'));return p}
const rails=(ms:Member[])=>ms.filter(m=>m.role==='edge-rail')

test('picture-frame edge ladders have two real longitudinal joists and connecting rungs for every frame/run/winding',()=>{
  for(const frame of ['small','big','small-small','big-small'] as const)for(const direction of ['horizontal','vertical'] as const)for(const reverse of [false,true]){
    const s=settings({frame,direction,polygon:reverse?[...rect].reverse():rect}),p=checked(s),f=p.frame,outer=rails(f.members)
    assert.ok(outer.length>=2)
    const minX=Math.min(...p.p.map(q=>q.x)),maxX=Math.max(...p.p.map(q=>q.x)),half=f.faceWidth/2
    for(const m of outer){
      assert.ok(Math.abs(m.a.x-m.b.x)<T,'Rectangle edge rails run along the transverse picture-frame boards')
      assert.ok(Math.abs(Math.min(m.a.x-minX,maxX-m.a.x)-half-s.board.thickness/1000)<T,'Outside rail FACE is one board thickness inside the outline')
      const rungs=f.members.filter(n=>n.kind==='noggin'&&[n.a,n.b].some(q=>distanceTo(q,m)<=half+T))
      assert.ok(rungs.length>=3,'Real transverse members meet the outer rail')
      assert.ok(rungs.some(r=>f.members.some(inner=>inner.kind==='joist'&&inner!==m&&[r.a,r.b].some(q=>distanceTo(q,inner)<T))),'Rungs connect back to a separate supported inner joist')
      assert.ok(!f.pedestals.some(q=>distanceTo(q,m)<T),'The outer rail does not add an impossible near-edge pedestal row')
    }
    assert.ok(f.checks.find(q=>q.name==='Picture-frame edge ladders')?.ok)
  }
})

test('board thickness and an explicit fascia recess move the physical outside rail face',()=>{
  for(const thickness of [18,25,40])for(const override of [undefined,60]){
    const s=settings({board:{...DEFAULT_SETTINGS.board,thickness},fasciaClearance:override}),p=checked(s),clearance=(override??thickness)/1000
    for(const m of rails(p.frame.members))assert.ok(Math.abs(Math.min(m.a.x,6-m.a.x)-p.frame.faceWidth/2-clearance)<T)
    assert.equal(p.frame.fasciaClearance,clearance)
  }
})

test('omitted picture-frame edges remove their ladders, including collinear selected segments',()=>{
  const none=checked(settings({perimeterEdges:[false,false,false,false]}))
  assert.equal(rails(none.frame.members).length,0)
  const left=checked(settings({perimeterEdges:[false,false,false,true]}))
  assert.ok(rails(left.frame.members).length>0)
  assert.ok(rails(left.frame.members).every(m=>Math.abs(m.a.x-(.025+left.frame.faceWidth/2))<T))
  const polygon=[{x:0,y:0},{x:6,y:0},{x:6,y:2},{x:6,y:4},{x:0,y:4}],s=settings({polygon,perimeterEdges:[false,true,true,false,false]}),split=checked(s)
  assert.ok(rails(split.frame.members).every(m=>Math.abs(m.a.x-(6-.025-split.frame.faceWidth/2))<T))
  assert.deepEqual(installerPlan(split,s).edges.map(e=>e.framingBoard),s.perimeterEdges)
})

test('long outer rails splice over actual rungs and reach the 3D, installer, CSV and purchasing schedules',()=>{
  const s=settings({frameStock:1.2}),p=checked(s),f=p.frame,outer=rails(f.members),half=f.faceWidth/2,parts=structureGeometry(p,s,'joists',true),csv=buildCsvReport('frame',p,s,{})
  assert.ok(outer.length>4)
  const outerSplices=f.splices.filter(q=>outer.filter(m=>length(q,m.a)<T||length(q,m.b)<T).length>=2)
  assert.ok(outerSplices.length>=4)
  for(const q of outerSplices)assert.ok(f.members.some(m=>m.kind==='noggin'&&distanceTo(q,m)<=half+T),'Each stock joint has a physical rung bearing')
  for(const m of outer){
    const i=f.members.indexOf(m)
    assert.ok(length(m.a,m.b)<=s.frameStock+T)
    const part=parts.find(q=>q.id===`member-${i}`)
    assert.ok(part,'Outer rail is rendered as real metal geometry')
    assert.ok(part.faces[0].points.some(q=>Math.abs(Math.min(q.x,6-q.x)-.025)<T),'3D solid has the same recessed outside face')
    assert.ok(p.framePieces[m.size].some(q=>q.member===i),'Outer rail is in the purchase cutting list')
  }
  assert.equal(installerPlan(p,s).members.length,f.members.length)
  assert.equal(csv.rows.length,Object.values(p.framePieces).flat().length)
  for(const size of [35,80])assert.equal(p.materials.find(q=>q.key===`profile${size}`)?.qty??0,p.frameCuts[size].length)
})
