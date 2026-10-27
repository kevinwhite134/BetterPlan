import { heightFit } from './heightFit.ts'
import { FRAME_NAMES, frameRule, planDeck, validateSettings } from './planner.ts'
import type { Frame, Plan, Settings } from './planner.ts'
import { PEDESTAL_MODELS } from './productNames.ts'
import { resolvedPricing } from './pricing.ts'
import { materialEstimate } from './materialEstimate.ts'
import { keepBreakersInBounds } from './breakerPlacement.ts'

export type SelectionObjective='cost'|'simple'|'pedestals'|'spread'
export const SELECTION_OBJECTIVES:{id:SelectionObjective;label:string;description:string}[]=[
  {id:'cost',label:'Lowest material cost',description:'Compare actual stock quantities and rates, then prefer the simpler frame.'},
  {id:'simple',label:'Simplest frame',description:'Prefer fewer frame layers, then compare material cost.'},
  {id:'pedestals',label:'Fewest pedestals',description:'Minimise pedestal count, then compare material cost.'},
  {id:'spread',label:'More pedestals',description:'Prefer the highest pedestal count among checked layouts, then compare material cost. Roof and substrate load capacity still require verification.'},
]
export type FrameChoice={frame:Frame;settings:Settings;pedestals:number;memberLength:number;required:{min:number;max:number};usesCurrentPedestal:boolean;materialCostCents:number|null;frameCostCents:number|null;stockLengths:number;frameLayers:number;profileTypes:number;memberPieces:number;pedestalModels:number;scoreExplanation:string}
export type FrameOption={frame:Frame;choice:FrameChoice|null;reason:string;alternatives:FrameChoice[]}
export type FrameRecommendation={options:FrameOption[];selected:FrameChoice|null;error:string;objective:SelectionObjective;reason:string;pricingComplete:boolean}
const frames=Object.keys(FRAME_NAMES) as Frame[]
export const pedestalSelectionMode=(s:Settings):'auto'|'manual'=>s.pedestalSelection??(s.frameSelection==='manual'?'manual':'auto')
export const selectionObjective=(s:Settings):SelectionObjective=>s.selectionObjective??'cost'
const recommendationCache=new Map<string,FrameRecommendation>()
const automaticProducts=(s:Settings)=>[...PEDESTAL_MODELS].sort((a,b)=>Number(b.name===s.pedestalName&&b.diameter===(s.pedestalDiameter??150))-Number(a.name===s.pedestalName&&a.diameter===(s.pedestalDiameter??150))||a.diameter-b.diameter||(a.max-a.min)-(b.max-b.min)||a.name.localeCompare(b.name))

const comparePrice=(a:number|null,b:number|null)=>a===null?b===null?0:1:b===null?-1:a-b
export function compareFrameChoices(a:FrameChoice,b:FrameChoice,objective:SelectionObjective,currentFrame?:Frame){
  const cost=comparePrice(a.materialCostCents,b.materialCostCents)
  const primary=objective==='cost'?cost:objective==='simple'?a.frameLayers-b.frameLayers:objective==='spread'?b.pedestals-a.pedestals:a.pedestals-b.pedestals
  return primary||cost||a.frameLayers-b.frameLayers||a.memberPieces-b.memberPieces||a.profileTypes-b.profileTypes||a.pedestals-b.pedestals||a.stockLengths-b.stockLengths||a.memberLength-b.memberLength||Number(b.frame===currentFrame)-Number(a.frame===currentFrame)||frames.indexOf(a.frame)-frames.indexOf(b.frame)||a.settings.pedestalName.localeCompare(b.settings.pedestalName)
}

function explainChoice(c:FrameChoice){
  const cost=c.materialCostCents===null?'material prices incomplete':`€${(c.materialCostCents/100).toFixed(2)} materials`
  return `${c.frameLayers===1?'Single-layer frame':'Bearer + joist frame'} · ${c.memberPieces} frame pieces · ${c.pedestals} pedestals · ${cost}`
}

function selectionReason(selected:FrameChoice|null,objective:SelectionObjective,pricingComplete:boolean){
  if(!selected)return 'No frame and pedestal combination passes the supplied height and geometry checks.'
  if(objective==='simple')return `Fewest frame layers (${selected.frameLayers}), then material cost. ${pricingComplete?'':'Some alternatives need prices before a complete cost comparison.'}`.trim()
  if(objective==='pedestals')return `Fewest pedestals (${selected.pedestals}), then material cost. ${pricingComplete?'':'Some alternatives need prices before a complete cost comparison.'}`.trim()
  if(objective==='spread')return `Most pedestals among checked layouts (${selected.pedestals}), then material cost. Roof and substrate load capacity still need verification. ${pricingComplete?'':'Some alternatives need prices.'}`.trim()
  if(selected.materialCostCents===null)return 'Material prices are incomplete; the simpler checked assembly is used to break unpriced ties.'
  return pricingComplete?'Lowest material cost, with simpler framing used to break ties.':'Lowest fully priced material option; some alternatives are unpriced.'
}

