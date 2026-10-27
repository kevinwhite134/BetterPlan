import test from 'node:test'
import assert from 'node:assert/strict'
import { allowedBoardCut, boardBands } from '../src/deckGeometry.ts'
import { DEFAULT_SETTINGS, planDeck, validateSettings } from '../src/planner.ts'
import { deckSizeOptions } from '../src/deckSizing.ts'

const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`)
const rectangle=(depth:number)=>[{x:0,y:0},{x:6,y:0},{x:6,y:depth},{x:0,y:depth}]

test('straight ripping is enabled for new and existing projects without a saved cut policy',()=>{
  assert.equal(DEFAULT_SETTINGS.allowRipping,true)
  for(const allowRipping of [true,undefined]){
    const s={...DEFAULT_SETTINGS,polygon:rectangle(3.2),allowRipping},p=planDeck(s)
    assert.equal(p.boards.fit.rows,21)
    assert.equal(p.boards.fit.rippedRows.length,2)
    p.boards.fit.rippedRows.forEach(width=>close(width,.117))
    close(p.boards.fit.edgeGap,0)
    assert.equal(p.boards.fit.needsAdjustment,false)
    assert.equal(p.frame.geometryPass,true)
    const infill=p.boards.pieces.filter(q=>q.kind==='infill')
    assert.ok(infill.some(q=>q.width<s.board.width/1000))
    assert.ok(infill.every(q=>q.width>0&&q.width<=s.board.width/1000))
    // Purchasing still uses full stock blanks, including the ripped pieces.
    close(p.blankArea,p.used*s.board.width/1000)
    assert.deepEqual(p.boards.bars.flatMap(b=>b.cuts.map(c=>c.piece)).sort((a,b)=>a-b),p.boards.pieces.map((_,i)=>i))
  }
})

test('rip bands cover the exact cross-run depth with real gaps and balanced edge cuts',()=>{
  for(const width of [.06,.136,.3])for(const gap of [.001,.005,.015])for(const across of [.01,width,width+.00001,width+gap,1,2.918,8.123]){
    const bands=boardBands(across,width,gap,true)
    assert.ok(bands.length>0)
    assert.ok(bands.every(q=>q.width>0&&q.width<=width+1e-7))
    close(bands[0].y,0)
    close(bands.at(-1)!.y+bands.at(-1)!.width,across)
    for(let i=1;i<bands.length;i++)close(bands[i].y-bands[i-1].y-bands[i-1].width,gap)
    if(bands.length>1){close(bands[0].width,bands.at(-1)!.width);assert.ok(bands[0].width>=(width-gap)/2-1e-7)}
  }
})

test('a uniform straight rip is accepted only under the enabled policy',()=>{
  const outline=[{x:0,y:.07},{x:3,y:.07},{x:3,y:.136},{x:0,y:.136}]
  assert.equal(allowedBoardCut(outline,0,.136,true),true)
  assert.equal(allowedBoardCut(outline,0,.136,false),false)
  assert.equal(allowedBoardCut([],0,.136,true),false)
})

test('whole-board size options still remove straight rips and leave stock and original outline unchanged',()=>{
  const s={...DEFAULT_SETTINGS,polygon:rectangle(3.2)},original=JSON.stringify(s)
  for(const option of deckSizeOptions(s)){
    const resized=planDeck(option.settings!)
    assert.equal(resized.boards.fit.rippedRows.length,0)
    assert.equal(resized.boards.fit.rows,option.rows)
    assert.equal(option.settings!.board.stock,s.board.stock)
    assert.equal(option.settings!.allowRipping,true)
  }
  const bigger=deckSizeOptions(s)[1]
  close(bigger.target,3.238)
  assert.equal(bigger.rows,21)
  assert.equal(JSON.stringify(s),original)
})

test('whole-board fitting dimensions need no straight rips even with ripping enabled',()=>{
  for(const depth of [3.097,3.238]){
    const p=planDeck({...DEFAULT_SETTINGS,polygon:rectangle(depth)})
    assert.equal(p.boards.fit.rippedRows.length,0)
    assert.ok(p.boards.pieces.every(q=>q.width===.136))
    close(p.boards.fit.edgeGap,0)
  }
})

test('disabling straight ripping restores whole-width rows and exposes the remainder',()=>{
  const p=planDeck({...DEFAULT_SETTINGS,polygon:rectangle(3.2),allowRipping:false})
  assert.equal(p.boards.fit.rows,20)
  assert.equal(p.boards.fit.rippedRows.length,0)
  close(p.boards.fit.edgeGap,.0515)
  assert.ok(p.boards.pieces.every(q=>q.width===.136))
})

test('imported ripping policy must be a boolean',()=>{
  assert.ok(validateSettings({...DEFAULT_SETTINGS,allowRipping:'yes'} as unknown as typeof DEFAULT_SETTINGS))
})
