import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, planDeck } from '../src/planner.ts'
import type { Settings, Point } from '../src/planner.ts'
import { boundaryDistance, pointInside, pointSegmentDistance } from '../src/deckGeometry.ts'
import { memberCrossesOpening, ellipseOutline } from '../src/shapeGeometry.ts'
import { selectAutomaticFrame } from '../src/frameRecommendation.ts'
import { buildCsvReport } from '../src/csvExport.ts'
import { structureGeometry } from '../src/structureGeometry.ts'

const rect=(x:number,y:number,w:number,d:number):Point[]=>[{x,y},{x:x+w,y},{x:x+w,y:y+d},{x,y:y+d}]
const hole={id:'opening',name:'Opening',shape:'rectangle' as const,polygon:rect(1,1,1,1)}
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y)
function audit(s:Settings){
  const p=planDeck(s),f=p.frame,diameter=(s.pedestalDiameter??150)/1000
  assert.equal(f.geometryPass,true,f.issues.join('\n'))
  assert.equal(f.rule.bearer,0)
  assert.ok(f.members.every(m=>m.kind!=='bearer'&&m.size===f.rule.joist),'No hidden lower frame layer')
  for(const m of f.members){
    assert.equal(memberCrossesOpening(m,p.holes,f.faceWidth),false)
    if(m.kind!=='joist')continue
    const nodes=f.pedestals.filter(q=>pointSegmentDistance(q,m.a,m.b)<1e-5).map(q=>distance(m.a,q)).sort((a,b)=>a-b)
    assert.ok(nodes.length>=1,'Each primary segment has real pedestal support; terminal projections are measured separately')
    for(const [end,amount] of [['start',nodes[0]],['end',distance(m.a,m.b)-nodes.at(-1)!]] as const)if(amount>1e-5)assert.ok(f.projections.some(q=>q.member===f.members.indexOf(m)&&q.end===end&&Math.abs(q.distance-amount)<1e-5))
    for(let i=1;i<nodes.length;i++)assert.ok(nodes[i]-nodes[i-1]<=f.rule.support+1e-5)
    assert.ok(distance(m.a,m.b)<=s.frameStock+1e-5)
  }
  for(const [i,q] of f.pedestals.entries()){
    for(const h of p.holes)assert.ok(!pointInside(h,q)&&boundaryDistance(h,q)>=diameter/2+(s.pedestalClearance??0)/1000-1e-5)
    for(let j=0;j<i;j++)assert.ok(distance(q,f.pedestals[j])>=diameter-1e-5)
  }
  assert.ok(f.boardChecks.every(q=>q.ok),'Actual installed pieces, including opening borders, pass bearing checks')
  return p
}

test('direct opening trims have real tip bearings, report spans and non-overlapping bases in both runs',()=>{
  for(const frame of ['small','big'] as const)for(const load of [3,5] as const)for(const direction of ['horizontal','vertical'] as const)for(const pedestalDiameter of [155,205]){
    audit({...DEFAULT_SETTINGS,frame,load,direction,pedestalDiameter,cutouts:[hole]})
  }
})

test('multiple square openings and shorter frame stock preserve same-level independently supported trims',()=>{
  for(const direction of ['horizontal','vertical'] as const)for(const frameStock of [1.2,3.66]){
    audit({...DEFAULT_SETTINGS,polygon:rect(0,0,6,4),board:{...DEFAULT_SETTINGS.board,stock:8},frame:'big',direction,frameStock,cutouts:[hole,{...hole,id:'second',polygon:rect(4,1,1,1)}]})
  }
})

test('sloping outside edges use same-level pedestal-supported trims in both directions and report loads',()=>{
  const outline=[{x:0,y:0},{x:3.2,y:0},{x:3.5,y:3.1},{x:0,y:2.7}]
  for(const frame of ['small','big'] as const)for(const direction of ['horizontal','vertical'] as const)for(const load of [3,5] as const)for(const pedestalDiameter of [155,205])for(const reversed of [false,true]){
    const polygon=reversed?[...outline].reverse():outline,p=audit({...DEFAULT_SETTINGS,polygon,frame,direction,load,pedestalDiameter,breakerMode:'manual',breakerPositions:[direction==='vertical'?1.55:1.75]})
    assert.ok(p.frame.members.some(m=>Math.abs(m.a.x-m.b.x)>1e-5&&Math.abs(m.a.y-m.b.y)>1e-5),'Actual angled trim is included in the frame and quantities')
    assert.ok(p.frame.members.some(m=>m.role==='collector'))
  }
})

test('square-cornered concave openings retain direct trims without bridging the void',()=>{
  const polygon=[{x:1,y:1},{x:3,y:1},{x:3,y:2},{x:2,y:2},{x:2,y:3},{x:1,y:3}]
  for(const direction of ['horizontal','vertical'] as const)for(const reversed of [false,true])audit({...DEFAULT_SETTINGS,polygon:rect(0,0,6,5),frame:'big',direction,board:{...DEFAULT_SETTINGS.board,stock:8},cutouts:[{...hole,polygon:reversed?[...polygon].reverse():polygon}]})
})

test('automatic selection can choose a direct opening frame at the unchanged low customer height',()=>{
  const original={...DEFAULT_SETTINGS,height:80,variation:0,cutouts:[hole]},s=selectAutomaticFrame(original),p=audit(s)
  assert.equal(s.height,80);assert.equal(s.variation,0);assert.equal(s.frame,'small');assert.equal(p.heightFits,true)
  const parts=structureGeometry(p,s,'joists',true)
  assert.ok(parts.filter(q=>q.kind==='joist').every(q=>q.faces.flatMap(f=>f.points).every(v=>v.z>=-(s.board.thickness+35)/1000-1e-7)),'Opening trims use the same 35 mm depth in 3D')
  const cuts=buildCsvReport('frame',p,s,{}),bases=buildCsvReport('pedestals',p,s,{})
  assert.equal(cuts.rows.length,Object.values(p.framePieces).reduce((n,a)=>n+a.length,0))
  assert.equal(bases.rows.length,p.frame.pedestals.length)
})

test('curved trims and large opening bases reflow where a complete arrangement is possible',()=>{
  const curved=planDeck({...DEFAULT_SETTINGS,frame:'small',cutouts:[{...hole,shape:'circle',polygon:ellipseOutline(1,1,16).map(q=>({x:q.x+1,y:q.y+1}))}]})
  assert.equal(curved.frame.geometryPass,true);assert.equal(curved.frame.verification.status,'provisional')
  const narrow=planDeck({...DEFAULT_SETTINGS,frame:'small',pedestalDiameter:500,board:{...DEFAULT_SETTINGS.board,width:300},cutouts:[{...hole,polygon:rect(1,1,.1,.1)}]})
  assert.equal(narrow.frame.geometryPass,true,narrow.frame.issues.join('; '))
  assert.ok(narrow.frame.pedestals.length>0)
  for(const [i,q] of narrow.frame.pedestals.entries())for(const other of narrow.frame.pedestals.slice(0,i))assert.ok(distance(q,other)>=.5-1e-5,'Large bases must actually stagger without overlapping')
})
