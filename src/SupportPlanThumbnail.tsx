import { useMemo } from 'react'
import { bounds } from './planner'
import type { Plan, Point, Settings } from './planner'
import { thumbnailPlan } from './renderOverview'
import { FRAME_COLOURS } from './frameColours'

/** A simplified top view of this project, with readable overall dimensions. */
export default function SupportPlanThumbnail({plan:full,settings,measured}:{plan:Plan;settings:Settings;measured:boolean}){
  const plan=useMemo(()=>thumbnailPlan(full),[full]),box=bounds(plan.physical)
  const minX=Math.min(...plan.physical.map(p=>p.x)),minY=Math.min(...plan.physical.map(p=>p.y))
  const scale=Math.min(130/Math.max(.01,box.width),72/Math.max(.01,box.depth))
  const width=box.width*scale,height=box.depth*scale,left=42+(130-width)/2,top=27+(72-height)/2
  const project=(p:Point)=>({x:left+(p.x-minX)*scale,y:top+(p.y-minY)*scale})
  const physical=(p:Point)=>settings.direction==='vertical'?{x:p.y,y:p.x}:p
  const outline=plan.physical.map(project).map(p=>`${p.x},${p.y}`).join(' ')
  return <svg viewBox="0 0 200 124" aria-hidden="true" focusable="false">
    <polygon points={outline} fill="#f8faf4" stroke="#a9b69a" strokeWidth="1"/>
    {plan.frame.members.map((m,i)=>{const a=project(physical(m.a)),b=project(physical(m.b));return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={FRAME_COLOURS[m.kind]} strokeWidth={m.kind==='bearer'?1.8:1.1}/>})}
    {plan.frame.pedestals.map((p,i)=>{const q=project(physical(p));return <circle key={i} cx={q.x} cy={q.y} r="2" fill="#f9fbf3" stroke="#608448" strokeWidth=".8"/>})}
    {plan.cutouts.map(h=><polygon key={h.id} points={h.polygon.map(project).map(p=>`${p.x},${p.y}`).join(' ')} fill="#f0f4e8" stroke="#839275" strokeWidth=".8"/>)}
    {measured?<g fill="#526246" stroke="#839275" strokeWidth=".8">
      <path d={`M${left} ${top-4}V15M${left+width} ${top-4}V15M${left} 19H${left+width}M${left-3} 16l6 6M${left+width-3} 16l6 6M${left-4} ${top}H24M${left-4} ${top+height}H24M28 ${top}V${top+height}M25 ${top-3}l6 6M25 ${top+height-3}l6 6`}/>
      <text x={left+width/2} y="12" textAnchor="middle" stroke="none" fontSize="11" fontFamily="Arial,sans-serif">{Math.round(box.width*1000)}</text>
      <text transform={`translate(18 ${top+height/2}) rotate(-90)`} textAnchor="middle" stroke="none" fontSize="11" fontFamily="Arial,sans-serif">{Math.round(box.depth*1000)}</text>
    </g>:null}
  </svg>
}
