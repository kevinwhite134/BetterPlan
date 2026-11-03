import test from 'node:test'
import assert from 'node:assert/strict'
import { constrainPlanView, zoomPlanView } from '../src/planViewport.ts'

test('zoom preserves the drawing point beneath the pinch centre',()=>{
  const anchor={x:250,y:150},view=zoomPlanView({zoom:1,x:0,y:0},2,anchor,anchor,800,500)
  assert.deepEqual(view,{zoom:2,x:-250,y:-150})
  assert.equal((anchor.x-view.x)/view.zoom,anchor.x)
  assert.equal((anchor.y-view.y)/view.zoom,anchor.y)
})
test('moving the pinch centre pans while zooming',()=>{
  assert.deepEqual(zoomPlanView({zoom:2,x:-250,y:-150},1.5,{x:250,y:150},{x:270,y:170},800,500),{zoom:3,x:-480,y:-280})
})
test('one-finger drag after a pinch continues without a zoom jump',()=>{
  assert.deepEqual(zoomPlanView({zoom:2,x:-250,y:-150},1,{x:100,y:100},{x:130,y:120},800,500),{zoom:2,x:-220,y:-130})
})
test('pan is bounded to the drawing and fit removes all offsets',()=>{
  assert.deepEqual(constrainPlanView({zoom:2,x:50,y:-2000},800,500),{zoom:2,x:0,y:-500})
  assert.deepEqual(constrainPlanView({zoom:1,x:-200,y:100},800,500),{zoom:1,x:0,y:0})
})
test('zoom limits keep the anchor stable and resizing reclamps the view',()=>{
  const anchor={x:400,y:250}
  assert.deepEqual(zoomPlanView({zoom:4,x:-1200,y:-750},10,anchor,anchor,800,500),{zoom:4,x:-1200,y:-750})
  assert.deepEqual(zoomPlanView({zoom:2,x:-400,y:-250},.01,anchor,anchor,800,500),{zoom:1,x:0,y:0})
  assert.deepEqual(constrainPlanView({zoom:2,x:-700,y:-400},300,200),{zoom:2,x:-300,y:-200})
})