// Names, colours and profile IDs cannot change support geometry. Saving a
// profile should not repeat a costly search, and cached choices still carry
// the current product metadata for callers that inspect their full settings.
export function recommendFrames(s:Settings,overrides:Record<string,string>={}):FrameRecommendation{
  if(validateSettings(s))return computeRecommendations(s,overrides)
  const key=JSON.stringify([{...s,selectionObjective:selectionObjective(s),board:{width:s.board?.width,thickness:s.board?.thickness,stock:s.board?.stock,gap:s.board?.gap,endGap:s.board?.endGap},confirmed:false,edgeDetailConfirmed:false},Object.entries(overrides).sort(([a],[b])=>a.localeCompare(b))])
  const cached=recommendationCache.get(key)
  if(cached){
    const rebase=(c:FrameChoice)=>{const p=c.settings;return {...c,settings:{...s,supportLayout:c.frame===s.frame?s.supportLayout:undefined,frame:c.frame,pedestalName:p.pedestalName,pedestalMin:p.pedestalMin,pedestalMax:p.pedestalMax,pedestalDiameter:p.pedestalDiameter,...resolvedBreakers(s,p)}}}
    const options=cached.options.map(option=>({...option,alternatives:option.alternatives.map(rebase),choice:option.choice?rebase(option.choice):null}))
    return {...cached,options,selected:cached.selected?options.find(o=>o.frame===cached.selected!.frame)?.choice??null:null}
  }
  const result=computeRecommendations(s,overrides)
  if(recommendationCache.size>=4)recommendationCache.delete(recommendationCache.keys().next().value!)
  recommendationCache.set(key,result)
  return result
}

// Customer height, ground variation and board dimensions are constraints.
// Only frame profiles and explicitly entered/catalogued pedestal products vary.
function computeRecommendations(s:Settings,overrides:Record<string,string>):FrameRecommendation{
  const automaticPedestal=pedestalSelectionMode(s)==='auto',validationModel=PEDESTAL_MODELS[0]
  const objective=selectionObjective(s)
  const invalid=validateSettings(automaticPedestal?{...s,pedestalName:validationModel.name,pedestalMin:validationModel.min,pedestalMax:validationModel.max,pedestalDiameter:validationModel.diameter}:s)
  if(invalid)return {options:[],selected:null,error:invalid,objective,reason:invalid,pricingComplete:false}
  const current={name:s.pedestalName,min:s.pedestalMin,max:s.pedestalMax,diameter:s.pedestalDiameter??150}
  const options:FrameOption[]=frames.map(frame=>{
    const rule=frameRule(frame,s.load),geometry=new Map<number,Plan>(),errors:string[]=[],alternatives:FrameChoice[]=[]
    const products=automaticPedestal?automaticProducts(s):[current]
    for(const product of products){
      const supplied:Settings={...s,supportLayout:frame===s.frame?s.supportLayout:undefined,frame,pedestalName:product.name,pedestalMin:product.min,pedestalMax:product.max,pedestalDiameter:product.diameter}
      const fit=heightFit(supplied,rule);if(!fit.fits)continue
      try{
        const candidate=keepBreakersInBounds(supplied)
        let plan=geometry.get(product.diameter)
        if(!plan){plan=planDeck(candidate);geometry.set(product.diameter,plan)}
        if(!plan.frame.geometryPass||plan.frame.layoutStatus!=='ready'){if(plan.frame.issues[0])errors.push(plan.frame.issues[0]);continue}
        const estimate=materialEstimate(plan,resolvedPricing(candidate,overrides)),supportLines=estimate.lines.filter(line=>line.key==='pedestals'||line.key.startsWith('profile')||line.key.endsWith('Joiners'))
        const choice:FrameChoice={frame,settings:candidate,pedestals:plan.frame.pedestals.length,memberLength:plan.frame.members.reduce((sum,m)=>sum+Math.hypot(m.b.x-m.a.x,m.b.y-m.a.y),0),required:fit.required,usesCurrentPedestal:product===current,
          materialCostCents:estimate.complete?estimate.subtotalCents:null,frameCostCents:supportLines.every(line=>line.cents!==null)?supportLines.reduce((sum,line)=>sum+line.cents!,0):null,
          stockLengths:Object.values(plan.frameCuts).reduce((sum,bars)=>sum+bars.length,0),frameLayers:rule.bearer?2:1,profileTypes:[rule.joist,rule.bearer].filter((height,i,a)=>height>0&&a.indexOf(height)===i).length,
          memberPieces:Object.values(plan.framePieces).reduce((sum,pieces)=>sum+pieces.length,0),pedestalModels:1,scoreExplanation:''}
        choice.scoreExplanation=explainChoice(choice);alternatives.push(choice)
      }catch(error){errors.push(error instanceof Error?error.message:'This frame cannot be arranged inside the outline.')}
    }
    alternatives.sort((a,b)=>compareFrameChoices(a,b,objective,s.frame))
    if(alternatives.length)return {frame,choice:alternatives[0],reason:'',alternatives}
    const required=heightFit(s,rule).required
    const reason=errors[0]??(required.min<=0?'Boards and frame leave no room for pedestals at the supplied height and ground variation.':automaticPedestal?'No listed pedestal covers the full required adjustment for this frame, customer height and ground variation.':'The manually selected pedestal does not cover the required adjustment at this customer height and ground variation.')
    return {frame,choice:null,reason,alternatives}
  })
  const eligible=options.flatMap(o=>o.choice?[o.choice]:[]).sort((a,b)=>compareFrameChoices(a,b,objective,s.frame)),selected=eligible[0]??null
  const candidates=options.flatMap(o=>o.alternatives),pricingComplete=candidates.length>0&&candidates.every(c=>c.materialCostCents!==null)
  return {options,selected,error:'',objective,reason:selectionReason(selected,objective,pricingComplete),pricingComplete}
}

