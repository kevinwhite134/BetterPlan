import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, planDeck, scan } from '../src/planner.ts'
import type { Point, Settings } from '../src/planner.ts'
import { pointSegmentDistance } from '../src/deckGeometry.ts'
import { recommendFrames, selectAutomaticFrame } from '../src/frameRecommendation.ts'

const outline=(top:number):Point[]=>[{x:0,y:0},{x:top,y:0},{x:3.5,y:3.3},{x:1.8,y:3.15},{x:0,y:3.15}]
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y)
function audit(s:Settings){
  const p=planDeck(s),f=p.frame,diameter=(s.pedestalDiameter??150)/1000
  assert.equal(f.geometryPass,true,f.issues.join('\n'))
  assert.equal(f.rule.bearer,0)
  for(const m of f.members.filter(q=>q.kind==='joist')){
    const supports=f.pedestals.filter(q=>pointSegmentDistance(q,m.a,m.b)<1e-5).map(q=>distance(m.a,q)).sort((a,b)=>a-b)
    assert.ok(supports.length>=1)
    for(const [end,amount] of [['start',supports[0]],['end',distance(m.a,m.b)-supports.at(-1)!]] as const)if(amount>1e-5)assert.ok(f.projections.some(q=>q.member===f.members.indexOf(m)&&q.end===end&&Math.abs(q.distance-amount)<1e-5))
    for(let i=1;i<supports.length;i++)assert.ok(supports[i]-supports[i-1]<=f.rule.support+1e-5)
  }
  for(const [i,a] of f.pedestals.entries())for(let j=0;j<i;j++)assert.ok(distance(a,f.pedestals[j])>=diameter-1e-5)
  // Independently sample the full real cross-section, including thin corner
  // regions after the last joist, using intersections with actual trim lines.
  const upper=f.members.filter(m=>m.kind==='joist'),depth=Math.max(...f.footprint.map(q=>q.y))
  for(let i=0;i<=200;i++){
    const y=depth*i/200
    for(const [a,b] of scan(f.footprint,y)){
      const points=upper.flatMap(m=>{
        if(Math.abs(m.a.y-m.b.y)<1e-7)return []
        const t=(y-m.a.y)/(m.b.y-m.a.y)
        return t>=-1e-7&&t<=1+1e-7?[m.a.x+t*(m.b.x-m.a.x)]:[]
      }).filter(x=>x>=a-1e-5&&x<=b+1e-5).sort((x,z)=>x-z)
      assert.ok(points.length>=2)
      for(let j=1;j<points.length;j++)assert.ok(points[j]-points[j-1]<=s.joistSpacing/1000+1e-5,'Actual board-support gap remains within selected centres')
    }
  }
  return p
}

test('corner-alignment joists can move while actual edge and board spans remain supported',()=>{
  for(const top of [3.3,3.31,3.32,3.35])for(const frame of ['small','big'] as const)for(const direction of ['horizontal','vertical'] as const)for(const pedestalDiameter of [190,205]){
    const s={...DEFAULT_SETTINGS,polygon:outline(top),frame,direction,pedestalDiameter,load:5 as const}
    const p=audit(s)
    assert.deepEqual(p.physical,s.polygon);assert.equal(p.heightFits,planDeck(s).heightFits)
  }
})

test('a geometry failure still selects the height-compatible automatic pedestal consistently',()=>{
  const input:Settings={...DEFAULT_SETTINGS,frame:'big',frameSelection:'manual',pedestalSelection:'auto',height:234,variation:11,joistSpacing:100,pedestalName:'VersiJack F3 Pedestal',pedestalMin:74,pedestalMax:117,pedestalDiameter:190}
  const s=selectAutomaticFrame(input),p=planDeck(s),option=recommendFrames(s).options.find(o=>o.frame===s.frame)!
  assert.equal(s.frame,'big');assert.equal(s.pedestalName,'VersiJack F4 Pedestal');assert.equal(s.pedestalDiameter,205)
  assert.equal(p.heightFits,true);assert.equal(p.frame.geometryPass,true)
  assert.equal(s.height,input.height);assert.equal(s.variation,input.variation)
  assert.ok(option.choice);assert.ok(p.frame.members.length>0);assert.ok(p.frame.pedestals.length>0)
})
