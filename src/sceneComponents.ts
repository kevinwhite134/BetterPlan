import type { Plan, Point, Settings } from './planner.ts'
import { boardRings } from './shapeGeometry.ts'
import { BOARD_USE_NAMES, frameMemberName, pedestalReference } from './productNames.ts'
import { hardwareGeometry } from './hardwareGeometry.ts'
import { structureGeometry } from './structureGeometry.ts'
import type { Position3, StructureExposure } from './structureGeometry.ts'
import { pedestalHeight } from './pedestalSurvey.ts'

export type SceneTier='board'|'joist'|'bearer'|'pedestal'
export type SceneComponent={id:string;name:string;materialKey:string;dimensions:string;tier:SceneTier;point:Position3;rings:Position3[][];count:number}
export const explosionOffset=(tier:SceneTier,amount:number,hasBearers:boolean)=>amount*(tier==='pedestal'?0:tier==='bearer'?1:tier==='joist'?(hasBearers?2:1):(hasBearers?3:2))
export function sceneComponent(plan:Plan,s:Settings,id:string):SceneComponent|null{
  const physical=(p:Point,z:number):Position3=>({...(s.direction==='vertical'?{x:p.y,y:p.x}:p),z}),boardBottom=-s.board.thickness/1000
  const index=Number(id.slice(id.lastIndexOf('-')+1))
  if(id.startsWith('board-')){
    const p=plan.boards.pieces[index];if(!p)return null
    const rings=boardRings(p).map(r=>r.map(p=>physical(p,0))),points=rings[0],point=points.reduce((sum,p)=>({x:sum.x+p.x/points.length,y:sum.y+p.y/points.length,z:0}),{x:0,y:0,z:0})
    return {id,name:`${BOARD_USE_NAMES[p.kind??'infill']} B-${String(index+1).padStart(4,'0')}`,materialKey:'boards',dimensions:`${Math.round(p.length*1000)} × ${Math.round(p.width*1000)} × ${s.board.thickness} mm`,tier:'board',point,rings,count:plan.boards.pieces.length}
  }
  if(id.startsWith('fascia-')){
    const p=plan.skirtPieces[index];if(!p)return null
    const bottom=boardBottom-(s.skirtingHeight??200)/1000
    return {id,name:`Fascia piece ${index+1}`,materialKey:'skirting',dimensions:`${Math.round(p.length*1000)} × ${s.skirtingHeight??200} mm`,tier:'board',point:physical({x:(p.a.x+p.b.x)/2,y:(p.a.y+p.b.y)/2},(boardBottom+bottom)/2),rings:[[physical(p.a,boardBottom),physical(p.b,boardBottom),physical(p.b,bottom),physical(p.a,bottom)]],count:plan.skirtPieces.length}
  }
  if(id.startsWith('member-')){
    const m=plan.frame.members[index];if(!m)return null
    const small={...plan,frame:{...plan.frame,members:[m],pedestals:[]}},part=structureGeometry(small,s,'joists',false)[0]
    return {id,name:`${frameMemberName(m.size,m.kind,m.role)} M-${String(index+1).padStart(4,'0')}`,materialKey:`profile${m.size}`,dimensions:`${Math.round(Math.hypot(m.b.x-m.a.x,m.b.y-m.a.y)*1000)} mm long · ${s.frameFaceWidth??35} × ${m.size} mm profile`,tier:m.kind==='bearer'?'bearer':'joist',point:part.centre,rings:part.faces.map(f=>f.points),count:plan.frame.members.filter(n=>n.size===m.size).length}
  }
  if(id.startsWith('pedestal-')){
    const p=plan.frame.pedestals[index];if(!p)return null
    const small={...plan,frame:{...plan.frame,members:[],pedestals:[p]}},part=structureGeometry(small,s,'pedestals',true)[0],height=pedestalHeight(p,s,plan.frame.rule)
    return {id,name:pedestalReference(s.pedestalName,index),materialKey:'pedestals',dimensions:`${s.pedestalDiameter??150} mm base · ${height.surveyed?height.required.toFixed(1):`${height.min.toFixed(0)}–${height.max.toFixed(0)}`} mm adjustment${height.surveyed?' · surveyed':''}${height.fits?'':' · OUT OF RANGE'}`,tier:'pedestal',point:part.centre,rings:part.faces.map(f=>f.points),count:plan.frame.pedestals.length}
  }
  const part=hardwareGeometry(plan,s,'joists').find(p=>p.id===id);if(!part)return null
  const materialKey=id.startsWith('continuous-')?'continuousJoiners':id.startsWith('side-')?'joistJoiners':'perpendicularJoiners'
  return {id,name:part.label.split(' · ')[0],materialKey,dimensions:materialKey==='joistJoiners'?'60 mm long · centred side plate':materialKey==='continuousJoiners'?'2 mm butt gap':'Perpendicular end connection',tier:part.kind==='bearer'?'bearer':'joist',point:part.centre,rings:part.faces.map(f=>f.points),count:plan.materials.find(m=>m.key===materialKey)?.qty??0}
}

