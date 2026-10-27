import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, planDeck, validateSettings } from '../src/planner.ts'
import type { Point, Settings } from '../src/planner.ts'
import { breakerBoardCount, breakerBoardCentres, breakerRailOffset, breakerStripWidth } from '../src/breakerWidth.ts'

const TOL=2e-5
const rect=(w:number,d:number):Point[]=>[{x:0,y:0},{x:w,y:0},{x:w,y:d},{x:0,y:d}]
const separation=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y)
function edgeDistance(q:Point,a:Point,b:Point){
  const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((q.x-a.x)*dx+(q.y-a.y)*dy)/(dx*dx+dy*dy)))
  return Math.hypot(q.x-a.x-t*dx,q.y-a.y-t*dy)
}
function auditDirect(s:Settings){
  const p=planDeck(s),f=p.frame,diameter=(s.pedestalDiameter??150)/1000
  assert.equal(f.geometryPass,true,f.issues.join('; '))
  assert.equal(f.rule.bearer,0)
  const joists=f.members.filter(m=>m.kind==='joist')
  for(const m of joists){
    const len=separation(m.a,m.b),nodes=f.pedestals.filter(q=>edgeDistance(q,m.a,m.b)<TOL).map(q=>separation(m.a,q)).sort((a,b)=>a-b)
    assert.ok(nodes.length>=1,'Every primary stock segment has a real bearing')
    for(const [end,amount] of [['start',nodes[0]],['end',len-nodes.at(-1)!]] as const)if(amount>TOL)assert.ok(f.projections.some(q=>q.member===f.members.indexOf(m)&&q.end===end&&Math.abs(q.distance-amount)<TOL))
    for(let i=1;i<nodes.length;i++)assert.ok(nodes[i]-nodes[i-1]<=f.rule.support+TOL,'Actual primary support span respects the report')
  }
  for(let i=0;i<f.pedestals.length;i++)for(let j=0;j<i;j++)assert.ok(separation(f.pedestals[i],f.pedestals[j])>=diameter-TOL,'Actual base discs do not overlap')
  for(const m of f.members){assert.ok(separation(m.a,m.b)<=s.frameStock+TOL);if(m.kind==='noggin'){
    assert.ok(separation(m.a,m.b)<=.4+TOL,'Transverse support has a checked short span')
    assert.ok([m.a,m.b].some(q=>f.members.some(j=>j!==m&&j.kind!=='bearer'&&edgeDistance(q,j.a,j.b)<TOL)),'Blocking has a real connected end; capacity remains provisional')
  }}
  // Check row support for every individual stock breaker board independently.
  const contact=(s.frameFaceWidth??35)/2000-(s.boardEndBearing??10)/1000
  for(const piece of p.boards.pieces.filter(q=>q.kind==='breaker')){
    const x=piece.x+piece.width/2,rows=f.members.filter(m=>m.kind==='noggin'&&x>=Math.min(m.a.x,m.b.x)-TOL&&x<=Math.max(m.a.x,m.b.x)+TOL).map(m=>m.a.y).filter(y=>y>=piece.y-contact-TOL&&y<=piece.y+piece.length+contact+TOL).sort((a,b)=>a-b)
    assert.ok(rows.length>=2&&Math.abs(rows[0]-piece.y)<=contact+TOL&&Math.abs(rows.at(-1)!-piece.y-piece.length)<=contact+TOL,'Every breaker end has real full-width support')
    for(let i=1;i<rows.length;i++)assert.ok(rows[i]-rows[i-1]<=s.joistSpacing/1000+TOL,'Breaker boards have the selected support centres')
  }
  return p
}

test('automatic paired breakers use actual board and gap dimensions only when direct bases need room',()=>{
  const s={...DEFAULT_SETTINGS,frame:'small' as const,pedestalDiameter:155}
  assert.equal(breakerBoardCount(s),2)
  assert.equal(breakerStripWidth(s),.277)
  assert.equal(breakerRailOffset(s),.14350000000000002)
  assert.deepEqual(breakerBoardCentres(s,3),[2.9295,3.0705])
  assert.equal(breakerBoardCount({...s,pedestalDiameter:146}),1)
  assert.equal(breakerBoardCount({...s,frame:'small-small'}),1)
  assert.equal(breakerBoardCount({...s,breakerWidth:'single'}),1)
  assert.equal(breakerBoardCount({...s,frame:'big-small',breakerWidth:'double'}),2)
})

test('ordinary direct-frame rectangles pass real base, stock, bearing and report span checks with paired breakers',()=>{
  for(const frame of ['small','big'] as const)for(const load of [3,5] as const)for(const direction of ['horizontal','vertical'] as const)for(const pedestalDiameter of [155,190,205]){
    const polygon=direction==='horizontal'?rect(6,4):rect(4,6),s={...DEFAULT_SETTINGS,polygon,frame,load,direction,pedestalDiameter},p=auditDirect(s)
    assert.equal(p.boards.breakers.length,1)
    assert.equal(p.boards.pieces.filter(q=>q.kind==='breaker').length,4,'Two boards each need exactly one stock joint')
    for(const piece of p.boards.pieces.filter(q=>q.kind==='breaker'))assert.ok(Math.abs(piece.width-s.board.width/1000)<TOL)
    const centre=p.boards.breakers[0],half=breakerStripWidth(s)/2
    for(const piece of p.boards.pieces.filter(q=>q.kind==='infill'))assert.ok(piece.x+piece.length<=centre-half-s.board.endGap/1000+TOL||piece.x>=centre+half+s.board.endGap/1000-TOL,'No artificial infill sliver appears between paired boards')
    assert.equal(p.boards.bars.reduce((n,b)=>n+b.cuts.length,0),p.boards.pieces.length,'Every physical board piece appears in the stock schedule')
  }
})

