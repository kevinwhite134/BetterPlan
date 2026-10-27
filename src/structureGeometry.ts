import { pedestalHeight, surveyReadings } from './pedestalSurvey.ts'
import type { Plan, Point, Settings } from './planner.ts'
import { frameMemberName, pedestalReference } from './productNames.ts'
import { frameHardware, PEDESTAL_COLUMN_DIAMETER, renderedMember } from './frameHardware.ts'

export type Position3=Point&{z:number}
export type StructureExposure='finished'|'boards'|'joists'|'bearers'|'pedestals'
export type StructureFace={points:Position3[];normal:Position3;fill:string}
export type StructurePart={id:string;label:string;kind:'pedestal'|'bearer'|'joist';centre:Position3;faces:StructureFace[]}
const colours={joist:['#d4d9dc','#8e989f'],bearer:['#c6cdd2','#7c878f'],noggin:['#e0e4e7','#96a0a7'],rim:['#d4d9dc','#8e989f']} as const

export function structureGeometry(plan:Plan,s:Settings,exposure:StructureExposure,showSupports:boolean):StructurePart[]{
  const parts:StructurePart[]=[],boardBottom=-s.board.thickness/1000,head=boardBottom-(plan.frame.rule.joist+plan.frame.rule.bearer)/1000
  const physical=(p:Point):Point=>s.direction==='vertical'?{x:p.y,y:p.x}:p
  const solid=(points:Point[],top:number,bottom:number,topFill:string,sideFill:string):StructureFace[]=>{
    let area=0;points.forEach((a,i)=>{const b=points[(i+1)%points.length];area+=a.x*b.y-b.x*a.y});if(area<0)points=[...points].reverse()
    const faces:StructureFace[]=[{points:points.map(p=>({...p,z:top})),normal:{x:0,y:0,z:1},fill:topFill}]
    points.forEach((a,i)=>{const b=points[(i+1)%points.length],length=Math.hypot(b.x-a.x,b.y-a.y);if(length<1e-9)return;faces.push({points:[{...a,z:bottom},{...b,z:bottom},{...b,z:top},{...a,z:top}],normal:{x:(b.y-a.y)/length,y:-(b.x-a.x)/length,z:0},fill:sideFill})})
    return faces
  }
  const readings=surveyReadings(s)
  if(showSupports||exposure==='pedestals')plan.frame.pedestals.forEach((point,i)=>{
    const ground=pedestalHeight(point,s,plan.frame.rule,readings).ground,p=physical(point),radius=(s.pedestalDiameter??150)/2000,adjustment=Math.max(0,head-ground),plate=Math.min(.008,adjustment/4)
    const cylinder=(r:number,top:number,bottom:number,light:string,dark:string)=>solid(Array.from({length:24},(_,i)=>({x:p.x+r*Math.cos(i*Math.PI/12),y:p.y+r*Math.sin(i*Math.PI/12)})),top,bottom,light,dark)
    const faces=[...cylinder(radius,ground+plate,ground,'#566254','#303c32'),...cylinder(Math.min(PEDESTAL_COLUMN_DIAMETER/2,radius*.8),head-plate,ground+plate,'#52624f','#3d4c3e'),...cylinder(radius*.8,head,head-plate,'#64735d','#3d4c3e')]
    parts.push({id:`pedestal-${i}`,kind:'pedestal',label:`${pedestalReference(s.pedestalName,i)} · ${s.pedestalDiameter??150} mm base · ${Math.round(adjustment*1000)} mm adjustment`,centre:{...p,z:(head+ground)/2},faces})
  })
  const hardware=frameHardware(plan.frame,s.frameFaceWidth??35)
  if(exposure!=='pedestals')plan.frame.members.forEach((original,i)=>{
    const member=renderedMember(original,hardware.trims[i])
    if(exposure==='bearers'&&member.kind!=='bearer')return
    const a=physical(member.a),b=physical(member.b),length=Math.hypot(b.x-a.x,b.y-a.y);if(length<1e-9)return
    const half=(s.frameFaceWidth??35)/2000,nx=-(b.y-a.y)/length*half,ny=(b.x-a.x)/length*half
    const top=boardBottom-(member.kind==='bearer'?plan.frame.rule.joist/1000:0),bottom=top-member.size/1000
    const outline=[{x:a.x+nx,y:a.y+ny},{x:b.x+nx,y:b.y+ny},{x:b.x-nx,y:b.y-ny},{x:a.x-nx,y:a.y-ny}],colour=colours[member.kind]
    const centre=physical({x:(original.a.x+original.b.x)/2,y:(original.a.y+original.b.y)/2})
    parts.push({id:`member-${i}`,kind:member.kind==='bearer'?'bearer':'joist',label:`${frameMemberName(member.size,member.kind,member.role)} · ${Math.round(Math.hypot(original.b.x-original.a.x,original.b.y-original.a.y)*1000)} mm long · ${s.frameFaceWidth??35} mm top face`,centre:{...centre,z:(top+bottom)/2},faces:solid(outline,top,bottom,colour[0],colour[1])})
  })
  return parts
}

