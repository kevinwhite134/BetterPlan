import { computeDeckPlanning } from './planning.ts'
import type { PlanningReply, PlanningTask } from './planning.ts'

const scope=self as unknown as {onmessage:((event:MessageEvent<PlanningTask>)=>void)|null;postMessage:(reply:PlanningReply)=>void}
scope.onmessage=({data})=>{
  scope.postMessage({key:data.key,result:computeDeckPlanning(data.settings,data.prices)})
}
