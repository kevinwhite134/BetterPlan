import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, pieceOutline, planDeck } from '../src/planner.ts'
import { pointInside } from '../src/deckGeometry.ts'
import { addBoundedBreaker, breakerSpace, dragBreakerWithinOutline, fitBreakerPositions, keepBreakersInBounds, moveBoundedBreaker, spaceBoundedBreakers, validBreakerPlacement } from '../src/breakerPlacement.ts'
import type { Settings } from '../src/planner.ts'
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`)
const manual=(positions:number[],patch:Partial<Settings>={}):Settings=>({...DEFAULT_SETTINGS,breakerMode:'manual',breakerPositions:positions,...patch})
const checked=(s:Settings,positions:number[])=>{
  assert.ok(validBreakerPlacement(s,positions),'positions form a valid stock-length board layout')
  const p=planDeck({...s,breakerMode:'manual',breakerPositions:positions})
  for(const piece of p.boards.pieces.filter(p=>p.breaker))for(const point of pieceOutline(piece))assert.ok(pointInside(p.boards.fit.inner,point),'all breaker vertices remain in the infill outline')
  return p
}

test('usable breaker bounds include picture-frame width and the required infill edge clearance',()=>{
  const space=breakerSpace(DEFAULT_SETTINGS)
  close(space.min,.264);close(space.max,5.736);close(space.separation,.196)
  assert.ok(space.min>DEFAULT_SETTINGS.board.width/2000+DEFAULT_SETTINGS.board.endGap/1000+.05)
})

test('typed, dragged and keyboard positions stop at safe bounds without losing the deck preview',()=>{
  const s=manual([3])
  for(const x of [-1000,0,.12,1,6,1000]){
    const positions=moveBoundedBreaker(s,[3],0,x,false),space=breakerSpace(s)
    assert.ok(positions[0]>=space.min&&positions[0]<=space.max)
    checked(s,positions)
  }
  assert.deepEqual(moveBoundedBreaker(s,[3],0,NaN,false),[3])
})

test('free draft dragging follows the requested position through an over-stock bay and can recover',()=>{
  const s=manual([3]),base=[3]
  assert.ok(validBreakerPlacement(s,base))
  const moved=dragBreakerWithinOutline(s,base,0,.5,false)
  close(moved[0],.5)
  assert.equal(validBreakerPlacement(s,moved),false,'an over-stock draft must not be applied')
  assert.deepEqual(base,[3],'dragging leaves the applied positions intact')
  const recovered=dragBreakerWithinOutline(s,moved,0,3,false)
  checked(s,recovered)
})

test('free draft dragging respects neighbours and mirrors without adding guides',()=>{
  const s=manual([2,4]),space=breakerSpace(s)
  const moved=dragBreakerWithinOutline(s,[2,4],0,5,false)
  close(moved[0],4-space.separation)
  assert.equal(moved.length,2)
  for(const target of [.5,1,2.5]){
    const mirrored=dragBreakerWithinOutline(s,[2,4],0,target,true)
    assert.equal(mirrored.length,2)
    close(mirrored[0]+mirrored[1],space.run)
    assert.ok(mirrored.every(x=>x>=space.min&&x<=space.max))
  }
})

test('mirrored movement keeps both lines in bounds, separated and symmetric',()=>{
  const s=manual([2,4])
  for(const x of [-100,0,2.95,3.05,6,100]){
    const positions=moveBoundedBreaker(s,[2,4],0,x,true)
    close(positions[0]+positions[1],6);checked(s,positions)
  }
  assert.deepEqual(moveBoundedBreaker(manual([3]),[3],0,0,true),[3])
  checked(s,moveBoundedBreaker(s,[2.95],0,2.96,true))
})

test('outline changes, board widths and run-direction flips refit saved manual positions without changing customer height',()=>{
  const polygon=[{x:0,y:0},{x:3,y:0},{x:3,y:2.5},{x:0,y:2.5}]
  for(const patch of [{direction:'vertical' as const},{polygon},{board:{...DEFAULT_SETTINGS.board,width:200}},{board:{...DEFAULT_SETTINGS.board,width:60}},{board:{...DEFAULT_SETTINGS.board,stock:.3}}]){
    const s=manual([3.8],patch),fixed=keepBreakersInBounds(s)
    assert.equal(fixed.height,s.height);assert.equal(fixed.variation,s.variation);assert.strictEqual(fixed.polygon,s.polygon)
    checked(fixed,fixed.breakerPositions!)
  }
  checked(manual([-100,100]),fitBreakerPositions(manual([-100,100]),[-100,100]))
})

test('new and equally spaced breakers cannot exceed capacity or overlap at dense counts',()=>{
  const s=manual([3]),space=breakerSpace(s)
  let positions=[3]
  for(let i=0;i<100;i++){
    const next=addBoundedBreaker(s,positions,i%2===0)
    assert.ok(next.length<=space.capacity);checked(s,next)
    if(next.length===positions.length)break
    positions=next
  }
  for(const count of [1,2,space.capacity])checked(s,spaceBoundedBreakers(s,count))
})

test('safe placements stay inside concave and angled outlines in either board direction',()=>{
  const shapes=[
    [{x:0,y:0},{x:6,y:0},{x:6,y:2},{x:4,y:2},{x:4,y:4},{x:0,y:4}],
    [{x:0,y:0},{x:6,y:0},{x:6,y:4},{x:4,y:4},{x:4,y:2},{x:2,y:2},{x:2,y:4},{x:0,y:4}],
    [{x:0,y:0},{x:5.2,y:0},{x:4,y:3},{x:1,y:3}],
    [{x:0,y:0},{x:5.2,y:0},{x:2.6,y:3}],
    [{x:0,y:0},{x:2.6,y:1.2},{x:5.2,y:0},{x:5.2,y:2.478},{x:2.6,y:1.85},{x:0,y:2.478}],
  ]
  for(const polygon of shapes)for(const direction of ['horizontal','vertical'] as const)for(const width of [60,136,200]){
    const s=manual([-50,50],{polygon,direction,board:{...DEFAULT_SETTINGS.board,width}}),positions=fitBreakerPositions(s,s.breakerPositions!)
    checked(s,positions)
    if(positions.length)for(const target of [-10,10])checked(s,moveBoundedBreaker(s,positions,0,target,false))
  }
})

test('a small deck with no room for a breaker retains valid boards and removes an impossible saved line',()=>{
  const s=manual([.15],{polygon:[{x:0,y:0},{x:.3,y:0},{x:.3,y:1},{x:0,y:1}]})
  assert.equal(breakerSpace(s).capacity,0)
  const fixed=keepBreakersInBounds(s)
  assert.deepEqual(fixed.breakerPositions,[]);checked(fixed,[])
})
