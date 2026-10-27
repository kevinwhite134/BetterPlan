import test from 'node:test'
import assert from 'node:assert/strict'
import clipping from 'polygon-clipping'
import type { MultiPolygon, Polygon } from 'polygon-clipping'
import { DEFAULT_SETTINGS, bounds, normalize, pieceOutline, planBoardsOnly, polygonArea, validateSettings } from '../src/planner.ts'
import type { Point, Settings } from '../src/planner.ts'
import { boardInfillPolygon } from '../src/perimeterEdges.ts'
import { pointSegmentDistance } from '../src/deckGeometry.ts'
import { deckSizeOptions } from '../src/deckSizing.ts'

const rect=[{x:0,y:0},{x:6,y:0},{x:6,y:4},{x:0,y:4}]
const base:Settings={...DEFAULT_SETTINGS,polygon:rect,board:{...DEFAULT_SETTINGS.board,stock:15},perimeterJoints:true}
const close=(a:number,b:number,tol=1e-6)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`)
const ring=(p:Point[]):Polygon=>[p.map(q=>[q.x,q.y])]
const geometryArea=(shapes:MultiPolygon)=>shapes.reduce((sum,p)=>sum+p.reduce((n,r,i)=>n+(i?-1:1)*Math.abs(r.reduce((a,q,j)=>{const b=r[(j+1)%r.length];return a+q[0]*b[1]-b[0]*q[1]},0))/2,0),0)
function audit(s:Settings){
  const boards=planBoardsOnly(s),p=normalize(s.polygon).map(q=>s.direction==='vertical'?{x:q.y,y:q.x}:q)
  const shapes=boards.pieces.map(piece=>ring(pieceOutline(piece))),union=clipping.union(...shapes)
  close(geometryArea(clipping.difference(union,ring(p))),0)
  assert.ok(Math.abs(geometryArea(union)-boards.pieces.reduce((n,q)=>n+polygonArea(pieceOutline(q)),0))<1e-6,'Installed board polygons must not overlap')
  for(const piece of boards.pieces)assert.ok(piece.length<=s.board.stock+1e-7)
  const ids=boards.bars.flatMap(b=>b.cuts.map(c=>c.piece)).sort((a,b)=>a-b)
  assert.deepEqual(ids,boards.pieces.map((_,i)=>i))
  for(const bar of boards.bars)close(bar.cuts.reduce((n,c)=>n+c.length,0)+Math.max(0,bar.cuts.length-1)*s.kerf/1000+bar.remaining,s.board.stock)
  const selected=s.perimeterEdges??s.polygon.map(()=>true)
  const inner=boardInfillPolygon(s),g=s.board.gap/1000,w=s.board.width/1000
  for(const [i,a] of inner.entries()){
    const b=inner[(i+1)%inner.length],mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2}
    close(pointSegmentDistance(mid,p[i],p[(i+1)%p.length]),(selected[i]?w:0)+g)
  }
  const infill=boards.pieces.filter(q=>q.kind==='infill'),rows=[...new Set(infill.map(q=>q.row))].sort((a,b)=>a-b)
  const extents=rows.map(row=>{const ys=infill.filter(q=>q.row===row).flatMap(q=>pieceOutline(q).map(p=>p.y));return {min:Math.min(...ys),max:Math.max(...ys)}})
  const minX=Math.min(...inner.map(q=>q.x))-1,maxX=Math.max(...inner.map(q=>q.x))+1
  let gapArea=0
  for(let i=1;i<extents.length;i++){
    const top=extents[i-1].max,bottom=extents[i].min;close(bottom-top,g)
    gapArea+=geometryArea(clipping.intersection(ring(inner),ring([{x:minX,y:top},{x:maxX,y:top},{x:maxX,y:bottom},{x:minX,y:bottom}])))
  }
  close(infill.reduce((n,q)=>n+polygonArea(pieceOutline(q)),0),polygonArea(inner)-gapArea)
  for(const piece of boards.pieces.filter(q=>q.kind==='perimeter')){
    const edge=p.findIndex(a=>Math.hypot(a.x-piece.x,a.y-piece.y)<1e-6)
    assert.ok(edge>=0&&selected[edge],'No cutting blank is generated for an absent perimeter edge')
  }
  return boards
}

test('rectangle per-edge framing creates the exact infill space and only selected edge boards',()=>{
  for(const flags of [[true,true,true,true],[false,false,false,false],[true,false,true,false],[false,true,false,true],[true,false,false,false],[true,true,false,false]])for(const direction of ['horizontal','vertical'] as const){
    const s={...base,direction,perimeterEdges:flags},boards=audit(s),physical=boardInfillPolygon(s).map(q=>direction==='vertical'?{x:q.y,y:q.x}:q)
    const w=s.board.width/1000,g=s.board.gap/1000
    close(Math.min(...physical.map(q=>q.x)),(flags[3]?w:0)+g)
    close(Math.max(...physical.map(q=>q.x)),6-(flags[1]?w:0)-g)
    close(Math.min(...physical.map(q=>q.y)),(flags[0]?w:0)+g)
    close(Math.max(...physical.map(q=>q.y)),4-(flags[2]?w:0)-g)
    assert.equal(boards.pieces.filter(q=>q.kind==='perimeter').length,flags.filter(Boolean).length)
    const inner=bounds(boardInfillPolygon(s)),rows=boards.fit.rows
    close(boards.pieces.filter(q=>q.kind==='infill').reduce((n,q)=>n+polygonArea(pieceOutline(q)),0),inner.width*(inner.depth-(rows-1)*g))
    const expectedPerimeter=24-(6-w*(Number(flags[1])+Number(flags[3])))*(4-w*(Number(flags[0])+Number(flags[2])))
    close(boards.pieces.filter(q=>q.kind==='perimeter').reduce((n,q)=>n+polygonArea(pieceOutline(q)),0),expectedPerimeter)
  }
})

test('all-edges selection is identical to legacy framing and no-edges selection removes its full-width inset',()=>{
  const old=planBoardsOnly(base),explicit=planBoardsOnly({...base,perimeterEdges:[true,true,true,true]})
  assert.deepEqual(explicit,old)
  const none=audit({...base,perimeterEdges:[false,false,false,false]})
  assert.equal(none.pieces.filter(q=>q.kind==='perimeter').length,0)
  const minX=Math.min(...none.pieces.flatMap(q=>pieceOutline(q).map(p=>p.x)))
  close(minX,base.board.gap/1000)
})

test('mixed edge choices retain physical edge identity through direction changes, winding and normalization',()=>{
  const shapes=[rect,[{x:0,y:0},{x:6,y:0},{x:6,y:2},{x:4,y:2},{x:4,y:4},{x:0,y:4}],[{x:0,y:0},{x:5.5,y:0},{x:6,y:4},{x:0,y:3.5}]]
  for(const polygon of shapes){
    const patterns=[polygon.map(()=>true),polygon.map(()=>false),polygon.map((_,i)=>i%2===0),polygon.map((_,i)=>i<2)]
    for(const flags of patterns)for(const direction of ['horizontal','vertical'] as const)for(const reversed of [false,true]){
      const points=(reversed?[...polygon].reverse():polygon).map(q=>({x:q.x-2,y:q.y+1}))
      const remapped=reversed?flags.map((_,i)=>flags[(flags.length-2-i+flags.length)%flags.length]):flags
      const s={...base,polygon:points,perimeterEdges:remapped,direction},boards=audit(s)
      const perimeter=boards.pieces.filter(q=>q.kind==='perimeter')
      assert.equal(perimeter.length,flags.filter(Boolean).length)
    }
  }
})

test('imported edge flags must match the exact outline and contain boolean choices',()=>{
  assert.equal(validateSettings({...base,perimeterEdges:[false,true,false,true]}),'')
  for(const perimeterEdges of [[true],[],[true,true,true,true,true],[true,true,true,'false']])assert.match(validateSettings({...base,perimeterEdges:perimeterEdges as boolean[]}),/each outline edge/)
  assert.match(validateSettings({...base,polygon:[...rect,{x:-1,y:2}],perimeterEdges:[true,true,true,true]}),/each outline edge/)
})

test('only enabled long perimeter edges request stock joints and purchase their real blanks',()=>{
  const s:Settings={...base,board:{...base.board,stock:3.66},perimeterEdges:[true,false,true,false]}
  const p=planBoardsOnly(s),perimeter=p.pieces.filter(q=>q.kind==='perimeter')
  assert.equal(perimeter.length,4)
  assert.ok(perimeter.every(q=>q.length<=s.board.stock+1e-7))
  assert.equal(p.bars.reduce((n,b)=>n+b.cuts.length,0),p.pieces.length)
  assert.throws(()=>planBoardsOnly({...s,perimeterJoints:false}),/Perimeter edge/)
  assert.doesNotThrow(()=>planBoardsOnly({...s,perimeterEdges:[false,false,false,false],perimeterJoints:false}))
})

test('a framing choice at a collinear split retains a full-width square-ended board',()=>{
  const s:Settings={...base,polygon:[{x:0,y:0},{x:3,y:0},{x:6,y:0},{x:6,y:4},{x:0,y:4}],perimeterEdges:[true,false,false,false,false]}
  const p=planBoardsOnly(s),perimeter=p.pieces.filter(q=>q.kind==='perimeter')
  assert.equal(perimeter.length,1)
  close(polygonArea(pieceOutline(perimeter[0])),3*s.board.width/1000)
  assert.ok(pieceOutline(perimeter[0]).some(q=>Math.abs(q.x-3)<1e-7&&Math.abs(q.y-s.board.width/1000)<1e-7),'The selected segment must not taper away at the collinear split')
})

test('whole-board size options use selected-edge insets and preserve their physical edge choices',()=>{
  for(const flags of [[false,false,false,false],[true,false,false,false],[true,false,true,false],[false,true,false,true]])for(const direction of ['horizontal','vertical'] as const){
    const s={...base,direction,perimeterEdges:flags}
    for(const option of deckSizeOptions(s)){
      assert.ok(option.settings,option.error)
      assert.deepEqual(option.settings.perimeterEdges,flags)
      const p=planBoardsOnly(option.settings)
      assert.equal(p.fit.rippedRows.length,0);assert.equal(p.fit.needsAdjustment,false)
      close(p.fit.edgeGap,0)
    }
  }
})
