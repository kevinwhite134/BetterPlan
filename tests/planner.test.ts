import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, boardLayout, frameRule, inside, isBoardProfile, packCuts, planDeck, polygonArea, polygonError, spaced, pieceOutline } from '../src/planner.ts'
import { bearing, evenlySpacedBreakers, interiorAngle, moveBreaker, pointAt, projectOnEdge, setInteriorAngle, snapPoint } from '../src/editorGeometry.ts'
import { boundaryDistance, fullWidthRuns, insetPolygon, pointSegmentDistance } from '../src/deckGeometry.ts'
import type { Frame, Point, Settings } from '../src/planner.ts'

const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`)
const rectangle=(w:number,d:number):Point[]=>[{x:0,y:0},{x:w,y:0},{x:w,y:d},{x:0,y:d}]
function settings(patch:Partial<Settings>={}):Settings{return {...DEFAULT_SETTINGS,polygon:rectangle(6,3.2),board:{...DEFAULT_SETTINGS.board},...patch}}
test('all eight K-series span cases match the supplied report summaries',()=>{
  const cases:[Frame,3|5,number,number][]=[['small',3,.9,0],['small',5,.6,0],['big',3,1.9,0],['big',5,1.6,0],['small-small',3,.7,.9],['small-small',5,.8,.6],['big-small',3,1.5,.9],['big-small',5,1.5,.6]]
  for(const [frame,load,support,bearerSpacing] of cases){const r=frameRule(frame,load);close(r.support,support);close(r.bearerSpacing,bearerSpacing)}
})
test('polygon validation accepts concavity and rejects crossing, touching, duplicate and invalid corners',()=>{
  const l=[{x:0,y:0},{x:6,y:0},{x:6,y:2},{x:4,y:2},{x:4,y:4},{x:0,y:4}]
  assert.equal(polygonError(l),'');close(polygonArea(l),20)
  assert.ok(polygonError([{x:0,y:0},{x:5,y:4},{x:0,y:4},{x:5,y:0}]))
  assert.ok(polygonError([{x:0,y:0},{x:6,y:0},{x:3,y:0},{x:3,y:3},{x:0,y:3}]))
  assert.ok(polygonError([{x:0,y:0},{x:0,y:0},{x:4,y:4}]))
  assert.ok(polygonError([{x:NaN,y:0},{x:4,y:0},{x:0,y:4}]))
})
test('stock packing conserves length, accounts for kerf, and never oversubscribes a stock board',()=>{
  const stock=3.66,kerf=.003,lengths=[1.8,1.8,.7,.7,.7,3.66],bars=packCuts(lengths,stock,kerf)
  assert.equal(bars.length,3)
  for(const bar of bars)close(bar.cuts.reduce((n,c)=>n+c.length,0)+kerf*(bar.cuts.length-1)+bar.remaining,stock)
  assert.throws(()=>packCuts([3.661],stock,kerf))
})
test('economy no-butt layout uses continuous breakers and reuses stock across rows',()=>{
  const s=settings({breakerMode:'economy'}),p=planDeck(s)
  close(p.area,19.2)
  assert.ok(p.boards.bars.length<46)
  for(const piece of p.boards.pieces)assert.ok(piece.length<=s.board.stock+1e-6)
  for(const y of new Set(p.boards.pieces.filter(p=>!p.breaker).map(p=>p.y))) {
    const row=p.boards.pieces.filter(p=>!p.breaker&&p.y===y)
    assert.equal(row.length,p.boards.breakers.length+1)
  }
})
test('no-infill-butt mode splits only overlong breakers and retains single-piece breakers when stock reaches',()=>{
  const short=planDeck(settings({polygon:rectangle(6,4)})),long=planDeck(settings({polygon:rectangle(6,4),board:{...DEFAULT_SETTINGS.board,stock:4.88}}))
  assert.equal(short.boards.pieces.filter(q=>q.kind==='breaker').length,2)
  assert.equal(long.boards.pieces.filter(q=>q.kind==='breaker').length,1)
  assert.equal(short.frame.geometryPass,true)
  assert.equal(long.frame.geometryPass,true)
})
test('stock-exact deck needs no breaker; custom lengths and flipped runs recalculate',()=>{
  const p=planDeck(settings({polygon:rectangle(3.66,2)}));assert.equal(p.boards.breakers.length,0)
  const flipped=planDeck(settings({direction:'vertical'}));assert.equal(flipped.boards.breakers.length,0);close(flipped.area,19.2)
  const custom=planDeck(settings({polygon:rectangle(4.5,2),board:{...DEFAULT_SETTINGS.board,stock:5.2}}));assert.equal(custom.boards.breakers.length,0)
})
test('butt joints are staggered and every cut remains within stock',()=>{
  const s=settings({polygon:rectangle(8,4),joints:'butt'}),p=planDeck(s)
  assert.equal(p.boards.breakers.length,0)
  const first=p.boards.pieces.filter(p=>p.row===0),next=p.boards.pieces.filter(p=>p.row===1)
  assert.notEqual(first[0].length,next[0].length)
  for(const piece of p.boards.pieces)assert.ok(piece.length<=s.board.stock+1e-6)
})
test('concave and angled layouts retain full board widths and keep cuts inside the outline',()=>{
  const shapes=[[{x:0,y:0},{x:6,y:0},{x:6,y:2},{x:4,y:2},{x:4,y:3.2},{x:0,y:3.2}],[{x:0,y:0},{x:5,y:0},{x:4,y:3},{x:0,y:3}]]
  for(const polygon of shapes)for(const direction of ['horizontal','vertical'] as const){
    const s=settings({polygon,direction,joints:'butt',allowRipping:false}),p=planDeck(s)
    for(const piece of p.boards.pieces){close(piece.width,s.board.width/1000);assert.ok(piece.length<=s.board.stock+1e-6);assert.ok(pieceOutline(piece).every(q=>inside(p.p,q)))}
    assert.ok(p.frame.pedestals.every(q=>inside(p.p,q)))
  }
})
test('primary support gaps are measured along each member orientation',()=>{
  for(const frame of ['small','big','small-small','big-small'] as const)for(const load of [3,5] as const){
    const p=planDeck(settings({frame,load,joints:'butt'})),r=p.frame.rule
    assert.equal(p.frame.layoutStatus,'ready')
    for(const m of p.frame.members.filter(m=>m.kind===(r.bearer?'bearer':'joist'))){
      const support=p.frame.pedestals.filter(q=>pointSegmentDistance(q,m.a,m.b)<1e-6).map(q=>Math.hypot(q.x-m.a.x,q.y-m.a.y)).sort((a,b)=>a-b)
      for(const [end,amount] of [['start',support[0]],['end',Math.hypot(m.b.x-m.a.x,m.b.y-m.a.y)-support.at(-1)!]] as const)if(amount>1e-6)assert.ok(p.frame.projections.some(q=>q.member===p.frame.members.indexOf(m)&&q.end===end&&Math.abs(q.distance-amount)<1e-5))
      for(let i=1;i<support.length;i++)assert.ok(support[i]-support[i-1]<=r.support+1e-6)
    }
  }
})

test('height range uses one consistent primary support elevation',()=>{
  const p=planDeck(settings());close(p.range.min,90);close(p.range.max,130);assert.equal(p.heightFits,true)
  assert.equal(planDeck(settings({height:100})).heightFits,false)
})
test('invalid numeric values and imported enums are rejected before calculation',()=>{
  assert.throws(()=>planDeck(settings({joistSpacing:1501})),/Joist centres/)
  assert.throws(()=>planDeck(settings({board:{...DEFAULT_SETTINGS.board,stock:NaN}})),/Board length/)
  assert.throws(()=>planDeck(settings({load:4 as 3})),/Invalid direction/)
  assert.throws(()=>planDeck(settings({pedestalMin:500,pedestalMax:100})),/maximum/)
  assert.throws(()=>planDeck(null as unknown as Settings),/Invalid project/)
})
test('spacing includes both endpoints and never exceeds the limit',()=>{const values=spaced(.13,3.72,.9);close(values[0],.13);close(values.at(-1)!,3.72);for(let i=1;i<values.length;i++)assert.ok(values[i]-values[i-1]<=.900001)})
test('short custom stock can still plan a long deck with many breaker bays',()=>{const s=settings({polygon:rectangle(12,.3),board:{...DEFAULT_SETTINGS.board,stock:.3}});assert.ok(boardLayout(s.polygon,s).breakers.length>20)})
test('saved board profiles require complete, valid product dimensions and colour data',()=>{
  assert.equal(isBoardProfile(DEFAULT_SETTINGS.board),true)
  for(const invalid of [null,{}, {...DEFAULT_SETTINGS.board,colour:'not-a-colour'}, {...DEFAULT_SETTINGS.board,stock:-1}, {...DEFAULT_SETTINGS.board,width:'136'}, {...DEFAULT_SETTINGS.board,endGap:0}])assert.equal(isBoardProfile(invalid),false)
})
test('balanced is the default, with one centred breaker instead of extra asymmetric lines',()=>{
  const p=planDeck(settings()),economy=planDeck(settings({breakerMode:'economy'}))
  assert.deepEqual(p.boards.breakers,[3])
  assert.ok(p.boards.breakers.length<economy.boards.breakers.length)
  assert.ok(p.boards.bars.length>=economy.boards.bars.length)
  const longer=planDeck(settings({polygon:rectangle(10,3)}))
  close(longer.boards.breakers[0]+longer.boards.breakers[1],10)
  const bays=longer.boards.pieces.filter(p=>p.row===0).map(p=>p.length)
  for(const length of bays)close(length,bays[0])
})
test('manual breakers are honoured exactly and forbid hidden butt joints',()=>{
  const p=planDeck(settings({breakerMode:'manual',breakerPositions:[3.2]}))
  assert.deepEqual(p.boards.breakers,[3.2])
  assert.throws(()=>planDeck(settings({breakerMode:'manual',breakerPositions:[1]})),/bay exceeds/)
  assert.throws(()=>planDeck(settings({breakerMode:'manual',breakerPositions:[]})),/bay exceeds/)
  assert.throws(()=>planDeck(settings({breakerMode:'manual',breakerPositions:[3,3.1]})),/overlap/)
  assert.throws(()=>planDeck(settings({breakerMode:'manual',breakerPositions:[-.2]})),/inside/)
  assert.throws(()=>planDeck(settings({breakerMode:'manual',breakerPositions:[Infinity]})),/finite distances/)
})
test('breakers on concave outlines produce disjoint pieces without bridging cut-outs',()=>{
  const p=planDeck(settings({polygon:[{x:0,y:0},{x:6,y:0},{x:6,y:3},{x:4,y:3},{x:4,y:1},{x:2,y:1},{x:2,y:3},{x:0,y:3}],breakerMode:'balanced'}))
  assert.deepEqual(p.boards.breakers,[3])
  const breaker=p.boards.pieces.filter(p=>p.breaker)
  assert.equal(breaker.length,1);close(breaker[0].length,.718)
  assert.ok(p.frame.pedestals.every(q=>inside(p.p,q)))
})
test('bearings and exact edges use 0 right, 90 up and preserve arbitrary angles',()=>{
  close(bearing({x:0,y:0},{x:1,y:0}),0);close(bearing({x:0,y:0},{x:0,y:-1}),90)
  assert.deepEqual(pointAt({x:2,y:3},2,90),{x:2,y:1})
  assert.deepEqual(pointAt({x:0,y:0},Math.SQRT2,45),{x:1,y:-1})
  assert.deepEqual(snapPoint({x:1.26,y:.73},.1),{x:1.3,y:.7})
  const snapped=snapPoint({x:1.2,y:-1.05},0,{x:0,y:0},45);close(bearing({x:0,y:0},snapped),45)
})
test('interior-angle editing supports either winding and concave reflex corners',()=>{
  const p=rectangle(4,3)
  for(let i=0;i<p.length;i++)close(interiorAngle(p,i),90)
  for(const shape of [p,p.toReversed()]){const next=setInteriorAngle(shape,1,135);assert.equal(polygonError(next),'');close(interiorAngle(next,1),135)}
  const l=[{x:0,y:0},{x:4,y:0},{x:4,y:2},{x:2,y:2},{x:2,y:4},{x:0,y:4}]
  close(interiorAngle(l,3),270)
})
test('edge insertion projects onto the segment and preserves polygon area',()=>{
  const p=rectangle(4,3),q=projectOnEdge({x:1.5,y:.4},p[0],p[1])
  assert.deepEqual(q,{x:1.5,y:0});const inserted=[p[0],q,...p.slice(1)]
  assert.equal(polygonError(inserted),'');close(polygonArea(inserted),12)
  assert.deepEqual(projectOnEdge({x:10,y:0},p[0],p[1]),p[1])
})
test('manual mirror edits preserve pairs, centre lines and equal clear-width bays',()=>{
  assert.deepEqual(moveBreaker([2,4],0,2.3,6,true),[2.3,3.7])
  assert.deepEqual(moveBreaker([2],0,2.3,6,true),[2.3,3.7])
  assert.deepEqual(moveBreaker([3],0,3.2,6,true),[3])
  const lines=evenlySpacedBreakers(6,2,.146)
  close(lines[0]+lines[1],6)
  const a=lines[0]-.073,b=lines[1]-lines[0]-.146,c=6-lines[1]-.073
  assert.ok(Math.abs(a-b)<.002&&Math.abs(b-c)<.002)
})

test('picture-frame boards follow all four edges and are included in purchasing stock',()=>{
  const p=planDeck(settings()),rim=p.boards.pieces.filter(q=>q.kind==='perimeter')
  assert.equal(rim.length,6)
  assert.ok(rim.every(q=>q.outline&&q.outline.length>=3&&q.width===.136))
  const cuts=p.boards.bars.flatMap(b=>b.cuts.map(c=>c.piece))
  assert.equal(cuts.length,p.boards.pieces.length)
  for(const q of rim)assert.ok(cuts.includes(p.boards.pieces.indexOf(q)))
  assert.throws(()=>planDeck(settings({perimeterJoints:false})),/Perimeter edge/)
})
test('no last-row rip is generated: a non-fitting rectangle reports the real remainder',()=>{
  const p=planDeck(settings({allowRipping:false}))
  assert.equal(p.boards.fit.rows,20);close(p.boards.fit.edgeGap,.0515)
  assert.equal(p.boards.fit.needsAdjustment,true)
  assert.deepEqual(p.boards.fit.targetDepths,[3.097,3.238])
  assert.ok(p.boards.pieces.every(q=>q.width===.136))
})
test('the suggested fitting dimension uses whole board rows between perimeter boards',()=>{
  for(const depth of [3.097,3.238]){const p=planDeck(settings({polygon:rectangle(6,depth)}));close(p.boards.fit.edgeGap,0);assert.equal(p.boards.fit.needsAdjustment,false);assert.ok(p.boards.pieces.every(q=>q.width===.136))}
})
test('full-width row generation does not turn a horizontal recess into a ripped filler',()=>{
  const u=[{x:0,y:0},{x:6,y:0},{x:6,y:3},{x:4,y:3},{x:4,y:1},{x:2,y:1},{x:2,y:3},{x:0,y:3}]
  const runs=fullWidthRuns(u,.95,1.086)
  assert.equal(runs.length,2);close(runs[0][1],2);close(runs[1][0],4)
})
test('narrow outlines fail explicitly instead of creating overlapping perimeter boards',()=>{
  assert.throws(()=>planDeck(settings({polygon:rectangle(6,.2)})),/too narrow/)
  assert.throws(()=>insetPolygon(rectangle(.2,.2),.141),/too narrow/)
})
test('all pedestal bases stay on the footprint and attached to the primary load path',()=>{
  for(const frame of ['small','big','small-small','big-small'] as const)for(const load of [3,5] as const){
    const p=planDeck(settings({frame,load})),primary=p.frame.members.filter(m=>m.kind===(p.frame.rule.bearer?'bearer':'joist'))
    for(const q of p.frame.pedestals){assert.ok(boundaryDistance(p.p,q)>=.075-1e-5);assert.ok(primary.some(m=>pointSegmentDistance(q,m.a,m.b)<1e-5))}
    assert.ok(p.frame.maxPrimarySpan<=p.frame.rule.support+1e-5)
    assert.ok(!p.frame.rule.bearer||p.frame.maxSecondarySpan<=p.frame.rule.bearerSpacing+1e-5)
  }
})
test('two-tier starter grid has no extra perimeter pedestal tier and passes its geometry checks',()=>{
  const p=planDeck(settings())
  assert.equal(p.frame.pedestals.length,25)
  assert.equal(p.frame.geometryPass,true)
  assert.ok(p.frame.checks.every(c=>c.ok))
  close(p.range.max-p.range.min,2*DEFAULT_SETTINGS.variation)
})
test('stock splices have bearings and every scheduled frame member fits its purchasing stock',()=>{
  const p=planDeck(settings({frameStock:1.2}))
  assert.ok(p.frame.splices.length>0)
  assert.ok(p.frame.members.every(m=>Math.hypot(m.a.x-m.b.x,m.a.y-m.b.y)<=1.2+1e-6))
  assert.equal(p.frame.checks.find(c=>c.name==='Joist bearings and stock splices')?.ok,true)
})
test('physically incompatible direct pedestals produce an explicit unresolved layout',()=>{
  const p=planDeck(settings({frame:'small',pedestalDiameter:200,breakerWidth:'single',joistOverhang35:0}))
  assert.equal(p.frame.checks.find(c=>c.name==='Pedestal bases do not overlap')?.ok,false)
  assert.equal(p.frame.geometryPass,false)
  assert.equal(p.frame.layoutStatus,'unbuildable');assert.equal(p.frame.pedestals.length,0);assert.equal(p.frame.members.length,0);assert.ok(p.frame.issues.some(i=>i.includes('bearer + joist')))
})
test('full-height skirting is a separate material and an over-tall product is flagged',()=>{
  const a=planDeck(settings({skirting:false})),b=planDeck(settings({skirting:true,skirtingHeight:200,skirtingRows:1})),c=planDeck(settings({skirting:true,skirtingHeight:300,skirtingRows:1}))
  assert.ok(!a.materials.some(m=>m.key==='skirting'));assert.ok(b.materials.some(m=>m.key==='skirting'&&m.qty>0));close(b.skirtingGap,25)
  assert.ok(c.skirtingGap<0);assert.ok(c.warnings.some(w=>w.includes('below the ground')))
})
test('new pedestal and skirting inputs reject invalid product dimensions',()=>{
  assert.throws(()=>planDeck(settings({pedestalDiameter:0})),/base diameter/)
  assert.throws(()=>planDeck(settings({pedestalClearance:-1})),/edge clearance/)
  assert.throws(()=>planDeck(settings({skirtingHeight:NaN})),/Fascia board/)
})

test('perimeter stock joints use actual joists and blocking without an automatic upper rim',()=>{
  const p=planDeck(settings({polygon:rectangle(6,5),joints:'butt'}))
  assert.ok(p.boards.perimeterSplices.length>=4)
  assert.equal(p.frame.geometryPass,true,p.frame.issues.join('; '))
  assert.ok(p.frame.members.filter(m=>m.kind==='rim').every(m=>m.role==='edge-rail'))
  assert.equal(p.frame.checks.find(c=>c.name==='Decking stock-joint bearings')?.ok,true)
  const short=planDeck(settings({frameStock:1.2}))
  assert.equal(short.frame.checks.find(c=>c.name==='Pedestal bases do not overlap')?.ok,true)
})
test('narrow perimeter products retain measured provisional projections instead of moving the bearing rail behind the base',()=>{
  const p=planDeck(settings({board:{...DEFAULT_SETTINGS.board,width:60}}))
  assert.equal(p.frame.geometryPass,true,p.frame.issues.join('; '))
  assert.ok(p.frame.projections.length>0);assert.equal(p.frame.verification.status,'provisional')
})
test('angled two-tier edges use only required collectors and record unverified connections',()=>{
  const shapes=[[{x:0,y:2},{x:2,y:0},{x:4,y:2},{x:2,y:4}],[{x:0,y:0},{x:5,y:0},{x:4,y:3},{x:0,y:3}]]
  for(const polygon of shapes){const p=planDeck(settings({polygon,joints:'butt'}))
    assert.equal(p.frame.geometryPass,true,p.frame.issues.join('; '))
    assert.ok(p.frame.members.some(m=>m.role==='collector'));assert.ok(p.frame.members.filter(m=>m.kind==='rim').every(m=>m.role==='edge-rail'))
    assert.ok(p.frame.connections.length>0);assert.ok(p.frame.connections.every(c=>c.status==='unverified'))
  }
})

test('a breaker can split an angled edge into tapered pieces without a straight full-length rip',()=>{
  const phase=31*Math.PI/180,polygon=Array.from({length:3},(_,i)=>({x:3+3*Math.cos(phase+i*2*Math.PI/3),y:3+2.5*Math.sin(phase+i*2*Math.PI/3)}))
  const tapered=planDeck(settings({polygon,joints:'breaker'}));assert.ok(tapered.boards.fit.taperedPieces>0);assert.equal(tapered.frame.geometryPass,true)
  const p=planDeck(settings({polygon,joints:'breaker',board:{...DEFAULT_SETTINGS.board,stock:4.88}}))
  assert.equal(p.frame.geometryPass,true)
})
