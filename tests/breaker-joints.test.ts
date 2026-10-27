import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, planDeck } from '../src/planner.ts'
import { pointSegmentDistance } from '../src/deckGeometry.ts'
import { breakerBoardCount } from '../src/breakerWidth.ts'

const rect=(w:number,d:number)=>[{x:0,y:0},{x:w,y:0},{x:w,y:d},{x:0,y:d}]
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`)

test('breaker butt joints use the minimum piece count only beyond stock length, including custom stock and flipped runs',()=>{
  for(const stock of [1.2,3.66,4.88])for(const excess of [-.001,0,.001,stock+.03])for(const direction of ['horizontal','vertical'] as const){
    const run=2*stock,across=stock+excess+.282
    const polygon=direction==='horizontal'?rect(run,across):rect(across,run)
    const s={...DEFAULT_SETTINGS,polygon,direction,board:{...DEFAULT_SETTINGS.board,stock}},p=planDeck(s)
    const count=Math.max(1,Math.ceil((across-.282+.005)/(stock+.005)-1e-7))
    assert.equal(p.boards.pieces.filter(q=>q.kind==='breaker').length,count*p.boards.breakers.length)
    for(const x of p.boards.breakers){
      const cuts=p.boards.pieces.filter(q=>q.kind==='breaker'&&Math.abs(q.x-(x-.068))<1e-6).sort((a,b)=>a.y-b.y)
      assert.equal(cuts.length,count)
      assert.ok(cuts.every(q=>q.length<=stock+1e-6))
      close(cuts.reduce((a,q)=>a+q.length,0)+(count-1)*.005,across-.282)
      for(let i=1;i<cuts.length;i++)close(cuts[i].y-cuts[i-1].y-cuts[i-1].length,.005)
    }
    // Infill still has no hidden stock joints within a breaker bay.
    for(const row of new Set(p.boards.pieces.filter(q=>q.kind==='infill').map(q=>q.row)))assert.equal(p.boards.pieces.filter(q=>q.kind==='infill'&&q.row===row).length,p.boards.breakers.length+1)
  }
})

test('long breaker ends bear across the actual ladder faces in both directions and supported frame tiers',()=>{
  for(const direction of ['horizontal','vertical'] as const)for(const frame of ['small','big','small-small','big-small'] as const){
    const polygon=direction==='horizontal'?rect(6,4):rect(4,6),s={...DEFAULT_SETTINGS,polygon,direction,frame},p=planDeck(s)
    assert.equal(p.frame.geometryPass,true,p.frame.issues.join('; '))
    assert.equal(p.frame.checks.find(q=>q.name==='Breaker board end bearings')?.ok,true)
    const upper=p.frame.members.filter(m=>m.kind==='joist'||m.kind==='rim'||m.kind==='noggin')
    const cuts=p.boards.pieces.filter(q=>q.kind==='breaker').sort((a,b)=>a.y-b.y)
    assert.equal(cuts.length,2*breakerBoardCount(s))
    const firstBoard=cuts.filter(q=>Math.abs(q.x-cuts[0].x)<1e-6)
    const joint=(firstBoard[0].y+firstBoard[0].length+firstBoard[1].y)/2
    assert.ok(p.frame.members.some(m=>m.kind==='noggin'&&Math.abs(m.a.y-joint)<1e-6))
    for(const piece of cuts)for(const y of [piece.y,piece.y+piece.length])for(const t of [.1,.3,.5,.7,.9]){
      const q={x:piece.x+t*piece.width,y}
      assert.ok(upper.some(m=>pointSegmentDistance(q,m.a,m.b)<=.035/2-.01+2e-5))
    }
  }
})

test('a breaker stock joint needs a face wide enough for both ends and the end gap',()=>{
  const s={...DEFAULT_SETTINGS,polygon:rect(6,4),board:{...DEFAULT_SETTINGS.board,endGap:20}}
  const narrow=planDeck(s)
  assert.equal(narrow.frame.layoutStatus,'unbuildable')
  assert.equal(narrow.frame.members.length,0)
  assert.equal(narrow.frame.pedestals.length,0)
  assert.ok(narrow.frame.issues.some(q=>/gap|stock.joint/i.test(q)))
  const wide=planDeck({...s,frameFaceWidth:45})
  assert.equal(wide.frame.geometryPass,true,wide.frame.issues.join('; '))
})

test('disconnected breaker sections across a cut-out remain single pieces when each section fits stock',()=>{
  const polygon=[{x:0,y:0},{x:6,y:0},{x:6,y:6},{x:4,y:6},{x:4,y:2},{x:2,y:2},{x:2,y:6},{x:0,y:6}]
  const p=planDeck({...DEFAULT_SETTINGS,polygon,direction:'vertical',breakerMode:'manual',breakerPositions:[3]})
  const cuts=p.boards.pieces.filter(q=>q.kind==='breaker')
  assert.equal(cuts.length,2)
  assert.ok(cuts.every(q=>q.length<3.66))
  assert.equal(p.frame.geometryPass,true,p.frame.issues.join('; '))
  assert.equal(p.boards.bars.flatMap(q=>q.cuts).length,p.boards.pieces.length)
})
