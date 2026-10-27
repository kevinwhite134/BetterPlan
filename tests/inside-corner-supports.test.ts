import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, planDeck, polygonArea } from '../src/planner.ts'
import type { Point, Settings } from '../src/planner.ts'
import { pointInside, boundaryDistance } from '../src/deckGeometry.ts'

const L=(width:number,notch:number):Point[]=>[{x:0,y:0},{x:width,y:0},{x:width,y:3.3},{x:notch,y:3.3},{x:notch,y:1.4},{x:0,y:1.4}]
const settings=(width:number,notch:number,boardWidth:number):Settings=>({...DEFAULT_SETTINGS,polygon:L(width,notch),height:300,frame:'big-small',board:{...DEFAULT_SETTINGS.board,width:boardWidth},pedestalName:'VersiJack F4 Pedestal',pedestalMin:117,pedestalMax:201,pedestalDiameter:205})
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y)
function checked(s:Settings){
  const before=JSON.stringify(s),p=planDeck(s),face=(s.frameFaceWidth??35)/1000
  assert.equal(p.frame.geometryPass,true,p.frame.issues.join('\n'));assert.equal(p.frame.layoutStatus,'ready')
  assert.equal(p.heightFits,true);assert.ok(Math.abs(p.area-polygonArea(s.polygon))<1e-8)
  assert.ok(p.frame.pedestals.length>0);assert.ok(p.frame.members.length>0)
  const upper=p.frame.members.filter(m=>m.kind!=='bearer')
  for(const axis of ['x','y'] as const){const run=axis==='x'?'y':'x',rails=upper.filter(m=>Math.abs(m.a[axis]-m.b[axis])<1e-7)
    for(let i=0;i<rails.length;i++)for(let j=0;j<i;j++){
      const a=rails[i],b=rails[j],overlap=Math.min(Math.max(a.a[run],a.b[run]),Math.max(b.a[run],b.b[run]))-Math.max(Math.min(a.a[run],a.b[run]),Math.min(b.a[run],b.b[run]))
      if(overlap>1e-5)assert.ok(Math.abs(a.a[axis]-b.a[axis])>=face-1e-5,'actual upper faces are physically separated')
    }
  }
  for(let i=0;i<p.frame.pedestals.length;i++){
    const q=p.frame.pedestals[i];assert.ok(pointInside(p.p,q));assert.ok(boundaryDistance(p.p,q)>=(s.pedestalDiameter??150)/2000-1e-5)
    for(let j=0;j<i;j++)assert.ok(distance(q,p.frame.pedestals[j])>=(s.pedestalDiameter??150)/1000-1e-5,'distinct bases never overlap')
  }
  assert.ok(p.frame.checks.every(c=>c.ok));assert.equal(JSON.stringify(s),before,'no change to customer dimensions, height or manual inputs')
  return p
}

for(const [width,notch,boardWidth] of [[3.6,2.2,136],[4.2,2.4,136],[4.2,2,156]])test(`inside-corner regression ${width} m / ${notch} m / ${boardWidth} mm, mirrored and both board directions`,()=>{
  const original=settings(width,notch,boardWidth)
  for(const mirror of [false,true])for(const reverse of [false,true])for(const direction of ['horizontal','vertical'] as const){
    let polygon=mirror?original.polygon.map(p=>({x:width-p.x,y:p.y})):original.polygon
    if(reverse)polygon=[...polygon].reverse()
    checked({...original,polygon,direction})
  }
})
test('automatic breaker shifts only enough to clear an inner rim and still schedules all actual pieces',()=>{
  const s=settings(4.2,2,156),p=checked(s)
  assert.equal(p.boards.breakers.length,1);assert.ok(Math.abs(p.boards.breakers[0]-2.1)<.035)
  assert.notEqual(p.boards.breakers[0],2.1);assert.match(p.boards.strategy,/corner clearance/)
  assert.ok(p.boards.pieces.every(q=>q.length<=s.board.stock+1e-7))
  assert.deepEqual(p.boards.bars.flatMap(b=>b.cuts.map(c=>c.piece)).sort((a,b)=>a-b),p.boards.pieces.map((_,i)=>i))
})
test('a genuinely conflicting manual breaker is retained and stays unresolved until the user changes it',()=>{
  const s={...settings(4.2,2,156),breakerMode:'manual' as const,breakerPositions:[2.1]},p=planDeck(s)
  assert.deepEqual(p.boards.breakers,[2.1]);assert.equal(p.frame.geometryPass,false)
  assert.ok(p.frame.issues.some(q=>q.includes('upper support faces overlap')))
  assert.equal(p.frame.members.length,0);assert.equal(p.frame.pedestals.length,0)
})
