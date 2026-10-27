import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, planDeck } from '../src/planner.ts'
import type { Settings } from '../src/planner.ts'
import { buildCsvReport } from '../src/csvExport.ts'
import { materialEstimate } from '../src/materialEstimate.ts'
import { structureGeometry } from '../src/structureGeometry.ts'

const polygon=[{x:0,y:0},{x:4.2,y:0},{x:4.7,y:3.8},{x:0,y:3.3}]
function groups(s:Settings){
  const p=planDeck(s),xs=[...new Set(p.boards.pieces.filter(q=>q.kind==='breaker').map(q=>q.x.toFixed(6)))]
  return {p,runs:xs.map(x=>p.boards.pieces.filter(q=>q.kind==='breaker'&&q.x.toFixed(6)===x).sort((a,b)=>a.y-b.y))}
}

test('paired breakers on sloping edges share real stock-joint supports instead of overlapping ladders',()=>{
  for(const frame of ['small','big'] as const)for(const load of [3,5] as const)for(const width of [136,156])for(const flip of [false,true]){
    const s:Settings={...DEFAULT_SETTINGS,polygon:flip?polygon.map(q=>({x:q.y,y:q.x})):polygon,direction:flip?'horizontal':'vertical',frame,load,pedestalDiameter:205,board:{...DEFAULT_SETTINGS.board,width},breakerMode:'manual',breakerPositions:[1.9]}
    const {p,runs}=groups(s)
    assert.equal(p.frame.geometryPass,true,p.frame.issues.join('\n'))
    assert.equal(runs.length,2);assert.ok(runs.every(r=>r.length===2),'Each overlong board has exactly one necessary stock joint')
    const centres=runs.map(r=>(r[0].y+r[0].length+r[1].y)/2)
    assert.ok(Math.abs(centres[0]-centres[1])<1e-7,'Adjacent boards share the same joint support row')
    for(const m of p.frame.members.filter(m=>m.kind==='noggin'))assert.ok(Math.hypot(m.a.x-m.b.x,m.a.y-m.b.y)<=.4+1e-5)
    for(const run of runs)for(const piece of run)assert.ok(piece.length<=s.board.stock+1e-7)
    for(const centre of centres)assert.ok(p.frame.members.some(m=>m.kind==='noggin'&&Math.abs(m.a.y-centre)<1e-5),'Joint has an actual support, not just an adjusted drawn position')
    const cuts=buildCsvReport('boards',p,s,{})
    assert.equal(cuts.rows.length,p.boards.pieces.length)
  }
})

test('aligning paired joints never splits a neighbouring board that already fits stock',()=>{
  const s:Settings={...DEFAULT_SETTINGS,polygon:[{x:0,y:0},{x:3.68,y:0},{x:4.18,y:3.8},{x:0,y:3.3}],direction:'vertical',frame:'big',pedestalDiameter:205,breakerMode:'manual',breakerPositions:[1.9]}
  const {p,runs}=groups(s)
  assert.deepEqual(runs.map(r=>r.length).sort(),[1,2])
  assert.equal(p.frame.geometryPass,true,p.frame.issues.join('\n'))
  for(const run of runs){const total=run.at(-1)!.y+run.at(-1)!.length-run[0].y,minimum=Math.ceil((total+s.board.endGap/1000)/(s.board.stock+s.board.endGap/1000)-1e-7);assert.equal(run.length,minimum)}
})

test('failed candidates retain a diagnostic draft but cannot leak into quantities, exports or 3D supports',()=>{
  const s:Settings={...DEFAULT_SETTINGS,frame:'big',pedestalDiameter:50,frameFaceWidth:150,joistSpacing:100}
  const p=planDeck(s)
  assert.equal(p.frame.geometryPass,false);assert.equal(p.frame.layoutStatus,'unbuildable')
  assert.ok(p.frame.diagnostic.members.length>0);assert.ok(p.frame.diagnostic.pedestals.length>0)
  assert.equal(p.frame.members.length,0);assert.equal(p.frame.pedestals.length,0)
  assert.equal(buildCsvReport('frame',p,s,{}).rows.length,0);assert.equal(buildCsvReport('pedestals',p,s,{}).rows.length,0)
  assert.ok(materialEstimate(p,{}).lines.filter(q=>q.key==='pedestals'||q.key.startsWith('profile')).every(q=>q.pending))
  assert.equal(structureGeometry(p,s,'joists',true).length,0)
})
