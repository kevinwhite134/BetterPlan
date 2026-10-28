import { memo, useMemo } from 'react'
import { projectedStructure, structurePaths } from './structureGeometry'
import { hardwareGeometry } from './hardwareGeometry'
import type { Position3, StructureExposure } from './structureGeometry'
import type { Plan, Settings, Point } from './planner'

const BatchedStructure=memo(function BatchedStructure({plan,settings,exposure,showSupports,rotation,tilt,project}:{plan:Plan;settings:Settings;exposure:StructureExposure;showSupports:boolean;rotation:number;tilt:number;project:(p:Position3,kind?:'pedestal'|'bearer'|'joist',component?:string)=>Point}){
  const drawing=useMemo(()=>structurePaths(plan,settings,exposure,showSupports,rotation,tilt,project,plan.frame.pedestals.length<200?16:8),[plan,settings,exposure,showSupports,rotation,tilt,project])
  return <g className="structure-drawing overview-structure" data-pedestal-count={drawing.components.pedestals} data-member-count={drawing.components.members}>{drawing.paths.map((p,i)=><path key={i} d={p.path} fill={p.fill} data-kind={p.kind}/>)}</g>
})
const StructureDrawing=memo(function StructureDrawing(props:Parameters<typeof BatchedStructure>[0]&{showButtMarkers?:boolean}){
  const hardware=useMemo(()=>hardwareGeometry(props.plan,props.settings,props.exposure,props.showButtMarkers),[props.plan,props.settings,props.exposure,props.showButtMarkers])
  const visible=useMemo(()=>projectedStructure(hardware,props.rotation,props.tilt),[hardware,props.rotation,props.tilt])
  const paths=new Map<string,string[]>()
  for(const part of visible)for(const face of part.faces){const segments=paths.get(face.fill)??[];segments.push(face.points.map((p,i)=>{const q=props.project(p,part.kind,part.id);return `${i?'L':'M'}${Math.round(q.x*10000)/10000} ${Math.round(q.y*10000)/10000}`}).join('')+'Z');paths.set(face.fill,segments)}
  return <><BatchedStructure {...props}/><g className="hardware-drawing" data-connector-count={hardware.length}>{[...paths].map(([fill,segments])=><path key={fill} d={segments.join('')} fill={fill}/>)}</g></>
})
export default StructureDrawing