export function pointInRing(q:Point,ring:Point[]){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a.y>q.y)!==(b.y>q.y)&&q.x<(b.x-a.x)*(q.y-a.y)/(b.y-a.y)+a.x)inside=!inside}return inside}
export function pickBoard(plan:Plan,s:Settings,q:Point,project:(p:Position3,tier:SceneTier)=>Point){
  const physical=(p:Point):Position3=>({...(s.direction==='vertical'?{x:p.y,y:p.x}:p),z:0})
  for(let i=plan.boards.pieces.length-1;i>=0;i--){const rings=boardRings(plan.boards.pieces[i]).map(r=>r.map(p=>project(physical(p),'board')));if(pointInRing(q,rings[0])&&!rings.slice(1).some(r=>pointInRing(q,r)))return `board-${i}`}
  return null
}
export function pickStructure(plan:Plan,s:Settings,q:Point,exposure:StructureExposure,showSupports:boolean,project:(p:Position3,tier:SceneTier)=>Point,tolerance:number){
  // This path also identifies parts in the batched large-project renderer.
  let best:string|null=null,nearest=tolerance
  const lineDistance=(a:Point,b:Point)=>{const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((q.x-a.x)*dx+(q.y-a.y)*dy)/l)):0;return Math.hypot(q.x-a.x-t*dx,q.y-a.y-t*dy)}
  const physical=(p:Point,z:number):Position3=>({...(s.direction==='vertical'?{x:p.y,y:p.x}:p),z})
  if(showSupports||exposure==='pedestals')plan.frame.pedestals.forEach((p,i)=>{const h=pedestalHeight(p,s,plan.frame.rule),head=-(s.board.thickness+plan.frame.rule.joist+plan.frame.rule.bearer)/1000,d=lineDistance(project(physical(p,h.ground),'pedestal'),project(physical(p,head),'pedestal'));if(d<nearest){nearest=d;best=`pedestal-${i}`}})
  if(exposure!=='pedestals')plan.frame.members.forEach((m,i)=>{if(exposure==='bearers'&&m.kind!=='bearer')return;const tier=m.kind==='bearer'?'bearer':'joist',z=-s.board.thickness/1000-(m.kind==='bearer'?plan.frame.rule.joist/1000:0)-m.size/2000,d=lineDistance(project(physical(m.a,z),tier),project(physical(m.b,z),tier));if(d<nearest){nearest=d;best=`member-${i}`}})
  if(exposure!=='pedestals')for(const p of hardwareGeometry(plan,s,exposure)){const point=project(p.centre,p.kind==='bearer'?'bearer':'joist'),d=Math.hypot(q.x-point.x,q.y-point.y);if(d<nearest*.7){nearest=d;best=p.id}}
  return best
}