export function applyFrameChoice(s:Settings,choice:FrameChoice,mode:'auto'|'manual'):Settings{
  const p=choice.settings,breakers=resolvedBreakers(s,p),changed=s.frame!==p.frame||s.pedestalName!==p.pedestalName||s.pedestalMin!==p.pedestalMin||s.pedestalMax!==p.pedestalMax||(s.pedestalDiameter??150)!==(p.pedestalDiameter??150)||breakers.edgeDetailConfirmed===false
  return {...s,supportLayout:p.supportLayout,frame:p.frame,pedestalName:p.pedestalName,pedestalMin:p.pedestalMin,pedestalMax:p.pedestalMax,pedestalDiameter:p.pedestalDiameter,...breakers,frameSelection:mode,pedestalSelection:pedestalSelectionMode(s),...(changed?{edgeDetailConfirmed:false,confirmed:false}:{})}
}

// A paired breaker can need more edge clearance than the previous frame.
// Keep the geometry that was checked and priced when applying or rebasing it.
function resolvedBreakers(s:Settings,p:Settings):Partial<Settings>{
  if(s.joints!=='breaker'||s.breakerMode!=='manual')return {}
  const positions=p.breakerPositions??[],changed=JSON.stringify(positions)!==JSON.stringify(s.breakerPositions??[])
  return {breakerPositions:positions,...(changed?{edgeDetailConfirmed:false}:{})}
}

export function selectAutomaticFrame(s:Settings,overrides:Record<string,string>={}):Settings{
  const automaticFrame=s.frameSelection!=='manual',automaticPedestal=pedestalSelectionMode(s)==='auto'
  if(!automaticFrame&&!automaticPedestal)return s
  return resolveFrameRecommendation(s,recommendFrames(s,overrides))
}

export function resolveFrameRecommendation(s:Settings,result:FrameRecommendation):Settings{
  const automaticFrame=s.frameSelection!=='manual',automaticPedestal=pedestalSelectionMode(s)==='auto'
  if(!automaticFrame&&!automaticPedestal)return s
  const choice=automaticFrame?result.selected:result.options.find(o=>o.frame===s.frame)?.choice
  if(choice)return applyFrameChoice(s,choice,automaticFrame?'auto':'manual')
  // A failed geometry search must not leave the previous frame's pedestal
  // behind. Keep a height-compatible catalogue model selected so the drawing,
  // card and failure explanation all check the same physical base dimensions.
  const fallback=automaticPedestal?automaticProducts(s).find(p=>heightFit({...s,pedestalMin:p.min,pedestalMax:p.max},frameRule(s.frame,s.load)).fits):undefined
  const changed=fallback&&(s.pedestalName!==fallback.name||s.pedestalMin!==fallback.min||s.pedestalMax!==fallback.max||s.pedestalDiameter!==fallback.diameter)
  return {...s,...(fallback?{pedestalName:fallback.name,pedestalMin:fallback.min,pedestalMax:fallback.max,pedestalDiameter:fallback.diameter}:{}),frameSelection:automaticFrame?'auto':'manual',pedestalSelection:automaticPedestal?'auto':'manual',...(changed?{edgeDetailConfirmed:false,confirmed:false}:{})}
}