test('paired breaker boards stay continuous whenever their own stock is long enough',()=>{
  for(const stock of [1.2,3.66,4.88])for(const delta of [-.001,0,.001]){
    const across=stock+delta+.282,s={...DEFAULT_SETTINGS,frame:'big' as const,polygon:rect(2*stock,across),board:{...DEFAULT_SETTINGS.board,stock}},p=planDeck(s)
    const perBoard=delta>0?2:1
    assert.equal(p.boards.pieces.filter(q=>q.kind==='breaker').length,2*perBoard*p.boards.breakers.length)
    assert.ok(p.boards.pieces.every(q=>q.length<=stock+TOL))
  }
})

test('square inside corners and stepped breaker ends retain direct joist supports in either run direction',()=>{
  const L=[{x:0,y:0},{x:6,y:0},{x:6,y:2},{x:4,y:2},{x:4,y:4},{x:0,y:4}]
  for(const winding of [L,[...L].reverse()])for(const mirror of [false,true])for(const frame of ['small','big'] as const)for(const direction of ['horizontal','vertical'] as const){
    const polygon=winding.map(q=>({x:mirror?6-q.x:q.x,y:q.y}))
    auditDirect({...DEFAULT_SETTINGS,polygon,frame,direction,pedestalDiameter:205})
  }
})

test('narrow selected centres do not add a colliding primary rail inside a perpendicular breaker ladder',()=>{
  auditDirect({...DEFAULT_SETTINGS,frame:'small',pedestalDiameter:190,joistSpacing:200})
  const impossible=planDeck({...DEFAULT_SETTINGS,frame:'small',pedestalDiameter:205,joistSpacing:200})
  assert.equal(impossible.frame.geometryPass,true,'Staggering along the joists can separate bases wider than the selected centres')
  for(const [i,a] of impossible.frame.pedestals.entries())for(let j=0;j<i;j++)assert.ok(separation(a,impossible.frame.pedestals[j])>=.205-TOL)
})

test('automatic direct breakers share an actual inside-edge joist when a nearby corner would crowd its pedestal base',()=>{
  const L=[{x:0,y:0},{x:4.2,y:0},{x:4.2,y:3.3},{x:2,y:3.3},{x:2,y:1.4},{x:0,y:1.4}]
  for(const boardWidth of [136,156])for(const frame of ['small','big'] as const)for(const direction of ['horizontal','vertical'] as const)for(const mirror of [false,true])for(const reverse of [false,true]){
    const shape=reverse?[...L].reverse():L,polygon=shape.map(q=>({x:mirror?4.2-q.x:q.x,y:q.y}))
    const s={...DEFAULT_SETTINGS,polygon,frame,direction,height:300,variation:20,pedestalDiameter:205,board:{...DEFAULT_SETTINGS.board,width:boardWidth}}
    const p=auditDirect(s)
    if(boardWidth===156&&direction==='horizontal'&&!mirror&&!reverse){
      assert.ok(Math.abs(p.boards.breakers[0]-2.1)<.15,'Keep a nearby checked automatic layout; supports may stagger instead of forcing the old trim-sharing position')
    }
  }
  const manual=planDeck({...DEFAULT_SETTINGS,polygon:L,frame:'small',pedestalDiameter:205,board:{...DEFAULT_SETTINGS.board,width:156},breakerMode:'manual',breakerPositions:[2.1]})
  assert.deepEqual(manual.boards.breakers,[2.1])
  assert.equal(manual.frame.layoutStatus,'ready','The requested breaker stays fixed while actual pedestal positions stagger to resolve its former conflict')
})

test('explicit single breakers and direct-frame edge restrictions remain explicit',()=>{
  const s={...DEFAULT_SETTINGS,frame:'small' as const,pedestalDiameter:205,breakerWidth:'single' as const},single=planDeck(s)
  assert.equal(single.frame.geometryPass,true,single.frame.issues.join('; '))
  assert.ok(single.frame.pedestals.length>0,'An explicit single breaker can use staggered bases when span checks permit it')
  assert.equal(single.boards.pieces.filter(q=>q.kind==='breaker').length,1,'A manual single width never silently becomes a pair')
  const angled=planDeck({...DEFAULT_SETTINGS,frame:'big',polygon:[{x:0,y:0},{x:6,y:0},{x:5,y:4},{x:0,y:4}]})
  assert.equal(angled.frame.geometryPass,true,angled.frame.issues.join('; '))
  const hole=planDeck({...DEFAULT_SETTINGS,frame:'big',polygon:rect(6,4),cutouts:[{id:'one',name:'Opening',polygon:[{x:2,y:1},{x:3,y:1},{x:3,y:2},{x:2,y:2}]}]})
  assert.equal(hole.frame.geometryPass,true,hole.frame.issues.join('; '))
  assert.ok(validateSettings({...DEFAULT_SETTINGS,breakerWidth:'triple' as Settings['breakerWidth']}))
  assert.ok(validateSettings({...DEFAULT_SETTINGS,selectionObjective:'random' as Settings['selectionObjective']}))
})
