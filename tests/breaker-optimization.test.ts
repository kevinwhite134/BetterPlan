import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, planDeck } from '../src/planner.ts'
import type { Settings } from '../src/planner.ts'
import { alignFullStockBay, arrangeBreakerCount, breakerLoss, fixedCountBreakerCandidates, mirrorFixedBreakers, optimiseBreakerPositions } from '../src/breakerOptimization.ts'
import { breakerSpace, keepBreakersInBounds, moveBoundedBreaker, validBreakerPlacement } from '../src/breakerPlacement.ts'
import { breakerStripWidth } from '../src/breakerWidth.ts'

const manual=(patch:Partial<Settings>={}):Settings=>({...DEFAULT_SETTINGS,breakerMode:'manual',breakerPositions:[2,4],...patch})
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`)

test('the chosen breaker count is retained by every candidate and optimisation result',()=>{
  for(const count of [1,2,3,5]){
    const s=manual(),positions=arrangeBreakerCount(s,count)!
    assert.equal(positions.length,count)
    const candidates=fixedCountBreakerCandidates(s,count,positions)
    assert.ok(candidates.length>0)
    for(const candidate of candidates){assert.equal(candidate.length,count);assert.equal(validBreakerPlacement(s,candidate),true)}
    const best=optimiseBreakerPositions(s,count,positions)!
    assert.equal(best.positions.length,count)
    const before=breakerLoss(planDeck({...s,breakerPositions:positions}))
    assert.ok(best.loss.stockBoards<=before.stockBoards)
    close(best.loss.lossPercent,breakerLoss(planDeck({...s,breakerPositions:best.positions})).lossPercent)
  }
})

test('zero or impossible requested counts never grow extra guides to make stock fit',()=>{
  assert.equal(arrangeBreakerCount(manual(),0),null)
  assert.equal(optimiseBreakerPositions(manual(),0),null)
  assert.deepEqual(fixedCountBreakerCandidates(manual(),1000),[])
  const s=manual({polygon:[{x:0,y:0},{x:3,y:0},{x:3,y:2},{x:0,y:2}]})
  assert.deepEqual(arrangeBreakerCount(s,0),[])
  assert.equal(optimiseBreakerPositions(s,0)!.positions.length,0)
})

test('full-stock alignment uses clear bay length between the actual breaker faces and end gaps',()=>{
  for(const direction of ['horizontal','vertical'] as const){
    const s=manual({direction,polygon:direction==='horizontal'?DEFAULT_SETTINGS.polygon:DEFAULT_SETTINGS.polygon.map(q=>({x:q.y,y:q.x}))})
    const positions=alignFullStockBay(s,[1,4],1,'before')!
    assert.ok(positions);assert.equal(positions.length,2);assert.equal(validBreakerPlacement(s,positions),true)
    close(positions[1]-positions[0]-breakerStripWidth(s)-2*s.board.endGap/1000,s.board.stock)
    const edge=alignFullStockBay(s,[2,5],0,'before')!
    close(edge[0]-breakerStripWidth(s)/2-s.board.endGap/1000-breakerSpace(s).left,s.board.stock)
    assert.equal(alignFullStockBay(s,[2,4],1,'before'),null,'An impossible full-stock bay does not cross a breaker or the edge')
  }
})

test('mirroring uses the existing chosen count, including a single central guide',()=>{
  const s=manual(),two=mirrorFixedBreakers(s,[1,4])!,three=mirrorFixedBreakers(s,[1,2.8,4.7])!
  assert.equal(two.length,2);close(two[0]+two[1],6)
  assert.equal(three.length,3);close(three[0]+three[2],6);close(three[1],3)
  assert.deepEqual(mirrorFixedBreakers(s,[2.5]),[3])
})

test('a persisted chosen count is never silently increased after stock or outline changes',()=>{
  const s=manual({breakerCount:2}),short={...s,board:{...s.board,stock:.3}},kept=keepBreakersInBounds(short)
  assert.equal(kept.breakerCount,2);assert.equal(kept.breakerPositions!.length,2)
  assert.equal(validBreakerPlacement(kept,kept.breakerPositions!),false,'Impossible count is retained for an explicit edit, not silently replaced')
  const one=manual({breakerCount:1,breakerPositions:[2.95]})
  assert.equal(moveBoundedBreaker(one,one.breakerPositions!,0,2.9,true).length,1,'Mirroring does not insert a second guide when count is locked')
  const resized=keepBreakersInBounds(manual({breakerCount:2,breakerPositions:[-5,50],polygon:[{x:0,y:0},{x:4,y:0},{x:4,y:3},{x:0,y:3}]}))
  assert.equal(resized.breakerPositions!.length,2);assert.equal(validBreakerPlacement(resized,resized.breakerPositions!),true)
})

test('full-stock placement and count optimisation use only the selected perimeter-board offsets',()=>{
  for(const direction of ['horizontal','vertical'] as const){
    const s=manual({direction,perimeterEdges:[false,false,false,false],polygon:direction==='horizontal'?DEFAULT_SETTINGS.polygon:DEFAULT_SETTINGS.polygon.map(q=>({x:q.y,y:q.x}))})
    const aligned=alignFullStockBay(s,[1,4],1,'before')!
    close(aligned[1]-aligned[0]-breakerStripWidth(s)-2*s.board.endGap/1000,s.board.stock)
    const best=optimiseBreakerPositions(s,2,aligned)!
    assert.ok(best);assert.equal(best.positions.length,2);assert.equal(validBreakerPlacement(s,best.positions),true)
  }
})

test('shaped outlines and flipped runs use bounded fixed-count placements and real total stock-loss values',()=>{
  const shapes=[
    [{x:0,y:0},{x:6,y:0},{x:5.5,y:4},{x:0,y:3.5}],
    [{x:0,y:0},{x:6,y:0},{x:6,y:2},{x:4,y:2},{x:4,y:4},{x:0,y:4}],
  ]
  for(const polygon of shapes)for(const direction of ['horizontal','vertical'] as const){
    const s=manual({polygon,direction}),positions=arrangeBreakerCount(s,2)!,result=optimiseBreakerPositions(s,2,positions)!
    assert.ok(result);assert.equal(result.positions.length,2);assert.equal(validBreakerPlacement(s,result.positions),true)
    const p=planDeck({...s,breakerPositions:result.positions}),loss=breakerLoss(p)
    close(loss.lossLength,p.purchased-p.used);close(loss.lossPercent,p.offcut/p.purchased*100)
    assert.equal(loss.stockBoards,p.boards.bars.length)
  }
})
