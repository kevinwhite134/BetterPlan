import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, planDeck, validateSettings } from '../src/planner.ts'
import { pedestalSelectionMode, recommendFrames, selectAutomaticFrame } from '../src/frameRecommendation.ts'
import { PEDESTAL_MODELS } from '../src/productNames.ts'

const f1={pedestalName:'VersiJack F1 Pedestal',pedestalMin:37,pedestalMax:50,pedestalDiameter:190}
const f4={pedestalName:'VersiJack F4 Pedestal',pedestalMin:117,pedestalMax:201,pedestalDiameter:205}

test('automatic mode chooses a real catalogue model rather than preserving a broad custom placeholder',()=>{
  const input={...DEFAULT_SETTINGS,height:250},before=JSON.stringify(input),chosen=selectAutomaticFrame(input),model=PEDESTAL_MODELS.find(p=>p.name===chosen.pedestalName)
  assert.ok(model);assert.equal(chosen.pedestalName,'VersiJack F4 Pedestal');assert.equal(chosen.frame,'big')
  assert.equal(chosen.pedestalMin,model.min);assert.equal(chosen.pedestalMax,model.max);assert.equal(chosen.pedestalDiameter,model.diameter)
  assert.equal(chosen.height,250);assert.equal(chosen.variation,20);assert.equal(planDeck(chosen).heightFits,true)
  assert.equal(JSON.stringify(input),before)
  assert.ok(planDeck(chosen).materials.some(m=>m.key==='pedestals'&&m.name===model.name))
})

test('automatic pedestals update with customer height while a manually chosen frame stays fixed',()=>{
  const input={...DEFAULT_SETTINGS,frameSelection:'manual' as const,pedestalSelection:'auto' as const,frame:'big-small' as const,height:280}
  const low=selectAutomaticFrame(input),high=selectAutomaticFrame({...low,height:360})
  assert.equal(low.pedestalName,'VersiJack F4 Pedestal');assert.equal(high.pedestalName,'VersiJack F5 Pedestal')
  for(const chosen of [low,high]){assert.equal(chosen.frame,'big-small');assert.equal(chosen.frameSelection,'manual');assert.equal(chosen.pedestalSelection,'auto');assert.equal(planDeck(chosen).heightFits,true);assert.equal(planDeck(chosen).frame.geometryPass,true)}
  assert.equal(low.height,280);assert.equal(high.height,360)
})

test('a pedestal override remains selected while automatic frame selection adapts to it',()=>{
  const chosen=selectAutomaticFrame({...DEFAULT_SETTINGS,...f4,height:250,pedestalSelection:'manual'})
  assert.equal(chosen.frame,'big');assert.equal(chosen.frameSelection,'auto');assert.equal(chosen.pedestalSelection,'manual')
  for(const s of [chosen,selectAutomaticFrame({...chosen,height:400})]){
    assert.equal(s.pedestalName,f4.pedestalName);assert.equal(s.pedestalMin,117);assert.equal(s.pedestalMax,201);assert.equal(s.pedestalDiameter,205)
  }
  const custom=selectAutomaticFrame({...DEFAULT_SETTINGS,pedestalSelection:'manual'})
  assert.equal(custom.pedestalName,DEFAULT_SETTINGS.pedestalName);assert.equal(custom.pedestalMax,250)
})

test('turning automatic pedestal mode back on replaces an unsuitable override without unlocking the manual frame',()=>{
  const manual={...DEFAULT_SETTINGS,...f1,frame:'big-small' as const,height:280,frameSelection:'manual' as const,pedestalSelection:'manual' as const}
  assert.strictEqual(selectAutomaticFrame(manual),manual)
  const chosen=selectAutomaticFrame({...manual,pedestalSelection:'auto'})
  assert.equal(chosen.pedestalName,'VersiJack F4 Pedestal');assert.equal(chosen.frame,'big-small');assert.equal(chosen.height,280)
})

test('automatic pedestal mode recovers from incomplete custom limits; manual input is never overwritten',()=>{
  const input={...DEFAULT_SETTINGS,height:280,pedestalMin:NaN,pedestalMax:NaN}
  const chosen=selectAutomaticFrame(input)
  assert.equal(chosen.pedestalName,'VersiJack F4 Pedestal');assert.equal(chosen.height,280);assert.equal(validateSettings(chosen),'')
  const manual=selectAutomaticFrame({...input,pedestalSelection:'manual'})
  assert.ok(Number.isNaN(manual.pedestalMin));assert.ok(Number.isNaN(manual.pedestalMax))
})

test('no catalogue model means no automatic choice; neither customer height nor a manual frame is altered',()=>{
  const input={...DEFAULT_SETTINGS,frameSelection:'manual' as const,pedestalSelection:'auto' as const,frame:'big-small' as const,height:250}
  const result=recommendFrames(input),chosen=selectAutomaticFrame(input)
  assert.equal(result.options.find(o=>o.frame===input.frame)!.choice,null)
  assert.equal(chosen.frame,input.frame);assert.equal(chosen.height,input.height);assert.equal(chosen.variation,input.variation)
  assert.equal(chosen.pedestalSelection,'auto')
  const impossible={...DEFAULT_SETTINGS,height:70}
  assert.equal(recommendFrames(impossible).selected,null);assert.equal(selectAutomaticFrame(impossible).height,70)
})

test('selection modes persist in project data and legacy manual product choices remain manual',()=>{
  const chosen=selectAutomaticFrame({...DEFAULT_SETTINGS,height:280}),restored=JSON.parse(JSON.stringify(chosen))
  assert.equal(validateSettings(restored),'');assert.equal(selectAutomaticFrame(restored).pedestalName,chosen.pedestalName)
  const {pedestalSelection:omitted,...legacy}={...DEFAULT_SETTINGS,...f1,frameSelection:'manual' as const}
  void omitted
  assert.equal(pedestalSelectionMode(legacy),'manual');assert.strictEqual(selectAutomaticFrame(legacy),legacy)
  assert.match(validateSettings({...DEFAULT_SETTINGS,pedestalSelection:'wrong' as 'auto'}),/pedestal selection mode/)
})
