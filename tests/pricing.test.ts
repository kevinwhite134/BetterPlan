import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultPricing, resolvedPricing } from '../src/pricing.ts'
import { DEFAULT_SETTINGS, planDeck } from '../src/planner.ts'
import { PEDESTAL_MODELS } from '../src/productNames.ts'
import { materialEstimate } from '../src/materialEstimate.ts'
import { buildCsvReport } from '../src/csvExport.ts'
import { createDeckWorkbook } from '../src/workbookExport.ts'

test('default stock rates use net euro prices per purchased item, not gross or per-metre amounts',()=>{
  const {rates}=defaultPricing(DEFAULT_SETTINGS)
  assert.deepEqual(rates,{boards:'35.51',profile35:'34.44',profile80:'41.33',pedestals:'11.21',skirting:'48.04',clips:'0.60',continuousJoiners:'1.68',joistJoiners:'1.20',perpendicularJoiners:'1.20'})
})

test('published pedestal models use their own single-unit rate with Dutch VAT removed',()=>{
  const expected:Record<string,string>={'VersiJack F1 Pedestal':'3.98','VersiJack F2 Pedestal':'4.59','VersiJack F3 Pedestal':'6.07','VersiJack F4 Pedestal':'11.21','SpiraPave T12 Pedestal':'2.56','SpiraPave T22 Pedestal':'3.24','SpiraPave T33 Pedestal':'3.78'}
  for(const model of PEDESTAL_MODELS){
    const s={...DEFAULT_SETTINGS,pedestalName:model.name,pedestalMin:model.min,pedestalMax:model.max,pedestalDiameter:model.diameter}
    if(expected[model.name])assert.equal(defaultPricing(s).rates.pedestals,expected[model.name])
  }
  const renamed={...DEFAULT_SETTINGS,pedestalName:'VersiJack F3 Pedestal'}
  assert.equal(defaultPricing(renamed).rates.pedestals,'11.21','a custom size must not silently inherit an incompatible named model rate')
})

test('stock length, board width and fascia height change their automatic purchase rates',()=>{
  const s={...DEFAULT_SETTINGS,board:{...DEFAULT_SETTINGS.board,stock:4.88,width:140},frameStock:4,skirtingHeight:184}
  const {rates}=defaultPricing(s)
  assert.equal(rates.boards,'48.74')
  assert.equal(rates.profile35,'37.64')
  assert.equal(rates.skirting,'86.67')
  assert.equal(defaultPricing({...s,board:{...s.board,stock:3.66}}).rates.skirting,'65.00')
})

test('manual rates including zero and a cleared rate remain authoritative and are not mutated',()=>{
  const overrides={boards:'0',pedestals:'',profile35:'24.1234'},copy={...overrides}
  const rates=resolvedPricing(DEFAULT_SETTINGS,overrides)
  assert.equal(rates.boards,'0');assert.equal(rates.pedestals,'');assert.equal(rates.profile35,'24.1234')
  assert.deepEqual(overrides,copy)
  const changed={...DEFAULT_SETTINGS,board:{...DEFAULT_SETTINGS.board,stock:4.88}}
  assert.equal(resolvedPricing(changed,overrides).boards,'0')
  assert.notEqual(resolvedPricing(changed,{}).boards,resolvedPricing(DEFAULT_SETTINGS,{}).boards)
})

test('automatic rates reconcile between the materials table, CSV and linked Excel quote',()=>{
  const s={...DEFAULT_SETTINGS,skirting:false},plan=planDeck(s),rates=resolvedPricing(s,{})
  const estimate=materialEstimate(plan,rates),csv=buildCsvReport('quote',plan,s,rates),wb=createDeckWorkbook(plan,s,rates)
  assert.equal(estimate.complete,true)
  assert.equal(csv.rows.find(r=>r[0]==='Summary')![6],estimate.subtotalCents/100)
  for(const [i,line] of estimate.lines.entries())assert.equal(wb.getWorksheet('Quote')!.getCell(i+9,5).result,line.cents!/100)
  const withFascia=planDeck({...s,skirting:true})
  assert.equal(estimate.lines.some(r=>r.key==='skirting'),false)
  assert.ok(materialEstimate(withFascia,rates).subtotalCents>estimate.subtotalCents)
})

test('preloaded rates never turn unresolved frame quantities into a complete total',()=>{
  const s={...DEFAULT_SETTINGS,frameFaceWidth:10},plan=planDeck(s),rates=resolvedPricing(s,{})
  const estimate=materialEstimate(plan,rates)
  assert.equal(estimate.complete,false)
  for(const line of estimate.lines.filter(r=>r.key==='pedestals'||r.key.startsWith('profile'))){assert.equal(line.pending,true);assert.equal(line.cents,null)}
})
