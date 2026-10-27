import type { Plan, Settings } from './planner.ts'
import type { Position3, StructureExposure } from './structureGeometry.ts'
import type { SceneTier } from './sceneComponents.ts'
import type { ExplosionLayout } from './explodedLayout.ts'
import { frameHardware } from './frameHardware.ts'
import { deckingBoardName, aluJoistName } from './productNames.ts'

export type DeckLabel={id:string;name:string;tier:SceneTier;point:Position3}
export function deckLabelData(plan:Plan,s:Settings,exposure:StructureExposure,showSupports:boolean,layout?:ExplosionLayout):DeckLabel[]{
  const labels:DeckLabel[]=[],boardBottom=-s.board.thickness/1000
  const physical=(p:{x:number;y:number},z=0):Position3=>({...(s.direction==='vertical'?{x:p.y,y:p.x}:p),z})
  const add=(id:string,name:string,tier:SceneTier,fallback:Position3)=>labels.push({id,name,tier,point:layout?.centres.get(id)??fallback})
  const boards=exposure==='finished'||exposure==='boards',exploded=!!layout?.amount
  if(boards)for(const kind of ['infill','perimeter','breaker'] as const){const index=plan.boards.pieces.findIndex(p=>(p.kind??'infill')===kind),p=plan.boards.pieces[index];if(p)add(`board-${index}`,`${deckingBoardName(s.board.name)} · ${{infill:'infill',perimeter:'picture frame',breaker:'breaker'}[kind]}`,'board',physical({x:p.x+p.length/2,y:p.y+p.width/2}))}
  if(exposure==='finished'&&s.skirting&&plan.skirtPieces.length){const p=plan.skirtPieces[0];add('fascia-0','Fascia board','board',physical({x:(p.a.x+p.b.x)/2,y:(p.a.y+p.b.y)/2},boardBottom-(s.skirtingHeight??200)/2000))}
  if((!boards||exploded)&&exposure!=='pedestals'){
    for(const kind of ['joist','bearer','noggin'] as const){if(exposure==='bearers'&&kind!=='bearer')continue;const index=plan.frame.members.findIndex(m=>m.kind===kind),m=plan.frame.members[index];if(m)add(`member-${index}`,`${plan.materials.find(p=>p.key===`profile${m.size}`)?.name??aluJoistName(m.size)} · ${{joist:'joist',bearer:'bearer',noggin:'ladder blocking'}[kind]}`,kind==='bearer'?'bearer':'joist',physical({x:(m.a.x+m.b.x)/2,y:(m.a.y+m.b.y)/2},boardBottom-(kind==='bearer'?plan.frame.rule.joist/1000:0)-m.size/2000))}
    const connections=frameHardware(plan.frame,s.frameFaceWidth??35).connections.filter(c=>exposure!=='bearers'||c.tier==='bearer'),butt=connections.find(c=>c.kind==='butt'),perpendicular=connections.find(c=>c.kind==='perpendicular')
    if(butt){const z=boardBottom-(butt.tier==='bearer'?plan.frame.rule.joist/1000:0)-butt.size/2000;add(`continuous-${butt.id}`,'Continuous joiner',butt.tier,physical(butt.point,z));add(`side-1-${butt.id}`,'Side joist joiner',butt.tier,physical(butt.point,z))}
    if(perpendicular)add(perpendicular.id,'Perpendicular joist joiner',perpendicular.tier,physical(perpendicular.point,boardBottom-(perpendicular.tier==='bearer'?plan.frame.rule.joist/1000:0)))
  }
  if((showSupports||exposure==='pedestals')&&(!boards||exploded)&&plan.frame.pedestals.length){
    const p=plan.frame.pedestals[0],head=boardBottom-(plan.frame.rule.joist+plan.frame.rule.bearer)/1000
    const name=s.pedestalName||'Adjustable pedestal'
    add('pedestal-0',name,'pedestal',physical(p,(head-s.height/1000)/2))
  }
  return labels
}
