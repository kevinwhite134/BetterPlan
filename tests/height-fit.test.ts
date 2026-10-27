import test from 'node:test'
import assert from 'node:assert/strict'
import { heightFit } from '../src/heightFit.ts'
import { DEFAULT_SETTINGS, frameRule, planDeck } from '../src/planner.ts'
import type { Frame } from '../src/planner.ts'
import { PEDESTAL_MODELS } from '../src/productNames.ts'
const frames:Frame[]=['small','small-small','big','big-small']

test('the shared height check gives the same required adjustment and result as the project plan',()=>{
  for(const frame of frames)for(const height of [70,150,250,400]){
    const settings={...DEFAULT_SETTINGS,frame,height},check=heightFit(settings,frameRule(frame,settings.load)),plan=planDeck(settings)
    assert.equal(plan.heightFits,check.fits)
    assert.deepEqual(plan.range,check.required)
  }
})

test('too-low and too-high checks explain failure without suggesting a change to customer height',()=>{
  const settings={...DEFAULT_SETTINGS,frame:'small-small' as const,height:70},rule=frameRule(settings.frame,settings.load),low=heightFit(settings,rule)
  assert.equal(low.status,'too-low');assert.deepEqual(low.required,{min:-45,max:-5});assert.deepEqual(low.total,{min:150,max:325})
  assert.equal(settings.height,70,'customer height is never replaced by a suggested height')
  const high=heightFit({...settings,height:400},rule)
  assert.equal(high.status,'too-high');assert.ok(!Object.hasOwn(high,'nearest'))
})

test('a pedestal with less travel than the total ground variation cannot fit at any height or frame',()=>{
  for(const frame of frames)for(const height of [70,100,117,150,200,300,500]){
    const settings={...DEFAULT_SETTINGS,frame,height,pedestalMin:37,pedestalMax:50,variation:20},check=heightFit(settings,frameRule(frame,settings.load))
    assert.equal(check.status,'insufficient-travel');assert.equal(check.fits,false)
    assert.equal(check.travel,13);assert.equal(check.requiredTravel,40)
    assert.match(check.reason,/Select a pedestal with enough travel/)
  }
})

test('published model boundaries pass when travel covers ground variation; increasing height alone never bypasses a narrow range',()=>{
  for(const model of PEDESTAL_MODELS)for(const frame of frames)for(const variation of [0,5,20]){
    const settings={...DEFAULT_SETTINGS,frame,variation,pedestalMin:model.min,pedestalMax:model.max},rule=frameRule(frame,settings.load),check=heightFit(settings,rule)
    if(model.max-model.min<2*variation){assert.equal(check.status,'insufficient-travel');continue}
    for(const height of [check.total.min,check.total.max])assert.ok(heightFit({...settings,height},rule).fits,`${model.name} ${frame} at ${height}`)
    assert.equal(heightFit({...settings,height:check.total.min-.01},rule).fits,false)
    assert.equal(heightFit({...settings,height:check.total.max+.01},rule).fits,false)
  }
})

test('decimal boundaries tolerate floating point rounding without allowing a real height mismatch',()=>{
  const settings={...DEFAULT_SETTINGS,frame:'small-small' as const,height:138.5,variation:6.2,pedestalMin:37.3,pedestalMax:49.7},rule=frameRule(settings.frame,settings.load)
  assert.equal(heightFit(settings,rule).fits,true)
  assert.equal(heightFit({...settings,height:138.501},rule).fits,false)
})

test('empty or reversed limits ask for valid inputs and never suggest a fictional compatible height',()=>{
  for(const patch of [{height:NaN},{variation:NaN},{pedestalMin:NaN},{pedestalMax:NaN},{pedestalMin:100,pedestalMax:50},{variation:1001},{pedestalMax:3001}]){
    const settings={...DEFAULT_SETTINGS,...patch},check=heightFit(settings,frameRule(settings.frame,settings.load))
    assert.equal(check.status,'invalid');assert.equal(check.fits,false)
  }
  const settings={...DEFAULT_SETTINGS,pedestalMin:1990,pedestalMax:2200}
  assert.equal(heightFit(settings,frameRule(settings.frame,settings.load)).fits,false)
})
