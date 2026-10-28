import { bounds, planDeck, polygonArea } from './planner.ts'
import type { Plan, Settings } from './planner.ts'
import { ensureEnoughBreakers, keepBreakersInBounds } from './breakerPlacement.ts'
import { recommendFrames, resolveFrameRecommendation, selectionObjective } from './frameRecommendation.ts'
import type { FrameRecommendation } from './frameRecommendation.ts'

export type PlanningResult={settings:Settings;plan:Plan|null;error:string;recommendation?:FrameRecommendation}
export type PlanningTask={key:string;settings:Settings;prices:Record<string,string>}
export type PlanningReply={key:string;result:PlanningResult}

export function needsBackgroundPlanning(s:Settings){
  if(!Array.isArray(s.polygon)||!s.polygon.length||!s.board)return false
  const box=bounds(s.polygon),pitch=(s.board.width+s.board.gap)/1000
  const across=s.direction==='horizontal'?box.depth:box.width,run=s.direction==='horizontal'?box.width:box.depth
  return polygonArea(s.polygon)>500||Math.ceil(across/pitch)*Math.ceil(run/s.board.stock)>2000
}

export function pendingRecommendation(s:Settings):FrameRecommendation{
  return {options:[],selected:null,error:'',objective:selectionObjective(s),reason:'Calculating support options…',pricingComplete:false}
}

export function computeDeckPlanning(input:Settings,prices:Record<string,string>):PlanningResult{
  let settings:Settings={...input,perimeterJoints:true,allowRipping:true}
  try{
    settings=ensureEnoughBreakers(settings)
    // One comparison supplies both automatic selection and the support cards.
    // Do not repeat the entire catalogue search after applying its choice.
    const recommendation=recommendFrames(settings,prices)
    settings=keepBreakersInBounds(resolveFrameRecommendation(settings,recommendation))
    return {settings,plan:planDeck(settings),error:'',recommendation}
  }catch(error){return {settings,plan:null,error:error instanceof Error?error.message:'Check your inputs.'}}
}
