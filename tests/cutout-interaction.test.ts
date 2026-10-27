import test from 'node:test'
import assert from 'node:assert/strict'
import { cutoutBounds, cutoutCorners, cutoutEditError, measureCutout, moveCutout, newCutout, placedCutout, resizeCutout } from '../src/cutoutInteraction.ts'
import { DEFAULT_SETTINGS, planDeck, polygonArea } from '../src/planner.ts'
import { installerPlan } from '../src/installerPlan.ts'
import type { Cutout } from '../src/planner.ts'

const outer=[{x:0,y:0},{x:8,y:0},{x:8,y:5},{x:0,y:5}]
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} differs from ${b}`)
test('one click centres rectangular, round and oval openings at the chosen location',()=>{
  for(const shape of ['rectangle','circle','oval'] as const){
    const h=placedCutout(shape,{x:3,y:2},shape,'Opening'),b=cutoutBounds(h)
    assert.equal(h.shape,shape);close(b.x,2.5);close(b.y,1.5);close(b.width,1);close(b.depth,1)
    assert.equal(cutoutEditError(outer,[h],.191),'')
  }
})
test('click-and-drag works in each direction and circles stay round even during vertical drags',()=>{
  for(const dx of [-2,2])for(const dy of [-1,1]){
    const h=newCutout('rectangle',{x:4,y:2},{x:4+dx,y:2+dy},'id','Opening'),b=cutoutBounds(h)
    close(b.width,2);close(b.depth,1);close(b.x,Math.min(4,4+dx));close(b.y,Math.min(2,2+dy))
    assert.equal(cutoutEditError(outer,[h],.191),'')
  }
  const circle=newCutout('circle',{x:2,y:1},{x:2,y:3},'id','Round'),b=cutoutBounds(circle)
  close(b.width,2);close(b.depth,2)
})
test('moving preserves shape, dimensions, identity and the untouched original geometry',()=>{
  const h=placedCutout('circle',{x:2,y:2},'tree','Tree'),before=JSON.stringify(h),next=moveCutout(h,1.25,-.3),b=cutoutBounds(next)
  close(b.x,2.75);close(b.y,1.2);close(b.width,1);close(b.depth,1)
  assert.equal(next.id,h.id);assert.equal(next.name,h.name);assert.equal(JSON.stringify(h),before)
  close(polygonArea(h.polygon),polygonArea(next.polygon))
})
test('each resize handle holds its opposite corner while changing the opening dimensions',()=>{
  const h=placedCutout('rectangle',{x:3,y:2},'id','Opening'),corners=cutoutCorners(h)
  for(let i=0;i<4;i++){
    const dx=[-.4,.4,.4,-.4][i],dy=[-.2,-.2,.2,.2][i],next=resizeCutout(h,i,{x:corners[i].x+dx,y:corners[i].y+dy}),b=cutoutBounds(next)
    close(b.width,1.4);close(b.depth,1.2)
    const fixed=cutoutCorners(next)[(i+2)%4];close(fixed.x,corners[(i+2)%4].x);close(fixed.y,corners[(i+2)%4].y)
  }
})
test('round resize is locked to equal dimensions; custom shapes retain their vertex order and proportions',()=>{
  const circle=resizeCutout(placedCutout('circle',{x:3,y:2},'id','Circle'),2,{x:4,y:4}),b=cutoutBounds(circle)
  close(b.width,b.depth)
  const custom:Cutout={id:'custom',name:'Planting',shape:'custom',polygon:[{x:2,y:1},{x:3,y:1},{x:3,y:2},{x:2.5,y:1.5},{x:2,y:2}]}
  const next=measureCutout(custom,3,2,2,1),box=cutoutBounds(next)
  assert.equal(next.polygon.length,5);close(box.x,3);close(box.y,2);close(box.width,2);close(box.depth,1)
  close(next.polygon[3].x,4);close(next.polygon[3].y,2.5)
})
test('out-of-bounds drags, overlapping openings, crossings and too many holes are rejected before applying',()=>{
  const h=placedCutout('rectangle',{x:2,y:2},'h','Opening')
  assert.ok(cutoutEditError(outer,[moveCutout(h,-3,0)],.191))
  assert.ok(cutoutEditError(outer,[h,{...moveCutout(h,.2,.1),id:'h2'}],.191))
  assert.ok(cutoutEditError(outer,[{...h,polygon:[{x:1,y:1},{x:2,y:2},{x:1,y:2},{x:2,y:1}]}],.191))
  assert.match(cutoutEditError(outer,Array.from({length:11},(_,i)=>({...h,id:String(i)})),.191),/10 cutouts/)
  const concave=[{x:0,y:0},{x:8,y:0},{x:8,y:5},{x:5,y:5},{x:5,y:2},{x:3,y:2},{x:3,y:5},{x:0,y:5}]
  assert.ok(cutoutEditError(concave,[placedCutout('rectangle',{x:4,y:3},'h','Opening')],.191))
})
test('a moved and resized interactive opening drives net area, board cuts and installer coordinates in both run directions',()=>{
  const start=placedCutout('rectangle',{x:1.5,y:1.5},'h','Planter'),moved=moveCutout(start,1,0),h=resizeCutout(moved,2,{x:3.5,y:2.4})
  for(const direction of ['horizontal','vertical'] as const){
    const settings={...DEFAULT_SETTINGS,cutouts:[h],direction},plan=planDeck(settings),drawing=installerPlan(plan,settings)
    close(plan.area,polygonArea(settings.polygon)-polygonArea(h.polygon))
    assert.deepEqual(drawing.cutouts[0].points,h.polygon.map(p=>({x:p.x*1000,y:p.y*1000})))
    assert.ok(plan.boards.pieces.every(b=>b.length<=settings.board.stock+1e-7))
  }
})
