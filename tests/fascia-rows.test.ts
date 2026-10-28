import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, fasciaBoardWidth, fasciaRowCount, planDeck } from '../src/planner.ts'
import { buildCsvReport } from '../src/csvExport.ts'
import { sceneComponent } from '../src/sceneComponents.ts'

test('fascia defaults on and automatic rows follow height and board width',()=>{
  assert.equal(DEFAULT_SETTINGS.skirting,true)
  assert.equal(fasciaBoardWidth(DEFAULT_SETTINGS),136)
  assert.equal(fasciaRowCount(DEFAULT_SETTINGS),2)
  assert.equal(fasciaRowCount({...DEFAULT_SETTINGS,height:433}),3)
  assert.equal(fasciaRowCount({...DEFAULT_SETTINGS,board:{...DEFAULT_SETTINGS.board,width:225}}),1)
  assert.equal(fasciaRowCount({...DEFAULT_SETTINGS,height:433,skirtingRows:1}),1)
})

test('stacked rows reach quantities, cut exports and distinct physical heights',()=>{
  const s={...DEFAULT_SETTINGS,skirtingHeight:100,skirtingRows:2},p=planDeck(s)
  const single=planDeck({...s,skirtingRows:1})
  assert.equal(p.skirtPieces.length,single.skirtPieces.length*2)
  assert.equal(p.skirtingGap,25)
  assert.equal(p.materials.find(m=>m.key==='skirting')!.qty,p.skirtBars.length)
  const index=p.skirtPieces.findIndex(q=>q.row===1)
  const first=sceneComponent(p,s,'fascia-0')!,second=sceneComponent(p,s,`fascia-${index}`)!
  assert.ok(Math.abs(first.point.z-second.point.z-.1)<1e-9)
  const csv=buildCsvReport('skirting',p,s,{})
  assert.equal(csv.rows.length,p.skirtPieces.length)
  assert.deepEqual(new Set(csv.rows.map(r=>r[csv.headers.indexOf('Fascia row')])),new Set([1,2]))
  assert.equal(planDeck({...s,skirting:false}).skirtPieces.length,0)
  for(const skirtingRows of [0,-1,1.5,NaN,101])assert.throws(()=>planDeck({...s,skirtingRows}),/Fascia board rows/)
})
