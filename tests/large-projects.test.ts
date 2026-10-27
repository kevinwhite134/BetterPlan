import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, packCuts, polygonError, validateSettings } from '../src/planner.ts'
import type { StockBar } from '../src/planner.ts'
import { fitOutline, panOutline, visibleGrid, zoomOutline } from '../src/outlineViewport.ts'
import { MAX_PROJECT_SIZE } from '../src/projectLimits.ts'

const rectangle=(w:number,d:number,x=0,y=0)=>[{x,y},{x:x+w,y},{x:x+w,y:y+d},{x,y:y+d}]
function referencePacking(lengths:number[],stock:number,kerf:number){
  const bars:StockBar[]=[]
  for(const cut of lengths.map((length,piece)=>({length,piece})).sort((a,b)=>b.length-a.length)){
    let best=-1,rest=Infinity
    for(let i=0;i<bars.length;i++){const remaining=bars[i].remaining-cut.length-kerf;if(remaining>=-1e-7&&remaining<rest){best=i;rest=remaining}}
    if(best===-1)bars.push({cuts:[cut],remaining:Math.max(0,stock-cut.length)})
    else{bars[best].cuts.push(cut);bars[best].remaining=Math.max(0,rest)}
  }
  return bars
}

test('100 by 100 m projects and translated outlines pass physical size validation',()=>{
  assert.equal(MAX_PROJECT_SIZE,100)
  assert.equal(validateSettings({...DEFAULT_SETTINGS,polygon:rectangle(100,100)}),'')
  assert.equal(polygonError(rectangle(100,100,-550,-600)),'')
  assert.match(polygonError(rectangle(100.01,100)),/100 m/)
  assert.match(polygonError(rectangle(100,100,1001,0)),/drawing origin/)
  assert.match(validateSettings({...DEFAULT_SETTINGS,polygon:rectangle(100,100),board:{...DEFAULT_SETTINGS.board,stock:.3}}),/30,000 cutting blanks/)
})

test('normal projects retain their familiar initial camera and reveal extra space only when zooming out',()=>{
  const small=rectangle(6,4),camera=fitOutline(small),before=JSON.stringify(small)
  assert.ok(camera.width<10&&camera.height<10)
  const anchor={x:2,y:1},out=zoomOutline(camera,4,anchor)
  assert.equal(out.width,camera.width*4)
  assert.ok(Math.abs((anchor.x-camera.x)/camera.width-(anchor.x-out.x)/out.width)<1e-10)
  assert.ok(Math.abs((anchor.y-camera.y)/camera.height-(anchor.y-out.y)/out.height)<1e-10)
  assert.deepEqual(zoomOutline(out,.25,anchor),camera)
  assert.equal(JSON.stringify(small),before)
  assert.ok(fitOutline(rectangle(100,100)).width>100)
})

test('large-space pan and adaptive grid do not resize the project or allow unusable zoom levels',()=>{
  const camera=fitOutline(rectangle(6,4)),moved=panOutline(camera,{x:70,y:-50})
  assert.equal(moved.width,camera.width);assert.equal(moved.height,camera.height)
  assert.equal(moved.x,camera.x+70);assert.equal(moved.y,camera.y-50)
  assert.equal(visibleGrid(camera),.1)
  const large=fitOutline(rectangle(100,100))
  assert.ok(visibleGrid(large)>=1&&large.width/visibleGrid(large)<=100)
  assert.ok(zoomOutline(camera,1e9).width<=400)
  assert.ok(Math.min(zoomOutline(camera,1e-9).width,zoomOutline(camera,1e-9).height)>=.25-1e-9)
})

test('indexed best-fit packing retains exact stock, cut order and tie decisions',()=>{
  let seed=6743
  for(let run=0;run<12;run++){
    const lengths=Array.from({length:300},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return .05+(seed%3550)/1000})
    assert.deepEqual(packCuts(lengths,3.66,.003),referencePacking(lengths,3.66,.003))
  }
  const boundaries=[3.66,1.8,1.85700005,1.85700011,.1,.1,.1,0,0]
  assert.deepEqual(packCuts(boundaries,3.66,.003),referencePacking(boundaries,3.66,.003))
})

test('large stock schedules conserve all blanks without a quadratic search through purchased bars',()=>{
  const lengths=Array.from({length:25000},(_,i)=>.1+(i%89)/25),bars=packCuts(lengths,3.66,.003)
  assert.equal(bars.reduce((n,b)=>n+b.cuts.length,0),lengths.length)
  const ids=bars.flatMap(b=>b.cuts.map(c=>c.piece)).sort((a,b)=>a-b)
  assert.deepEqual(ids,lengths.map((_,i)=>i))
  for(const bar of bars)assert.ok(Math.abs(bar.cuts.reduce((n,c)=>n+c.length,0)+(bar.cuts.length-1)*.003+bar.remaining-3.66)<1e-6)
})
