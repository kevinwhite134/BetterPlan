import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, planDeck } from '../src/planner.ts'
import { projectedStructure, structureGeometry } from '../src/structureGeometry.ts'
import type { Frame, Point } from '../src/planner.ts'

const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} differs from ${b}`)
const shapes=[DEFAULT_SETTINGS.polygon,[{x:0,y:0},{x:6,y:0},{x:6,y:4},{x:4,y:4},{x:4,y:2},{x:2,y:2},{x:2,y:4},{x:0,y:4}],[{x:0,y:0},{x:3.4,y:0},{x:3.8,y:4.6},{x:1.1,y:4.2}]]

test('structural drawing preserves all planned member and pedestal positions, counts and selected member depths',()=>{
  for(const frame of ['small','big','small-small','big-small'] as Frame[])for(const direction of ['horizontal','vertical'] as const)for(const polygon of shapes){
    const settings={...DEFAULT_SETTINGS,frame,direction,polygon,frameFaceWidth:45},plan=planDeck(settings),before=JSON.stringify(plan)
    const parts=structureGeometry(plan,settings,'joists',true),physical=(p:Point)=>direction==='vertical'?{x:p.y,y:p.x}:p
    assert.equal(parts.filter(p=>p.kind==='pedestal').length,plan.frame.pedestals.length)
    assert.equal(parts.filter(p=>p.kind!=='pedestal').length,plan.frame.members.length)
    plan.frame.members.forEach((m,i)=>{
      const part=parts.find(p=>p.id===`member-${i}`)!,a=physical(m.a),b=physical(m.b),top=-settings.board.thickness/1000-(m.kind==='bearer'?plan.frame.rule.joist/1000:0),points=part.faces.flatMap(f=>f.points)
      close(part.centre.x,(a.x+b.x)/2);close(part.centre.y,(a.y+b.y)/2)
      close(Math.max(...points.map(p=>p.z)),top);close(Math.min(...points.map(p=>p.z)),top-m.size/1000)
      const face=part.faces[0].points,length=Math.hypot(b.x-a.x,b.y-a.y),distance=Math.abs((b.x-a.x)*(face[0].y-a.y)-(b.y-a.y)*(face[0].x-a.x))/length
      close(distance,settings.frameFaceWidth/2000)
    })
    assert.equal(JSON.stringify(plan),before,'rendering never changes support design or material quantities')
  }
})

test('pedestal bases use actual entered diameter, sit on the ground and meet the underside of the supporting tier',()=>{
  for(const direction of ['horizontal','vertical'] as const){
    const settings={...DEFAULT_SETTINGS,direction,pedestalDiameter:180},plan=planDeck(settings),parts=structureGeometry(plan,settings,'pedestals',false)
    assert.equal(parts.length,plan.frame.pedestals.length)
    parts.forEach((part,i)=>{
      const point=plan.frame.pedestals[i],centre=direction==='vertical'?{x:point.y,y:point.x}:point,points=part.faces.flatMap(f=>f.points),tops=part.faces.filter(f=>f.normal.z===1)
      close(part.centre.x,centre.x);close(part.centre.y,centre.y)
      assert.equal(tops.length,3,'separate base, stem and head')
      close(Math.min(...points.map(p=>p.z)),-settings.height/1000)
      close(Math.max(...points.map(p=>p.z)),-(settings.board.thickness+plan.frame.rule.joist+plan.frame.rule.bearer)/1000)
      close(Math.max(...tops[0].points.map(p=>p.x))-Math.min(...tops[0].points.map(p=>p.x)),.18)
      close(Math.max(...tops[0].points.map(p=>p.y))-Math.min(...tops[0].points.map(p=>p.y)),.18)
    })
  }
})

test('each layer contains the requested actual components and projects valid visible faces around the full orbit',()=>{
  const plan=planDeck(DEFAULT_SETTINGS)
  for(const exposure of ['finished','boards','joists','bearers','pedestals'] as const)for(const showSupports of [false,true]){
    const parts=structureGeometry(plan,DEFAULT_SETTINGS,exposure,showSupports)
    if(exposure==='pedestals')assert.ok(parts.every(p=>p.kind==='pedestal'))
    if(exposure==='bearers')assert.ok(parts.every(p=>p.kind==='pedestal'||p.kind==='bearer'))
    if(!showSupports&&exposure!=='pedestals')assert.ok(parts.every(p=>p.kind!=='pedestal'))
    assert.equal(new Set(parts.map(p=>p.id)).size,parts.length)
    for(const rotation of [-180,-135,-45,0,45,135,180])for(const tilt of [20,52,80]){
      const visible=projectedStructure(parts,rotation,tilt)
      assert.equal(visible.length,parts.length)
      assert.ok(visible.every(p=>p.faces.length>0))
      assert.ok(visible.every(p=>p.faces.flatMap(f=>f.points).every(q=>Number.isFinite(q.x)&&Number.isFinite(q.y)&&Number.isFinite(q.z))))
    }
  }
})