export function projectedStructure(parts:StructurePart[],rotation:number,tilt:number){
  const angle=rotation*Math.PI/180,t=tilt*Math.PI/180,view={x:Math.sin(angle)*Math.sin(t),y:Math.cos(angle)*Math.sin(t),z:Math.cos(t)}
  const depth=(p:Position3)=>p.x*view.x+p.y*view.y+p.z*view.z
  const tier={pedestal:0,bearer:1,joist:2}
  return [...parts].sort((a,b)=>tier[a.kind]-tier[b.kind]||depth(a.centre)-depth(b.centre)).map(part=>({...part,faces:part.faces.filter(face=>face.normal.x*view.x+face.normal.y*view.y+face.normal.z*view.z>1e-8)}))
}

export type StructurePath={kind:'pedestal'|'bearer'|'joist';fill:string;path:string}
const overviewCircle=Array.from({length:8},(_,i)=>({x:Math.cos(i*Math.PI/4),y:Math.sin(i*Math.PI/4)}))
// Large-project rendering batches all actual components into a few SVG paths.
// Pedestal silhouettes use eight-sided bases/heads at their exact positions,
// diameters and heights. The full geometry model and quantities are untouched.
export function structurePaths(plan:Plan,s:Settings,exposure:StructureExposure,showSupports:boolean,rotation:number,tilt:number,project:(p:Position3,kind?:StructurePath['kind'])=>Point){
  const paths=new Map<string,{kind:StructurePath['kind'];fill:string;segments:string[]}>()
  const angle=rotation*Math.PI/180,t=tilt*Math.PI/180,view={x:Math.sin(angle)*Math.sin(t),y:Math.cos(angle)*Math.sin(t),z:Math.cos(t)}
  const physical=(p:Point)=>s.direction==='vertical'?{x:p.y,y:p.x}:p
  const boardBottom=-s.board.thickness/1000,head=boardBottom-(plan.frame.rule.joist+plan.frame.rule.bearer)/1000,hardware=frameHardware(plan.frame,s.frameFaceWidth??35)
  const polygon=(points:Position3[],fill:string,kind:StructurePath['kind'])=>{
    const segment=points.map((p,i)=>{const q=project(p,kind);return `${i?'L':'M'}${Math.round(q.x*10000)/10000} ${Math.round(q.y*10000)/10000}`}).join('')+'Z',key=kind+fill
    let batch=paths.get(key);if(!batch){batch={kind,fill,segments:[]};paths.set(key,batch)}batch.segments.push(segment)
  }
  let pedestals=0,members=0
  const readings=surveyReadings(s)
  if(showSupports||exposure==='pedestals')for(const point of plan.frame.pedestals){
    pedestals++
    const ground=pedestalHeight(point,s,plan.frame.rule,readings).ground,p=physical(point),radius=(s.pedestalDiameter??150)/2000,adjustment=Math.max(0,head-ground),plate=Math.min(.008,adjustment/4),stem=Math.min(PEDESTAL_COLUMN_DIAMETER/2,radius*.8)
    const circle=(r:number,z:number)=>overviewCircle.map(unit=>({x:p.x+r*unit.x,y:p.y+r*unit.y,z}))
    polygon(circle(radius,ground+plate),'#566254','pedestal')
    const nx=Math.cos(angle)*stem,ny=-Math.sin(angle)*stem
    polygon([{x:p.x-nx,y:p.y-ny,z:ground+plate},{x:p.x+nx,y:p.y+ny,z:ground+plate},{x:p.x+nx,y:p.y+ny,z:head-plate},{x:p.x-nx,y:p.y-ny,z:head-plate}],'#3d4c3e','pedestal')
    polygon(circle(radius*.8,head),'#64735d','pedestal')
  }
  if(exposure!=='pedestals')for(const [i,original] of plan.frame.members.entries()){
    const member=renderedMember(original,hardware.trims[i])
    if(exposure==='bearers'&&member.kind!=='bearer')continue
    const a=physical(member.a),b=physical(member.b),length=Math.hypot(b.x-a.x,b.y-a.y);if(length<1e-9)continue
    members++
    const half=(s.frameFaceWidth??35)/2000,nx=-(b.y-a.y)/length*half,ny=(b.x-a.x)/length*half
    const top=boardBottom-(member.kind==='bearer'?plan.frame.rule.joist/1000:0),bottom=top-member.size/1000,kind=member.kind==='bearer'?'bearer':'joist',colour=colours[member.kind]
    const ring=[{x:a.x+nx,y:a.y+ny},{x:a.x-nx,y:a.y-ny},{x:b.x-nx,y:b.y-ny},{x:b.x+nx,y:b.y+ny}]
    polygon(ring.map(p=>({...p,z:top})),colour[0],kind)
    for(let i=0;i<ring.length;i++){
      const u=ring[i],v=ring[(i+1)%ring.length],length=Math.hypot(v.x-u.x,v.y-u.y),normal={x:(v.y-u.y)/length,y:-(v.x-u.x)/length}
      if(normal.x*view.x+normal.y*view.y>1e-8)polygon([{...u,z:bottom},{...v,z:bottom},{...v,z:top},{...u,z:top}],colour[1],kind)
    }
  }
  const tier={pedestal:0,bearer:1,joist:2}
  return {paths:[...paths.values()].sort((a,b)=>tier[a.kind]-tier[b.kind]).map(p=>({kind:p.kind,fill:p.fill,path:p.segments.join('')})),components:{pedestals,members}}
}
