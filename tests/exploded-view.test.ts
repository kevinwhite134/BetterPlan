import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, planDeck } from '../src/planner.ts'
import { displacePart, explodedLayout } from '../src/explodedLayout.ts'
import { frameHardware } from '../src/frameHardware.ts'
import { deckLabelData } from '../src/deckLabelData.ts'
import { placeLabelMarkers, placeLabelBoxes } from '../src/labelMarkers.ts'
import { structurePaths } from '../src/structureGeometry.ts'
import { pickBoard, pickStructure } from '../src/sceneComponents.ts'

const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`)
test('zero explosion preserves coordinates and all visual changes leave the model and quantities intact',()=>{
  const p=planDeck(DEFAULT_SETTINGS),before=JSON.stringify(p),zero=explodedLayout(p,DEFAULT_SETTINGS,0),point={x:1,y:2,z:3}
  assert.equal(displacePart(point,zero,'board-0','board'),point)
  const full=explodedLayout(p,DEFAULT_SETTINGS,100)
  assert.ok(full.step>=1);assert.ok(full.levels.board>full.levels.joist+1)
  assert.equal(JSON.stringify(p),before)
})
test('individual board, member and joiner products separate within their tiers',()=>{
  const p=planDeck(DEFAULT_SETTINGS),full=explodedLayout(p,DEFAULT_SETTINGS,100)
  assert.ok(new Set(p.boards.pieces.map((_,i)=>JSON.stringify(full.offsets.get(`board-${i}`)))).size>5)
  assert.ok(new Set(p.frame.members.map((_,i)=>JSON.stringify(full.offsets.get(`member-${i}`)))).size>5)
  for(const c of frameHardware(p.frame).connections.filter(c=>c.kind==='butt')){
    const left=full.offsets.get(`side--1-${c.id}`)!,right=full.offsets.get(`side-1-${c.id}`)!
    assert.ok(Math.hypot(left.x-right.x,left.y-right.y)>.4,'paired joiners visibly separate from each other')
    assert.ok(full.offsets.has(`continuous-${c.id}`))
  }
})
test('every rendered pedestal stays assembled throughout explosion in both board directions',()=>{
  for(const direction of ['horizontal','vertical'] as const)for(const percentage of [0,25,50,100]){
    const s={...DEFAULT_SETTINGS,direction},p=planDeck(s),layout=explodedLayout(p,s,percentage)
    const seen=new Set<string>()
    structurePaths(p,s,'pedestals',true,35,52,(point,tier,id)=>{
      assert.ok(id)
      seen.add(id!)
      const product=id!.split(':')[0],expected=displacePart(point,layout,product,tier),actual=displacePart(point,layout,id,tier)
      near(actual.x,expected.x);near(actual.y,expected.y);near(actual.z,expected.z)
      return actual
    })
    for(let i=0;i<p.frame.pedestals.length;i++)for(const part of ['base','stem','head'])assert.ok(seen.has(`pedestal-${i}:${part}`))
  }
})
test('exploded layout bounds contain every component centre in either board direction',()=>{
  for(const direction of ['horizontal','vertical'] as const){
    const s={...DEFAULT_SETTINGS,direction,skirting:true},p=planDeck(s),layout=explodedLayout(p,s,100),b=layout.bounds
    for(const [id,centre] of layout.centres){const q=displacePart(centre,layout,id);assert.ok(q.x>=b.minX-1e-7&&q.x<=b.maxX+1e-7);assert.ok(q.y>=b.minY-1e-7&&q.y<=b.maxY+1e-7);assert.ok(q.z>=b.minZ-1e-7&&q.z<=b.maxZ+1e-7)}
    assert.equal(layout.centres.size,layout.offsets.size)
  }
})
test('batched structural drawing retains all parts and supplies individual IDs without one SVG element per face',()=>{
  const p=planDeck(DEFAULT_SETTINGS),ids=new Set<string>(),layout=explodedLayout(p,DEFAULT_SETTINGS,100)
  const drawing=structurePaths(p,DEFAULT_SETTINGS,'joists',true,35,52,(point,tier,id)=>{if(id)ids.add(id);return displacePart(point,layout,id,tier)})
  assert.equal(drawing.components.members,p.frame.members.length);assert.equal(drawing.components.pedestals,p.frame.pedestals.length)
  assert.ok(drawing.paths.length<=12)
  p.frame.members.forEach((_,i)=>assert.ok(ids.has(`member-${i}`)))
  p.frame.pedestals.forEach((_,i)=>{for(const part of ['base','stem','head'])assert.ok(ids.has(`pedestal-${i}:${part}`))})
  assert.ok(drawing.paths.every(p=>!p.path.includes('NaN')&&!p.path.includes('Infinity')))
})
test('component markers do not overlap even when multiple anchors coincide or leave the view',()=>{
  for(const view of [{x:0,y:0,w:10,h:8},{x:-5,y:-2,w:8,h:2},{x:0,y:0,w:2,h:8}]){
    const radius=view.w*.012,anchors=Array.from({length:13},(_,i)=>({x:i%3?view.x+view.w/2:view.x-100,y:view.y+view.h/2})),positions=placeLabelMarkers(anchors,view,radius)
    assert.ok(positions.every(Boolean))
    positions.forEach((p,i)=>{assert.ok(p!.x-radius>=view.x);assert.ok(p!.y-radius>=view.y);for(let j=0;j<i;j++)assert.ok(Math.hypot(p!.x-positions[j]!.x,p!.y-positions[j]!.y)>=radius*2)})
  }
})
test('product name boxes stay inside the view without overlapping at coincident anchors',()=>{
  for(const view of [{x:0,y:0,w:700,h:480},{x:-50,y:20,w:320,h:480}]){
    const anchors=Array.from({length:view.w<400?6:10},()=>({x:view.x-100,y:view.y+view.h/2})),sizes=anchors.map((_,i)=>({w:170,h:i%2?57:42}))
    const boxes=placeLabelBoxes(anchors,view,sizes,5)
    assert.ok(boxes.every(Boolean),'Every product name is visible')
    boxes.forEach((box,i)=>{
      assert.ok(box!.x>=view.x&&box!.y>=view.y&&box!.x+box!.w<=view.x+view.w&&box!.y+box!.h<=view.y+view.h)
      boxes.slice(0,i).forEach(other=>assert.ok(box!.x+box!.w<=other!.x||other!.x+other!.w<=box!.x||box!.y+box!.h<=other!.y||other!.y+other!.h<=box!.y))
    })
  }
})
test('exploded labels identify products with one label for the complete pedestal',()=>{
  const p=planDeck(DEFAULT_SETTINGS),layout=explodedLayout(p,DEFAULT_SETTINGS,100),labels=deckLabelData(p,DEFAULT_SETTINGS,'finished',true,layout)
  assert.ok(labels.some(l=>l.name.includes(DEFAULT_SETTINGS.board.name)));assert.ok(labels.some(l=>l.name.includes('Alu-Joist (K Series)')))
  const pedestals=labels.filter(l=>l.tier==='pedestal')
  assert.equal(pedestals.length,1)
  assert.equal(pedestals[0].id,'pedestal-0')
  assert.equal(pedestals[0].name,DEFAULT_SETTINGS.pedestalName)
  assert.equal(new Set(labels.map(l=>l.id)).size,labels.length)
  for(const label of labels)assert.deepEqual(label.point,layout.centres.get(label.id))
})
test('click targeting follows individually exploded board and member locations',()=>{
  const p=planDeck(DEFAULT_SETTINGS),s=DEFAULT_SETTINGS,layout=explodedLayout(p,s,100),project=(point:{x:number;y:number;z:number},tier?:'board'|'joist'|'bearer'|'pedestal',id?:string)=>{const q=displacePart(point,layout,id,tier);return {x:q.x,y:q.y-q.z*.1}}
  const centre=layout.centres.get('board-5')!,q=project(centre,'board','board-5')
  assert.equal(pickBoard(p,s,q,project),'board-5')
  const member=layout.centres.get('member-0')!,m=project(member,'bearer','member-0')
  assert.ok(pickStructure(p,s,m,'joists',false,project,.04))
})
