import { frameHardware } from './frameHardware'
import type { Plan, Settings } from './planner'
import type { Position3, StructureExposure } from './structureGeometry'

export default function DeckLabels({plan,s,exposure,showSupports,project,view}:{plan:Plan;s:Settings;exposure:StructureExposure;showSupports:boolean;project:(p:Position3)=>{x:number;y:number};view:{x:number;y:number;w:number;h:number}}){
  const labels:{name:string;point:Position3}[]=[],boardBottom=-s.board.thickness/1000
  const physical=(p:{x:number;y:number},z:number)=>({...(s.direction==='vertical'?{x:p.y,y:p.x}:p),z})
  const boards=exposure==='finished'||exposure==='boards'
  if(boards)for(const kind of ['infill','perimeter','breaker'] as const){const p=plan.boards.pieces.find(p=>(p.kind??'infill')===kind);if(p)labels.push({name:{infill:'Decking board',perimeter:'Picture-frame board',breaker:'Breaker board'}[kind],point:physical({x:p.x+p.length/2,y:p.y+p.width/2},0)})}
  if(exposure==='finished'&&s.skirting){const a=plan.p[0],b=plan.p[1];labels.push({name:'Fascia board',point:physical({x:(a.x+b.x)/2,y:(a.y+b.y)/2},boardBottom-(s.skirtingHeight??200)/2000)})}
  if(!boards&&exposure!=='pedestals'){
    for(const kind of ['joist','bearer','noggin'] as const){if(exposure==='bearers'&&kind!=='bearer')continue;const m=plan.frame.members.find(m=>m.kind===kind);if(m)labels.push({name:{joist:'Alu-Joist',bearer:'Alu-Joist bearer',noggin:'Ladder blocking'}[kind],point:physical({x:(m.a.x+m.b.x)/2,y:(m.a.y+m.b.y)/2},boardBottom-(kind==='bearer'?plan.frame.rule.joist/1000:0))})}
    const connections=frameHardware(plan.frame,s.frameFaceWidth??35).connections.filter(c=>exposure!=='bearers'||c.tier==='bearer')
    const butt=connections.find(c=>c.kind==='butt'),perpendicular=connections.find(c=>c.kind==='perpendicular')
    if(butt){const z=boardBottom-(butt.tier==='bearer'?plan.frame.rule.joist/1000:0);labels.push({name:'Continuous joiner · 2 mm',point:physical(butt.point,z)},{name:'Joist joiner · each side',point:physical({x:butt.point.x-butt.axis.y*(s.frameFaceWidth??35)/2000,y:butt.point.y+butt.axis.x*(s.frameFaceWidth??35)/2000},z-.015)})}
    if(perpendicular)labels.push({name:'Perpendicular joist joiner',point:physical(perpendicular.point,boardBottom-(perpendicular.tier==='bearer'?plan.frame.rule.joist/1000:0))})
  }
  if((showSupports||exposure==='pedestals')&&!boards&&plan.frame.pedestals.length){const p=plan.frame.pedestals[0],head=boardBottom-(plan.frame.rule.joist+plan.frame.rule.bearer)/1000;labels.push({name:'Pedestal · 110 mm column',point:physical(p,(head-s.height/1000)/2)})}
  const font=view.w*.017,spacing=Math.min(view.h*.19,font*3.6)
  return <g className="deck-part-labels" pointerEvents="none" aria-label="One label for each visible component">{labels.map((label,i)=>{
    const side=i%2,row=Math.floor(i/2),x=view.x+view.w*(side?.98:.02),y=view.y+view.h*.13+row*spacing,p=project(label.point),end=x+(side?-1:1)*font*.5
    return <g key={label.name}><path d={`M${p.x} ${p.y}L${end} ${y-font*.3}`} fill="none" stroke="#3e523a" strokeWidth={view.w*.0012}/><circle cx={p.x} cy={p.y} r={font*.16} fill="#577d29"/><text x={x} y={y} fontSize={font} textAnchor={side?'end':'start'} fill="#273e29" stroke="#f8faf2" strokeWidth={font*.35} paintOrder="stroke" strokeLinejoin="round">{label.name}</text></g>
  })}</g>
}
