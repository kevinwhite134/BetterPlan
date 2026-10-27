import { frameRule, planDeck } from './planner.ts'
import type { Settings } from './planner.ts'
import { heightFit } from './heightFit.ts'
import { PEDESTAL_MODELS } from './productNames.ts'

export type SupportSuggestion={id:string;title:string;changes:string[];note:string;patch:Partial<Settings>;pedestals:number;members:number}
type Candidate=Omit<SupportSuggestion,'pedestals'|'members'>
export function supportCandidates(s:Settings):Candidate[]{
  const candidates:Candidate[]=[],clearance=s.pedestalClearance??0
  const add=(title:string,patch:Partial<Settings>,changes:string[],note:string)=>candidates.push({id:String(candidates.length+1),title,patch,changes,note})
  if(clearance>0)add('Reduce extra edge clearance',{pedestalClearance:0},[`Extra edge clearance: ${clearance} → 0 mm`],'The full pedestal base still has to fit. Confirm that this extra site clearance can be removed.')
  for(const stock of [3.66,4.88,6].filter(n=>n>s.frameStock+.001).slice(0,2))add('Use longer aluminium stock',{frameStock:stock},[`Alu-Joist stock: ${s.frameStock} → ${stock} m`],'Use only a stock length you can actually supply; report span limits stay unchanged.')
  if(s.joistSpacing<400)add('Use wider joist centres',{joistSpacing:400},[`Joist centres: ${s.joistSpacing} → 400 mm`],'Confirm that the selected board product permits 400 mm centres. Live load and report support spans stay unchanged.')
  const models=PEDESTAL_MODELS.filter(p=>p.diameter<=(s.pedestalDiameter??150)&&p.name!==s.pedestalName&&heightFit({...s,pedestalMin:p.min,pedestalMax:p.max},frameRule(s.frame,s.load)).fits).sort((a,b)=>a.diameter-b.diameter)
  for(const model of models.slice(0,3))add('Try a height-compatible pedestal',{pedestalName:model.name,pedestalMin:model.min,pedestalMax:model.max,pedestalDiameter:model.diameter,pedestalSelection:'manual'},[`${model.name}: ${model.diameter} mm base; ${model.min}–${model.max} mm adjustment`],'A catalogue product that fits the unchanged customer height. Check its capacity and head/connection suitability.')
  if(clearance>0&&s.frameStock<4.88)add('Combine clearance and stock changes',{pedestalClearance:0,frameStock:4.88},[`Extra edge clearance: ${clearance} → 0 mm`,`Alu-Joist stock: ${s.frameStock} → 4.88 m`],'This preview changes both settings. Confirm site clearance and actual stock availability.')
  return candidates
}
export function findSupportSuggestions(s:Settings,progress?:(done:number,total:number)=>void):SupportSuggestion[]{
  const candidates=supportCandidates(s),results:SupportSuggestion[]=[]
  for(const [i,candidate] of candidates.entries()){
    try{
      const settings={...s,...candidate.patch,frameSelection:'manual' as const,edgeDetailConfirmed:false,confirmed:false},p=planDeck(settings)
      if(p.frame.geometryPass&&p.heightFits)results.push({...candidate,pedestals:p.frame.pedestals.length,members:p.frame.members.length})
    }catch{/* A proposal is shown only after the whole layout and height pass. */}
    progress?.(i+1,candidates.length)
  }
  return results
}
