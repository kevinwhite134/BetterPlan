import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, planDeck } from '../src/planner.ts'
import { isLargePreview, thumbnailPlan } from '../src/renderOverview.ts'
import { structurePaths } from '../src/structureGeometry.ts'

test('large main structural paths retain every actual component with bounded SVG path count',()=>{
  const small=planDeck(DEFAULT_SETTINGS),pedestals=Array.from({length:14000},(_,i)=>({x:(i%100)*.9,y:Math.floor(i/100)*.7}))
  const members=Array.from({length:18000},(_,i)=>({a:{x:(i%100)*.9,y:Math.floor(i/100)*.5},b:{x:(i%100)*.9,y:Math.floor(i/100)*.5+.45},kind:'joist' as const,size:35}))
  const plan={...small,frame:{...small.frame,pedestals,members}},before=JSON.stringify([plan.frame.pedestals,plan.frame.members])
  assert.equal(isLargePreview(plan),true)
  const drawing=structurePaths(plan,DEFAULT_SETTINGS,'joists',true,35,52,p=>({x:p.x-p.y*.2,y:p.y-p.z}))
  assert.deepEqual(drawing.components,{pedestals:14000,members:18000})
  assert.ok(drawing.paths.length<=12,'SVG DOM count follows the number of styles, not the number of components')
  assert.equal(drawing.paths.filter(p=>p.kind==='pedestal').reduce((n,p)=>n+(p.path.match(/M/g)?.length??0),0),pedestals.length*3,'Every base, stem and head is rendered')
  assert.ok(drawing.paths.every(p=>!p.path.includes('NaN')&&!p.path.includes('Infinity')))
  assert.equal(JSON.stringify([plan.frame.pedestals,plan.frame.members]),before)
  const hidden=structurePaths(plan,DEFAULT_SETTINGS,'joists',false,35,52,p=>p)
  assert.deepEqual(hidden.components,{pedestals:0,members:18000})
})

test('simplified layer thumbnails are bounded navigation previews and never mutate the main model',()=>{
  const small=planDeck(DEFAULT_SETTINGS)
  assert.equal(thumbnailPlan(small),small,'Small project thumbnails keep their existing complete rendering')
  const pieces=Array.from({length:20000},(_,i)=>small.boards.pieces[i%small.boards.pieces.length])
  const peds=Array.from({length:14000},(_,i)=>({x:i%100,y:Math.floor(i/100)})),members=Array.from({length:18000},(_,i)=>small.frame.members[i%small.frame.members.length])
  const large={...small,boards:{...small.boards,pieces},frame:{...small.frame,pedestals:peds,members}},thumb=thumbnailPlan(large)
  assert.ok(thumb.boards.pieces.length<=100&&thumb.frame.pedestals.length<=20&&thumb.frame.members.length<=72)
  assert.equal(large.boards.pieces.length,20000);assert.equal(large.frame.pedestals.length,14000);assert.equal(large.frame.members.length,18000)
  assert.equal(thumb.boards.pieces[0],large.boards.pieces[0]);assert.equal(thumb.boards.pieces.at(-1),large.boards.pieces.at(-1))
  assert.deepEqual(thumb.frame.pedestals.at(-1),large.frame.pedestals.at(-1))
})
