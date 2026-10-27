import { useEffect, useMemo, useState } from 'react'
import type { Settings } from './planner'
import { computeDeckPlanning, needsBackgroundPlanning, pendingRecommendation } from './planning'
import type { PlanningReply, PlanningResult, PlanningTask } from './planning'

export type DeckPlanningState=PlanningResult&{pending:boolean}

export function useDeckPlanning(input:Settings,prices:Record<string,string>,enabled:boolean):DeckPlanningState{
  const settings=useMemo(()=>({...input,perimeterJoints:true}),[input])
  const background=enabled&&needsBackgroundPlanning(settings)
  const key=useMemo(()=>JSON.stringify([settings,prices]),[settings,prices])
  const [completed,setCompleted]=useState<PlanningReply|null>(null)
  const synchronous=useMemo(()=>enabled&&!background?computeDeckPlanning(settings,prices):null,[settings,prices,enabled,background])

  useEffect(()=>{
    if(!background)return
    let active=true,worker:Worker|undefined
    const failed=(message:string)=>{
      if(active)setCompleted({key,result:{settings,plan:null,error:message,recommendation:pendingRecommendation(settings)}})
    }
    try{
      worker=new Worker(new URL('./planning.worker.ts',import.meta.url),{type:'module'})
      worker.onmessage=({data}:MessageEvent<PlanningReply>)=>{
        if(active&&data.key===key)setCompleted(data)
        worker?.terminate()
      }
      worker.onerror=event=>{failed(event.message||'The background layout calculation failed. Change a setting to retry.');worker?.terminate()}
      const task:PlanningTask={key,settings,prices};worker.postMessage(task)
    }catch(error){queueMicrotask(()=>failed(error instanceof Error?error.message:'Background planning is unavailable in this browser.'))}
    return ()=>{active=false;worker?.terminate()}
  },[background,key,settings,prices])

  if(!enabled)return {settings,plan:null,error:'',pending:false}
  if(synchronous)return {...synchronous,pending:false}
  if(completed?.key===key)return {...completed.result,pending:false}
  // Never show a previous project's geometry underneath newly edited inputs.
  return {settings,plan:null,error:'',pending:true,recommendation:pendingRecommendation(settings)}
}
