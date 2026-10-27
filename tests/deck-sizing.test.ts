import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, planDeck } from '../src/planner.ts'
import { deckSizeOptions } from '../src/deckSizing.ts'
import type { Settings } from '../src/planner.ts'
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`)
const rectangle=(depth:number):Settings=>({...DEFAULT_SETTINGS,polygon:[{x:2,y:-4},{x:8,y:-4},{x:8,y:depth-4},{x:2,y:depth-4}]})

test('non-fitting rectangles offer the nearest smaller and bigger full-row fits',()=>{
  const s=rectangle(3.2),options=deckSizeOptions(s)
  close(options[0].target,3.097);close(options[1].target,3.238)
  for(const o of options){assert.ok(o.settings);const p=planDeck(o.settings);close(p.boards.fit.edgeGap,0);assert.equal(p.boards.fit.rippedRows.length,0);assert.equal(p.boards.fit.needsAdjustment,false);assert.equal(p.boards.fit.rows,o.rows)}
  assert.equal(s.polygon[0].y,-4)
})
test('already-fitting decks always offer one complete row smaller and bigger',()=>{
  const s=rectangle(3.238),options=deckSizeOptions(s)
  close(options[0].delta,-.141);close(options[1].delta,.141)
  for(const o of options)close(planDeck(o.settings!).boards.fit.edgeGap,0)
})
test('flipping board direction resizes width and anchors the minimum coordinate',()=>{
  const s={...rectangle(3.2),direction:'vertical' as const},o=deckSizeOptions(s)[1]
  assert.equal(o.axis,'x');assert.equal(o.settings!.polygon[0].x,2);assert.deepEqual(o.settings!.polygon.map(q=>q.y),s.polygon.map(q=>q.y))
  close(Math.max(...o.settings!.polygon.map(q=>q.x))-2,o.target)
})
test('irregular outlines nudge to adjacent full-row fits without changing products or frame',()=>{
  const s:Settings={...DEFAULT_SETTINGS,frame:'small',edgeDetailConfirmed:true,polygon:[{x:1,y:-2},{x:6,y:-2},{x:5,y:1},{x:1,y:1}]}
  for(const o of deckSizeOptions(s)){
    assert.ok(o.id==='smaller'?o.delta<0:o.delta>0);assert.equal(o.rectangle,false);close(planDeck(o.settings!).boards.fit.edgeGap,0);assert.equal(o.settings!.frame,'small');assert.equal(o.settings!.board,s.board);assert.equal(o.settings!.edgeDetailConfirmed,false)
    assert.deepEqual(o.settings!.polygon.map(q=>q.x),s.polygon.map(q=>q.x));assert.equal(o.settings!.polygon[0].y,-2)
    assert.equal(planDeck(o.settings!).frame.geometryPass,true,'Direct edge trims retain actual checked bearings after resizing')
  }
})
test('too-small, oversized and invalid-product options explain why they cannot be applied',()=>{
  assert.ok(deckSizeOptions(rectangle(.418))[0].error)
  assert.ok(deckSizeOptions(rectangle(99.99))[1].error)
  for(const o of deckSizeOptions({...rectangle(3.2),board:{...DEFAULT_SETTINGS.board,width:NaN}})){assert.ok(o.error);assert.equal(o.settings,undefined)}
})
