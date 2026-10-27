import type { Plan, Point, Settings } from './planner.ts'
import type { Position3 } from './structureGeometry.ts'
import type { SceneTier } from './sceneComponents.ts'
import { boardRings } from './shapeGeometry.ts'
import { frameHardware } from './frameHardware.ts'
import { pedestalHeight, surveyReadings } from './pedestalSurvey.ts'

export function explodedLayout(plan:Plan,s:Settings,percentage:number){
  const amount=Math.max(0,Math.min(100,percentage))/100
  const xs=plan.physical.map(p=>p.x),ys=plan.physical.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),cx=(minX+maxX)/2,cy=(minY+maxY)/2
  const step=Math.max(1,Math.min(4,Math.max(maxX-minX,maxY-minY)*.28))*amount,spread=1.15*amount,hasBearers=plan.frame.rule.bearer>0
  const levels:Record<SceneTier,number>={pedestal:0,bearer:step,joist:step*(hasBearers?2.15:1.15),board:step*(hasBearers?3.5:2.6)}
  const offsets=new Map<string,Position3>(),centres=new Map<string,Position3>()
  const boundsByTier=new Map<SceneTier,{minX:number;maxX:number;minY:number;maxY:number;minZ:number;maxZ:number}>()
  const bounds={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,minZ:Infinity,maxZ:-Infinity}
  const physical=(p:Point):Point=>s.direction==='vertical'?{x:p.y,y:p.x}:p
  const include=(p:Position3,tier?:SceneTier)=>{if(tier){let b=boundsByTier.get(tier);if(!b){b={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,minZ:Infinity,maxZ:-Infinity};boundsByTier.set(tier,b)}b.minX=Math.min(b.minX,p.x);b.maxX=Math.max(b.maxX,p.x);b.minY=Math.min(b.minY,p.y);b.maxY=Math.max(b.maxY,p.y);b.minZ=Math.min(b.minZ,p.z);b.maxZ=Math.max(b.maxZ,p.z)}bounds.minX=Math.min(bounds.minX,p.x);bounds.maxX=Math.max(bounds.maxX,p.x);bounds.minY=Math.min(bounds.minY,p.y);bounds.maxY=Math.max(bounds.maxY,p.y);bounds.minZ=Math.min(bounds.minZ,p.z);bounds.maxZ=Math.max(bounds.maxZ,p.z)}
  const add=(id:string,centre:Position3,tier:SceneTier,extent:Position3={x:0,y:0,z:0},extra:Position3={x:0,y:0,z:0})=>{
    const offset={x:(centre.x-cx)*spread+extra.x,y:(centre.y-cy)*spread+extra.y,z:levels[tier]+extra.z}
    offsets.set(id,offset);centres.set(id,centre)
    include({x:centre.x+offset.x-extent.x,y:centre.y+offset.y-extent.y,z:centre.z+offset.z-extent.z},tier);include({x:centre.x+offset.x+extent.x,y:centre.y+offset.y+extent.y,z:centre.z+offset.z+extent.z},tier)
  }
  const boardBottom=-s.board.thickness/1000,head=boardBottom-(plan.frame.rule.joist+plan.frame.rule.bearer)/1000
  plan.boards.pieces.forEach((piece,i)=>{
    const points=boardRings(piece)[0].map(physical),xs=points.map(p=>p.x),ys=points.map(p=>p.y),x=(Math.min(...xs)+Math.max(...xs))/2,y=(Math.min(...ys)+Math.max(...ys))/2
    add(`board-${i}`,{x,y,z:0},'board',{x:(Math.max(...xs)-Math.min(...xs))/2,y:(Math.max(...ys)-Math.min(...ys))/2,z:s.board.thickness/1000})
  })
  plan.frame.members.forEach((m,i)=>{const a=physical(m.a),b=physical(m.b),top=boardBottom-(m.kind==='bearer'?plan.frame.rule.joist/1000:0),face=(s.frameFaceWidth??35)/2000;add(`member-${i}`,{x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:top-m.size/2000},m.kind==='bearer'?'bearer':'joist',{x:Math.abs(b.x-a.x)/2+face,y:Math.abs(b.y-a.y)/2+face,z:m.size/2000})})
  const readings=surveyReadings(s)
  plan.frame.pedestals.forEach((point,i)=>{
    const p=physical(point),ground=pedestalHeight(point,s,plan.frame.rule,readings).ground,r=(s.pedestalDiameter??150)/2000
    add(`pedestal-${i}`,{...p,z:(head+ground)/2},'pedestal',{x:r,y:r,z:(head-ground)/2},{x:0,y:0,z:step*.24})
  })
  for(const c of frameHardware(plan.frame,s.frameFaceWidth??35).connections){
    const p=physical(c.point),u=physical(c.axis),n={x:-u.y,y:u.x},z=boardBottom-(c.tier==='bearer'?plan.frame.rule.joist/1000:0)-c.size/2000
    if(c.kind==='butt'){
      add(`continuous-${c.id}`,{...p,z},c.tier,{x:.03,y:.03,z:c.size/2000},{x:0,y:0,z:step*.12})
      for(const side of [-1,1]){const sideDistance=side*(s.frameFaceWidth??35)/2000,away=side*(step*.13+.12*amount);add(`side-${side}-${c.id}`,{x:p.x+n.x*sideDistance,y:p.y+n.y*sideDistance,z},c.tier,{x:.04,y:.04,z:.02},{x:n.x*away,y:n.y*away,z:step*.2})}
    }else add(c.id,{...p,z:z+c.size/2000},c.tier,{x:.03,y:.03,z:.01},{x:u.x*step*.08,y:u.y*step*.08,z:step*.16})
  }
  plan.skirtPieces.forEach((p,i)=>{const a=physical(p.a),b=physical(p.b);add(`fascia-${i}`,{x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:boardBottom-(s.skirtingHeight??200)/2000},'board',{x:Math.abs(a.x-b.x)/2,y:Math.abs(a.y-b.y)/2,z:(s.skirtingHeight??200)/2000},{x:0,y:0,z:-step*.2})})
  if(!Number.isFinite(bounds.minX))for(const p of plan.physical){include({...p,z:0});include({...p,z:-s.height/1000})}
  return {offsets,centres,bounds,boundsByTier,levels,amount,step}
}
export type ExplosionLayout=ReturnType<typeof explodedLayout>
export function displacePart(p:Position3,layout:ExplosionLayout,component?:string,tier:SceneTier='board'):Position3{
  if(!layout.amount)return p
  // Rendered sub-parts share the complete product's translation.
  const offset=component?layout.offsets.get(component)??layout.offsets.get(component.split(':')[0]):undefined
  return offset?{x:p.x+offset.x,y:p.y+offset.y,z:p.z+offset.z}:{...p,z:p.z+layout.levels[tier]}
}
