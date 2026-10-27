import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, frameRule, planDeck, validateSettings } from '../src/planner.ts'
import { applyFrameChoice, recommendFrames, selectAutomaticFrame } from '../src/frameRecommendation.ts'
import { PEDESTAL_MODELS } from '../src/productNames.ts'

test('saving board metadata reuses support choices while returning current product details',()=>{
  const original=recommendFrames(DEFAULT_SETTINGS)
  const s={...DEFAULT_SETTINGS,board:{...DEFAULT_SETTINGS.board,id:'saved-profile',name:'Saved board',colour:'#556677',colourName:'Grey'},confirmed:true,edgeDetailConfirmed:true}
  const renamed=recommendFrames(s)
  assert.equal(renamed.selected?.frame,original.selected?.frame)
  assert.equal(renamed.selected?.pedestals,original.selected?.pedestals)
  for(const option of renamed.options)if(option.choice){assert.deepEqual(option.choice.settings.board,s.board);assert.equal(option.choice.settings.confirmed,true);assert.equal(option.choice.settings.edgeDetailConfirmed,true)}
  const invalid=recommendFrames({...s,board:{...s.board,colour:'invalid'}})
  assert.ok(invalid.error);assert.equal(invalid.selected,null)
})

test('automatic choice fits frame and pedestal around the fixed customer height and prefers fewer checked pedestals',()=>{
  for(const height of [150,250]){
    const settings={...DEFAULT_SETTINGS,height,pedestalSelection:'manual' as const,selectionObjective:'pedestals' as const},before=JSON.stringify(settings),result=recommendFrames(settings),choice=result.selected!
    assert.ok(choice)
    assert.equal(choice.frame,height===150?'small-small':'big-small')
    assert.ok(result.options.flatMap(o=>o.choice?[o.choice]:[]).every(c=>c.pedestals>=choice.pedestals))
    const applied=selectAutomaticFrame(settings),plan=planDeck(applied)
    assert.equal(applied.height,height);assert.equal(applied.variation,settings.variation)
    assert.strictEqual(applied.board,settings.board);assert.strictEqual(applied.polygon,settings.polygon)
    assert.equal(plan.heightFits,true);assert.equal(plan.frame.geometryPass,true)
    assert.equal(plan.frame.pedestals.length,choice.pedestals)
    assert.equal(JSON.stringify(settings),before)
  }
})

test('an unsuitable pedestal can be replaced by a listed product instead of changing customer height or ground variation',()=>{
  const settings={...DEFAULT_SETTINGS,height:280,pedestalName:'VersiJack F1 Pedestal',pedestalMin:37,pedestalMax:50,pedestalDiameter:190},chosen=selectAutomaticFrame(settings)
  assert.equal(chosen.height,280);assert.equal(chosen.variation,20)
  assert.ok(chosen.frame==='big'||chosen.frame==='big-small');assert.equal(chosen.pedestalName,'VersiJack F4 Pedestal')
  const model=PEDESTAL_MODELS.find(p=>p.name===chosen.pedestalName)!
  assert.equal(chosen.pedestalMin,model.min);assert.equal(chosen.pedestalMax,model.max);assert.equal(chosen.pedestalDiameter,model.diameter)
  assert.equal(planDeck(chosen).heightFits,true)
})

test('height alone never approves a frame whose support geometry fails on a shaped outline',()=>{
  const polygon=[{x:0,y:0},{x:6,y:0},{x:6,y:2},{x:4,y:2},{x:4,y:4},{x:0,y:4}]
  for(const direction of ['horizontal','vertical'] as const)for(const load of [3,5] as const){
    const settings={...DEFAULT_SETTINGS,polygon,direction,load},result=recommendFrames(settings)
    assert.ok(result.selected)
    for(const option of result.options)if(option.choice){
      const plan=planDeck(option.choice.settings)
      assert.equal(plan.frame.geometryPass,true);assert.equal(plan.frame.layoutStatus,'ready');assert.equal(plan.heightFits,true)
      assert.equal(plan.frame.rule.support,frameRule(option.frame,load).support)
    }
  }
})

test('no matching option retains the supplied height, variation, board and product limits without inventing a solution',()=>{
  const settings={...DEFAULT_SETTINGS,height:70},result=recommendFrames(settings),applied=selectAutomaticFrame(settings)
  assert.equal(result.selected,null);assert.ok(result.options.every(o=>o.choice===null&&o.reason.length>0))
  assert.equal(applied.height,70);assert.equal(applied.variation,20)
  assert.equal(applied.pedestalMin,settings.pedestalMin);assert.equal(applied.pedestalMax,settings.pedestalMax)
  assert.equal(applied.pedestalDiameter,settings.pedestalDiameter);assert.strictEqual(applied.board,settings.board)
})

test('manual selection is retained and a chosen automatic assembly clears obsolete connection approvals',()=>{
  const manual={...DEFAULT_SETTINGS,frameSelection:'manual' as const,pedestalSelection:'manual' as const,height:250,frame:'small-small' as const}
  assert.strictEqual(selectAutomaticFrame(manual),manual)
  const choice=recommendFrames(manual).selected!,applied=applyFrameChoice({...manual,edgeDetailConfirmed:true,confirmed:true},choice,'auto')
  assert.equal(applied.frameSelection,'auto');assert.equal(applied.height,250)
  assert.equal(applied.edgeDetailConfirmed,false);assert.equal(applied.confirmed,false)
  assert.equal(validateSettings(applied),'')
})

test('incomplete inputs and unsupported high customer heights do not get changed to hide a failure',()=>{
  for(const patch of [{height:NaN},{pedestalMax:NaN},{height:1500}]){
    const settings={...DEFAULT_SETTINGS,...patch,pedestalSelection:'manual' as const},chosen=selectAutomaticFrame(settings)
    assert.ok(Object.is(chosen.height,settings.height));assert.ok(Object.is(chosen.pedestalMax,settings.pedestalMax))
    assert.equal(recommendFrames(settings).selected,null)
  }
  assert.match(validateSettings({...DEFAULT_SETTINGS,frameSelection:'wrong' as 'auto'}),/selection mode/)
})
