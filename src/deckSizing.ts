import { MAX_PROJECT_SIZE } from './projectLimits.ts'
import { bounds, polygonArea, polygonError, validateSettings } from './planner.ts'
import type { Settings } from './planner.ts'
import { boardInfillInset } from './perimeterEdges.ts'

export type DeckSizeOption={id:'smaller'|'bigger';axis:'x'|'y';current:number;target:number;delta:number;rows?:number;rectangle:boolean;settings?:Settings;error:string}
export function deckSizeOptions(s:Settings):DeckSizeOption[]{
  const axis=s.direction==='horizontal'?'y':'x',box=bounds(s.polygon),current=axis==='y'?box.depth:box.width
  const w=s.board.width/1000,g=s.board.gap/1000,pitch=w+g
  const rectangle=Math.abs(polygonArea(s.polygon)-box.width*box.depth)<1e-6&&s.polygon.every((a,i)=>{const b=s.polygon[(i+1)%s.polygon.length];return Math.abs(a.x-b.x)<1e-7||Math.abs(a.y-b.y)<1e-7})
  const valid=Number.isFinite(pitch)&&w>=.06&&w<=.3&&g>=.001&&g<=.015&&current>0
  const origin=Math.min(...s.polygon.map(q=>q[axis]))
  const resized=(extent:number)=>s.polygon.map(q=>({...q,[axis]:origin+(q[axis]-origin)*extent/current}))
  const innerDepth=(extent:number)=>{
    try{const p=resized(extent).map(q=>s.direction==='vertical'?{x:q.y,y:q.x}:q);return bounds(boardInfillInset(p,s)).depth}catch{return -Infinity}
  }
  const measured=valid?innerDepth(current):-Infinity,inner=Number.isFinite(measured)?measured:current-2*(w+g)
  const rawRows=(inner+g)/pitch,nearest=Math.round(rawRows),exact=Math.abs(rawRows-nearest)<1e-5
  return (['smaller','bigger'] as const).map(id=>{
    const rows=exact?nearest+(id==='smaller'?-1:1):id==='smaller'?Math.floor(rawRows):Math.ceil(rawRows)
    let target=current-inner+rows*w+(rows-1)*g
    const option:DeckSizeOption={id,axis,current,target,delta:target-current,rows,rectangle,error:''}
    if(!valid){option.error='Enter a valid board width, gap and outline first.';return option}
    if(target<=0||rows<1){option.error='Keep at least one full infill board row.';return option}
    if(!rectangle){
      const desired=rows*w+(rows-1)*g
      let lo=0,hi=MAX_PROJECT_SIZE
      if(innerDepth(hi)<desired){option.error=`This outline cannot fit that row count within the ${MAX_PROJECT_SIZE} m limit.`;return option}
      for(let i=0;i<48;i++){const mid=(lo+hi)/2;if(innerDepth(mid)<desired)lo=mid;else hi=mid}
      target=hi
      option.target=target;option.delta=target-current
      if(Math.abs(innerDepth(target)-desired)>1e-6){option.error='This shaped inset needs a local corner adjustment first.';return option}
    }
    const polygon=resized(target)
    option.error=polygonError(polygon)||validateSettings({...s,polygon})
    if(!option.error)option.settings={...s,polygon,edgeDetailConfirmed:false}
    return option
  })
}
