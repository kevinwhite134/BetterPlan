import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, frameRule, planDeck } from '../src/planner.ts'
import type { Settings } from '../src/planner.ts'
import { recommendFrames, selectAutomaticFrame } from '../src/frameRecommendation.ts'
import type { SelectionObjective } from '../src/frameRecommendation.ts'
import { materialEstimate } from '../src/materialEstimate.ts'
import { resolvedPricing } from '../src/pricing.ts'
import { validBreakerPlacement } from '../src/breakerPlacement.ts'

const rectangle=[{x:0,y:0},{x:3.6,y:0},{x:3.6,y:3.2},{x:0,y:3.2}]
const settings=(patch:Partial<Settings>={}):Settings=>({...DEFAULT_SETTINGS,polygon:rectangle,height:250,variation:0,board:{...DEFAULT_SETTINGS.board,stock:4.88},...patch})
const objectives:SelectionObjective[]=['cost','simple','pedestals']

test('cost and pedestal objectives make different checked choices for the same customer dimensions and height',()=>{
  const input=settings(),before=JSON.stringify(input)
  const cost=recommendFrames({...input,selectionObjective:'cost'}),fewest=recommendFrames({...input,selectionObjective:'pedestals'})
  assert.equal(recommendFrames(input).selected?.frame,cost.selected?.frame)
  assert.ok(cost.selected)
  assert.ok(fewest.selected)
  assert.ok(cost.selected!.materialCostCents!<=fewest.selected!.materialCostCents!)
  assert.ok(cost.selected!.pedestals>=fewest.selected!.pedestals)
  for(const result of [cost,fewest])for(const option of result.options)for(const candidate of option.alternatives){
    const plan=planDeck(candidate.settings),estimate=materialEstimate(plan,resolvedPricing(candidate.settings,{}))
    assert.equal(plan.heightFits,true);assert.equal(plan.frame.geometryPass,true);assert.equal(plan.frame.layoutStatus,'ready')
    assert.equal(candidate.materialCostCents,estimate.subtotalCents)
    assert.equal(candidate.pedestals,plan.frame.pedestals.length)
    assert.equal(candidate.stockLengths,Object.values(plan.frameCuts).reduce((sum,bars)=>sum+bars.length,0))
    assert.equal(candidate.memberPieces,Object.values(plan.framePieces).reduce((sum,pieces)=>sum+pieces.length,0))
    assert.ok(candidate.materialCostCents!>=cost.selected!.materialCostCents!)
    assert.ok(candidate.pedestals>=fewest.selected!.pedestals)
  }
  assert.equal(JSON.stringify(input),before)
})

test('simplest frame prioritises a single frame layer before the material-cost tie breaker',()=>{
  const rates={profile35:'0',profile80:'0',pedestals:'100'}
  const cost=recommendFrames(settings({selectionObjective:'cost'}),rates)
  const simple=recommendFrames(settings({selectionObjective:'simple'}),rates)
  assert.equal(cost.selected?.frame,'big-small');assert.equal(cost.selected?.frameLayers,2)
  assert.equal(simple.selected?.frame,'big');assert.equal(simple.selected?.frameLayers,1)
  assert.ok(simple.selected!.materialCostCents!>cost.selected!.materialCostCents!)
  assert.match(simple.reason,/Fewest frame layers/)
})

test('all fitting pedestal models are priced instead of taking the narrowest adjustment range',()=>{
  const input=settings({height:125,frame:'small',frameSelection:'manual',pedestalSelection:'auto'})
  const result=recommendFrames(input),option=result.options.find(o=>o.frame==='small')!
  assert.deepEqual(new Set(option.alternatives.map(c=>c.settings.pedestalName)),new Set(['VersiJack F2 Pedestal','SpiraPave T44 Pedestal']))
  assert.equal(option.choice?.settings.pedestalName,'VersiJack F2 Pedestal')
  const chosen=selectAutomaticFrame(input)
  assert.equal(chosen.frame,'small');assert.equal(chosen.height,125);assert.equal(chosen.pedestalName,'VersiJack F2 Pedestal')
  assert.equal(chosen.frameSelection,'manual');assert.equal(chosen.pedestalSelection,'auto')
})

test('price overrides and the objective invalidate cached recommendations, including explicit zero rates',()=>{
  const input=settings({selectionObjective:'cost'}),ordinary=recommendFrames(input)
  const rates={profile35:'0',profile80:'0',pedestals:'100'},changed=recommendFrames(input,rates)
  assert.ok(ordinary.selected);assert.equal(changed.selected?.frame,'big-small')
  assert.equal(selectAutomaticFrame(input,rates).frame,'big-small')
  const candidate=changed.selected!,plan=planDeck(candidate.settings),estimate=materialEstimate(plan,resolvedPricing(candidate.settings,rates))
  assert.equal(candidate.materialCostCents,estimate.subtotalCents)
  assert.equal(candidate.frameCostCents,candidate.pedestals*10000)
  const reordered=recommendFrames(input,{pedestals:'100',profile80:'0',profile35:'0'})
  assert.equal(reordered.selected?.materialCostCents,changed.selected?.materialCostCents)
  assert.equal(recommendFrames(input).selected?.materialCostCents,ordinary.selected?.materialCostCents)
  assert.equal(recommendFrames({...input,selectionObjective:'simple'},rates).selected?.frame,'big')
})

