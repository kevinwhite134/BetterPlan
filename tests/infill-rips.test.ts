import test from 'node:test'
import assert from 'node:assert/strict'
import { boardBands, clipRectangleParts, pointInside, signedArea } from '../src/deckGeometry.ts'
import { bounds, DEFAULT_SETTINGS, normalize, pieceOutline, planDeck } from '../src/planner.ts'
import type { Point } from '../src/planner.ts'

const shape=(pairs:number[][]):Point[]=>pairs.map(([x,y])=>({x,y}))
const shapes={
  L:shape([[0,0],[6,0],[6,2],[4,2],[4,4],[0,4]]),
  U:shape([[0,0],[6,0],[6,4],[4,4],[4,1.7],[2,1.7],[2,4],[0,4]]),
  stepped:shape([[0,0],[6,0],[6,1.1],[4.8,1.1],[4.8,2.3],[6,2.3],[6,4],[0,4],[0,3.1],[1.3,3.1],[1.3,1.6],[0,1.6]]),
}
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`)

// Independent scan-line integration, including each clamp-change level. It
// checks area without reusing the polygon clipping implementation under test.
function intersectionArea(p:Point[],left:number,right:number,top:number,bottom:number){
  const levels=[top,bottom,...p.map(q=>q.y).filter(y=>y>top&&y<bottom)]
  for(let i=0;i<p.length;i++){
    const a=p[i],b=p[(i+1)%p.length]
    if(a.x===b.x)continue
    for(const x of [left,right]){const t=(x-a.x)/(b.x-a.x),y=a.y+t*(b.y-a.y);if(t>0&&t<1&&y>top&&y<bottom)levels.push(y)}
  }
  levels.sort((a,b)=>a-b)
  const widthAt=(y:number)=>{
    const xs:number[]=[]
    for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];if((a.y>y)!==(b.y>y))xs.push(a.x+(y-a.y)*(b.x-a.x)/(b.y-a.y))}
    xs.sort((a,b)=>a-b);let width=0
    for(let i=0;i<xs.length;i+=2)width+=Math.max(0,Math.min(right,xs[i+1])-Math.max(left,xs[i]))
    return width
  }
  return levels.slice(1).reduce((area,b,i)=>{const a=levels[i];return area+(b-a)*(widthAt(a+(b-a)/3)+widthAt(a+2*(b-a)/3))/2},0)
}

test('rectangle clipping returns separate real pieces across a U-shaped cut-out',()=>{
  for(const polygon of [shapes.U,[...shapes.U].reverse()]){
    const parts=clipRectangleParts(polygon,0,6,2,2.136)
    assert.equal(parts.length,2)
    close(parts.reduce((n,q)=>n+Math.abs(signedArea(q)),0),4*.136)
    assert.ok(parts.every(p=>p.every(q=>q.x<=2+1e-7)||p.every(q=>q.x>=4-1e-7)))
  }
})

test('ripped and notched intersections conserve area across concave, angled and near-collinear outlines',()=>{
  const near=shape([[0,0],[2.8,0],[3.2,.000001],[6,0],[6,4],[0,4]])
  for(const original of [...Object.values(shapes),near])for(const reversed of [false,true])for(const vertical of [false,true]){
    const p=(reversed?[...original].reverse():original).map(q=>vertical?{x:q.y,y:q.x}:q),b=bounds(p)
    for(let i=0;i<21;i++){
      const top=i*b.depth/21,bottom=Math.min(b.depth,top+.237),left=i%3*.413,right=b.width-(i%4)*.317
      const parts=clipRectangleParts(p,left,right,top,bottom)
      close(parts.reduce((sum,q)=>sum+Math.abs(signedArea(q)),0),intersectionArea(p,left,right,top,bottom))
      assert.ok(parts.every(q=>q.every(v=>pointInside(p,v))))
    }
  }
})

for(const [name,polygon] of Object.entries(shapes))test(`ripped infill closes ${name} recesses in both directions while leaving only installation gaps`,()=>{
  for(const direction of ['horizontal','vertical'] as const){
    const s={...DEFAULT_SETTINGS,polygon,direction,joints:'butt' as const,board:{...DEFAULT_SETTINGS.board,stock:15}},p=planDeck(s)
    const infill=p.boards.pieces.filter(q=>q.kind==='infill'),inner=normalize(p.boards.fit.inner),b=bounds(inner),bands=boardBands(b.depth,.136,.005,true)
    const expected=bands.reduce((a,q)=>a+intersectionArea(inner,0,b.width,q.y,q.y+q.width),0)
    close(infill.reduce((a,q)=>a+Math.abs(signedArea(pieceOutline(q))),0),expected)
    assert.equal(p.boards.fit.localGap,false)
    assert.ok(p.boards.fit.localRipPieces>0)
    assert.equal(p.frame.geometryPass,true,p.frame.issues.join('; '))
    const minX=Math.min(...p.boards.fit.inner.map(q=>q.x)),minY=Math.min(...p.boards.fit.inner.map(q=>q.y))
    for(let x=.031;x<b.width;x+=.113)for(let y=.027;y<b.depth;y+=.107){
      const inBand=bands.some(q=>y>q.y+1e-6&&y<q.y+q.width-1e-6),inside=pointInside(inner,{x,y})
      const count=infill.filter(q=>pointInside(pieceOutline(q),{x:x+minX,y:y+minY})).length
      assert.equal(count,inside&&inBand?1:0,`${name}/${direction}: coverage at ${x},${y}`)
    }
    const old=planDeck({...s,allowRipping:false})
    assert.equal(old.boards.fit.localRipPieces,0)
    assert.ok(old.boards.pieces.filter(q=>q.kind==='infill').reduce((a,q)=>a+Math.abs(signedArea(pieceOutline(q))),0)<expected)
  }
})

test('local ripped pieces retain stock limits, real end bearings and purchasing entries with both joint policies',()=>{
  for(const direction of ['horizontal','vertical'] as const)for(const joints of ['butt','breaker'] as const){
    const p=planDeck({...DEFAULT_SETTINGS,polygon:shapes.U,direction,joints,board:{...DEFAULT_SETTINGS.board,stock:4.88}})
    assert.equal(p.boards.fit.localGap,false)
    assert.equal(p.frame.geometryPass,true,p.frame.issues.join('; '))
    assert.ok(p.boards.pieces.every(q=>q.length<=4.88+1e-6&&q.width<=.136+1e-6))
    assert.deepEqual(p.boards.bars.flatMap(q=>q.cuts.map(c=>c.piece)).sort((a,b)=>a-b),p.boards.pieces.map((_,i)=>i))
    const upper=p.frame.members.filter(m=>m.kind==='rim'||m.kind==='joist'),limit=.035/2-.01+2e-5
    for(const q of p.boards.pieces.filter(q=>q.kind==='infill'))for(let i=0;i<q.outline!.length;i++){
      const a=q.outline![i],b=q.outline![(i+1)%q.outline!.length]
      if(Math.abs(a.y-b.y)<1e-7)continue
      for(const t of [.1,.3,.5,.7,.9]){
        const v={x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)}
        assert.ok(upper.some(m=>{const dx=m.b.x-m.a.x,dy=m.b.y-m.a.y,u=Math.max(0,Math.min(1,((v.x-m.a.x)*dx+(v.y-m.a.y)*dy)/(dx*dx+dy*dy)));return Math.hypot(v.x-m.a.x-u*dx,v.y-m.a.y-u*dy)<=limit}))
      }
    }
  }
})
