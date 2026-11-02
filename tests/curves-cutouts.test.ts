import { FRAME_FACE_COLOURS } from '../src/frameColours.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import clipping from 'polygon-clipping'
import type { Polygon } from 'polygon-clipping'
import { DEFAULT_SETTINGS, planDeck, polygonArea, polygonError, validateSettings } from '../src/planner.ts'
import type { Cutout, Settings } from '../src/planner.ts'
import { boardRings, curveEdge, ellipseOutline, memberCrossesOpening, roundedOutline, subtractCutouts } from '../src/shapeGeometry.ts'
import { boundaryDistance, pointInside } from '../src/deckGeometry.ts'
import { installerDrawing, installerPlan, installerSvg } from '../src/installerPlan.ts'
import { buildCsvReport } from '../src/csvExport.ts'
import { structureGeometry } from '../src/structureGeometry.ts'
import { deckPreviewSvg } from '../src/deckPreview.ts'
import { selectAutomaticFrame } from '../src/frameRecommendation.ts'

const rectangle:Cutout={id:'planter',name:'Planter',shape:'rectangle',polygon:[{x:1,y:1},{x:2,y:1},{x:2,y:2},{x:1,y:2}]}
const base:Settings={...DEFAULT_SETTINGS,frame:'small-small',pedestalDiameter:155,cutouts:[rectangle]}
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`)
const geometry=(ring:{x:number;y:number}[]):Polygon=>[ring.map(p=>[p.x,p.y])]

for(const [name,polygon] of [['circle',ellipseOutline(6,6)],['oval',ellipseOutline(6,4)],['rounded rectangle',roundedOutline(6,4,.75,4)],['custom arc',curveEdge([{x:0,y:0},{x:6,y:0},{x:6,y:4},{x:0,y:4}],0,.5,8)]] as const){
  test(`${name} retains valid cut boards and a checked frame`,()=>{
    for(const direction of ['horizontal','vertical'] as const){
      const s={...DEFAULT_SETTINGS,polygon,direction,frame:'big-small' as const,pedestalDiameter:155},p=planDeck(s)
      assert.equal(polygonError(polygon),'');assert.equal(p.frame.geometryPass,true,p.frame.issues.join('\n'))
      assert.ok(p.boards.pieces.every(b=>b.length<=s.board.stock+1e-7))
      close(p.area,polygonArea(polygon))
    }
  })
}
test('arc bulge is exact at the midpoint in both directions and endpoints stay fixed',()=>{
  const p=[{x:0,y:0},{x:6,y:0},{x:6,y:4},{x:0,y:4}]
  for(const sign of [-1,1]){const arc=curveEdge(p,0,sign*.5,8);assert.deepEqual(arc[0],p[0]);assert.deepEqual(arc[8],p[1]);close(arc[4].x,3);close(arc[4].y,-sign*.5);assert.equal(polygonError(arc),'')}
  assert.throws(()=>curveEdge(p,0,0),/bulge/)
})
test('cutouts remove actual board material, preserve perimeter borders, and repack real blanks in both directions',()=>{
  const original=JSON.stringify(base)
  for(const direction of ['horizontal','vertical'] as const){
    const s={...base,direction},p=planDeck(s),hole=p.holes[0]
    close(p.area,polygonArea(s.polygon)-1)
    for(const piece of p.boards.pieces){
      const rings=boardRings(piece).map(r=>r.map(q=>[q.x,q.y] as [number,number]))
      assert.equal(clipping.intersection(rings,geometry(hole)).length,0,'no installed board occupies the clear opening')
    }
    assert.ok(p.boards.pieces.some(b=>b.axis),'opening has separately counted perimeter boards')
    const packed=p.boards.bars.flatMap(b=>b.cuts.map(c=>c.piece)).sort((a,b)=>a-b)
    assert.deepEqual(packed,p.boards.pieces.map((_,i)=>i),'every new piece is scheduled exactly once')
    assert.ok(p.boards.pieces.every(b=>b.length<=s.board.stock+1e-7))
  }
  assert.equal(JSON.stringify(base),original)
})
test('rectangular and round openings have real trim supports and no member or base in the void',()=>{
  for(const polygon of [rectangle.polygon,ellipseOutline(1,1,16).map(q=>({x:q.x+1,y:q.y+1}))])for(const direction of ['horizontal','vertical'] as const){
    const s={...base,direction,cutouts:[{...rectangle,polygon}]},p=planDeck(s)
    assert.equal(p.frame.geometryPass,true,p.frame.issues.join('\n'))
    for(const m of p.frame.members)assert.equal(memberCrossesOpening(m,p.holes,(s.frameFaceWidth??35)/1000),false)
    for(const q of p.frame.pedestals){assert.ok(!pointInside(p.holes[0],q));assert.ok(boundaryDistance(p.holes[0],q)>=(s.pedestalDiameter??150)/2000-1e-5)}
    for(let i=0;i<p.frame.pedestals.length;i++)for(let j=0;j<i;j++)assert.ok(Math.hypot(p.frame.pedestals[i].x-p.frame.pedestals[j].x,p.frame.pedestals[i].y-p.frame.pedestals[j].y)>=(s.pedestalDiameter??150)/1000-1e-5)
  }
})
test('automatic selection respects the customer height and chooses a complete opening frame',()=>{
  const s=selectAutomaticFrame({...base,frameSelection:'auto',pedestalSelection:'auto'}),p=planDeck(s)
  close(s.height,base.height);close(s.variation,base.variation)
  assert.equal(p.frame.geometryPass,true);assert.equal(p.heightFits,true)
})
test('round direct-joist openings can use straight headers with provisional connection details',()=>{
  const p=planDeck({...base,frame:'small',cutouts:[{...rectangle,polygon:ellipseOutline(1,1,16).map(q=>({x:q.x+1,y:q.y+1}))}]})
  assert.equal(p.frame.geometryPass,true,p.frame.issues.join('; '));assert.ok(p.frame.members.length>0)
  assert.ok(p.frame.verification.notes.some(q=>q.includes('connections')))
  for(const m of p.frame.members)assert.equal(memberCrossesOpening(m,p.holes,p.frame.faceWidth),false)
})
test('outside, overlapping, nested and self-crossing holes cannot be imported or applied',()=>{
  const cases=[{...rectangle,polygon:rectangle.polygon.map(p=>({...p,x:p.x+5}))},{...rectangle,polygon:[{x:1,y:1},{x:2,y:2},{x:2,y:1},{x:1,y:2}]}]
  for(const h of cases)assert.ok(validateSettings({...base,cutouts:[h]}))
  assert.match(validateSettings({...base,cutouts:[rectangle,{...rectangle,id:'other'}]}),/between cutouts/)
  assert.match(validateSettings({...base,cutouts:[rectangle,{id:'nested',name:'Nested',polygon:[{x:1.2,y:1.2},{x:1.8,y:1.2},{x:1.8,y:1.8},{x:1.2,y:1.8}]}]}),/between cutouts/)
  assert.match(validateSettings({...base,allowRipping:false}),/ripped and notched/)
  assert.ok(validateSettings({...base,cutouts:[rectangle,rectangle]}))
})
test('a notch and a contained hole produce appropriate separate cutting blanks',()=>{
  const piece={x:0,y:0,length:3,width:.136,breaker:false,row:0,kind:'infill' as const}
  const small=[{x:1,y:.03},{x:1.1,y:.03},{x:1.1,y:.1},{x:1,y:.1}]
  const punched=subtractCutouts([piece],[small]);assert.equal(punched.length,1);assert.equal(punched[0].holes?.length,1);close(punched[0].length,3)
  const split=subtractCutouts([piece],[[{x:1,y:-1},{x:2,y:-1},{x:2,y:1},{x:1,y:1}]])
  assert.equal(split.length,2);close(split.reduce((n,p)=>n+p.length,0),2)
})
test('cutout positions use the same physical datum in project CSV, measured drawing and quote render',()=>{
  for(const direction of ['horizontal','vertical'] as const){
    const s={...base,direction},p=planDeck(s),model=installerPlan(p,s),svg=installerSvg(model),csv=buildCsvReport('project',p,s,{})
    assert.deepEqual(model.cutouts[0].points,rectangle.polygon.map(q=>({x:q.x*1000,y:q.y*1000})))
    assert.ok(svg.includes('H-01'));assert.ok(svg.includes('1000 x 1000'))
    assert.ok(installerDrawing(model).marks.some(m=>m.type==='text'&&m.text==='H-01'))
    assert.ok(csv.rows.some(r=>r[0]==='Cutout'&&r[1]==='H1 point 1 X'&&r[2]===1000))
    assert.ok(deckPreviewSvg(p,s).includes('fill-rule="evenodd"'))
    const translated={...s,polygon:s.polygon.map(q=>({x:q.x-2,y:q.y-3})),cutouts:s.cutouts!.map(h=>({...h,polygon:h.polygon.map(q=>({x:q.x-2,y:q.y-3}))}))}
    assert.deepEqual(planDeck(translated).holes,p.holes)
  }
})
test('3D role colours apply only to metal parts; pedestal materials and geometry are retained',()=>{
  const p=planDeck(base),parts=structureGeometry(p,base,'joists',true)
  for(const part of parts){
    if(part.kind==='pedestal'){assert.ok(part.faces.some(f=>f.fill==='#303c32'));continue}
    for(const face of part.faces)assert.ok((FRAME_FACE_COLOURS[part.kind] as readonly string[]).includes(face.fill),'shared role shading')
  }
})