test('blank prices remain unpriced and cannot masquerade as a free alternative',()=>{
  const input=settings(),partial=recommendFrames(input,{profile80:''})
  assert.ok(partial.selected?.frame==='small'||partial.selected?.frame==='small-small')
  assert.ok(partial.options.filter(o=>o.frame==='big'||o.frame==='big-small').every(o=>o.alternatives.every(c=>c.materialCostCents===null)))
  assert.equal(partial.pricingComplete,false);assert.match(partial.reason,/fully priced.*some alternatives are unpriced/)
  const unpriced=recommendFrames(input,{pedestals:''})
  assert.equal(unpriced.pricingComplete,false);assert.equal(unpriced.selected?.materialCostCents,null)
  assert.equal(unpriced.selected?.frameLayers,1);assert.match(unpriced.reason,/prices are incomplete/)
})

test('all objectives preserve supplied height, variation, product geometry, and manual overrides',()=>{
  for(const selectionObjective of objectives){
    const input=settings({height:260,variation:10,selectionObjective}),chosen=selectAutomaticFrame(input),rule=frameRule(chosen.frame,chosen.load)
    assert.equal(chosen.height,input.height);assert.equal(chosen.variation,input.variation)
    assert.strictEqual(chosen.polygon,input.polygon);assert.strictEqual(chosen.board,input.board)
    const required={min:input.height-input.board.thickness-rule.joist-rule.bearer-input.variation,max:input.height-input.board.thickness-rule.joist-rule.bearer+input.variation}
    assert.ok(chosen.pedestalMin<=required.min);assert.ok(chosen.pedestalMax>=required.max)
    const manual={...input,frame:'small-small' as const,frameSelection:'manual' as const,pedestalSelection:'manual' as const}
    assert.strictEqual(selectAutomaticFrame(manual,{pedestals:'100'}),manual)
    const product={...input,pedestalSelection:'manual' as const,pedestalName:'Installer product',pedestalMin:40,pedestalMax:250,pedestalDiameter:155}
    const locked=selectAutomaticFrame(product)
    assert.equal(locked.pedestalName,product.pedestalName);assert.equal(locked.pedestalMin,product.pedestalMin);assert.equal(locked.pedestalMax,product.pedestalMax);assert.equal(locked.pedestalDiameter,product.pedestalDiameter)
  }
})

test('cache rebasing preserves current metadata, confirmations, objective, and breaker preference for every alternative',()=>{
  const original=settings({selectionObjective:'simple',breakerWidth:'double'})
  recommendFrames(original)
  const changed={...original,confirmed:true,edgeDetailConfirmed:true,board:{...original.board,id:'saved',name:'Saved profile',colour:'#123456',colourName:'Blue'}}
  const result=recommendFrames(changed)
  assert.ok(result.selected)
  for(const option of result.options)for(const choice of option.alternatives){
    assert.strictEqual(choice.settings.board,changed.board)
    assert.equal(choice.settings.confirmed,true);assert.equal(choice.settings.edgeDetailConfirmed,true)
    assert.equal(choice.settings.selectionObjective,'simple');assert.equal(choice.settings.breakerWidth,'double')
  }
})

test('manual breakers reconciled for each candidate retain their checked positions when applied or cached',()=>{
  const input=settings({polygon:DEFAULT_SETTINGS.polygon,breakerMode:'manual',breakerPositions:[-99,99],board:{...DEFAULT_SETTINGS.board,stock:15},confirmed:true,edgeDetailConfirmed:true})
  const result=recommendFrames(input),choice=result.selected!
  assert.ok(choice);assert.notDeepEqual(choice.settings.breakerPositions,input.breakerPositions)
  assert.equal(validBreakerPlacement(choice.settings,choice.settings.breakerPositions!),true)
  const applied=selectAutomaticFrame(input),plan=planDeck(applied)
  assert.deepEqual(applied.breakerPositions,choice.settings.breakerPositions)
  assert.equal(applied.confirmed,false);assert.equal(applied.edgeDetailConfirmed,false)
  assert.equal(plan.frame.geometryPass,true)
  assert.equal(materialEstimate(plan,resolvedPricing(applied,{})).subtotalCents,choice.materialCostCents)
  const renamed={...input,board:{...input.board,name:'Renamed board'}},cached=recommendFrames(renamed).selected!
  assert.strictEqual(cached.settings.board,renamed.board)
  assert.deepEqual(cached.settings.breakerPositions,choice.settings.breakerPositions)
  assert.equal(cached.settings.edgeDetailConfirmed,false)
  assert.deepEqual(selectAutomaticFrame(renamed).breakerPositions,choice.settings.breakerPositions)
})

test('an impossible height reports no choice under every objective without altering the customer constraint',()=>{
  for(const selectionObjective of objectives){
    const input=settings({height:30,selectionObjective}),result=recommendFrames(input),chosen=selectAutomaticFrame(input)
    assert.equal(result.selected,null);assert.ok(result.options.every(o=>o.choice===null&&o.alternatives.length===0&&o.reason))
    assert.equal(chosen.height,30);assert.equal(chosen.variation,input.variation)
    assert.equal(chosen.pedestalName,input.pedestalName);assert.match(result.reason,/No frame and pedestal combination/)
  }
})
