import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, planDeck } from '../src/planner.ts'
import type { Settings } from '../src/planner.ts'
import { ensureEnoughBreakers } from '../src/breakerPlacement.ts'
import { computeDeckPlanning } from '../src/planning.ts'

const shortRun:Settings={...DEFAULT_SETTINGS,polygon:[{x:0,y:0},{x:3,y:0},{x:3,y:10},{x:0,y:10}],breakerMode:'manual',breakerPositions:[],breakerCount:0,frameSelection:'manual',pedestalSelection:'manual'}

test('switching from a single-length direction adds two breakers for a long deck',()=>{
  assert.equal(planDeck(shortRun).boards.breakers.length,0)
  const input={...shortRun,direction:'vertical' as const},before=JSON.stringify(input)
  const result=computeDeckPlanning(input,{})
  assert.equal(result.error,'')
  assert.ok(result.plan)
  assert.equal(result.plan.boards.breakers.length,2)
  assert.ok(result.plan.boards.pieces.length>0)
  assert.ok(result.plan.boards.pieces.every(p=>p.length<=input.board.stock+1e-7))
  assert.equal(result.settings.breakerMode,'balanced')
  assert.equal(result.settings.breakerCount,undefined)
  assert.equal(JSON.stringify(input),before)
})

test('stock and outline changes add as many breaker lines as needed',()=>{
  for(const direction of ['horizontal','vertical'] as const){
    const s:Settings={...shortRun,direction,polygon:direction==='horizontal'?shortRun.polygon.map(p=>({x:p.y,y:p.x})):shortRun.polygon,board:{...shortRun.board,stock:2},breakerPositions:[1.5],breakerCount:1}
    const recovered=ensureEnoughBreakers(s),plan=planDeck(recovered)
    assert.ok(plan.boards.breakers.length>1)
    assert.ok(plan.boards.pieces.every(p=>p.length<=2+1e-7))
  }
})

test('valid manual layouts and strict breaker drafts retain their chosen count',()=>{
  assert.equal(ensureEnoughBreakers(shortRun),shortRun)
  const invalid={...shortRun,direction:'vertical' as const}
  assert.throws(()=>planDeck(invalid),/stock length/)
  const butt={...invalid,joints:'butt' as const}
  assert.equal(ensureEnoughBreakers(butt),butt)
})
