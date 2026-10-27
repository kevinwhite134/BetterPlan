import test from 'node:test'
import assert from 'node:assert/strict'
import { allowedBoardCut } from '../src/deckGeometry.ts'
import { DEFAULT_SETTINGS, planDeck, pieceOutline, inside } from '../src/planner.ts'

test('an angled rip may produce a tapered tip narrower than the stock board',()=>{
  assert.equal(allowedBoardCut([{x:0,y:.136},{x:3,y:.08},{x:3,y:.136}],0,.136),true)
  assert.equal(allowedBoardCut([{x:0,y:0},{x:3,y:.07},{x:3,y:.136},{x:0,y:.136}],0,.136),true)
})
test('disabling straight ripping rejects a uniform narrower strip',()=>{
  assert.equal(allowedBoardCut([{x:0,y:.07},{x:3,y:.07},{x:3,y:.136},{x:0,y:.136}],0,.136),false)
  assert.equal(allowedBoardCut([{x:0,y:0},{x:3,y:0},{x:3,y:.136},{x:0,y:.136}],0,.136),true)
})
test('tapered shape pieces retain the chosen stock and stay within the deck outline',()=>{
  const angle=31*Math.PI/180,polygon=Array.from({length:3},(_,i)=>({x:3+3*Math.cos(angle+i*2*Math.PI/3),y:3+2.5*Math.sin(angle+i*2*Math.PI/3)}))
  for(const joints of ['butt','breaker'] as const){
    const p=planDeck({...DEFAULT_SETTINGS,polygon,joints,allowRipping:false})
    assert.ok(p.boards.fit.taperedPieces>0);assert.equal(p.frame.geometryPass,true)
    for(const q of p.boards.pieces.filter(q=>q.kind==='infill')){
      assert.ok(q.length<=DEFAULT_SETTINGS.board.stock+1e-6)
      assert.equal(q.width,DEFAULT_SETTINGS.board.width/1000)
      assert.ok(pieceOutline(q).every(v=>inside(p.p,v)))
      assert.equal(allowedBoardCut(pieceOutline(q),q.y,q.y+q.width),true)
    }
  }
})
