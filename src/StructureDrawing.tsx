import { memo, useMemo } from 'react'
import { projectedStructure, structureGeometry, structurePaths } from './structureGeometry'
import { isLargePreview } from './renderOverview'
import { hardwareGeometry } from './hardwareGeometry'
import type { Position3, StructureExposure } from './structureGeometry'
import type { Plan, Settings, Point } from './planner'

const DetailedStructure=memo(function DetailedStructure({plan,settings,exposure,showSupports,rotation,tilt,project}:{plan:Plan;settings:Settings;exposure:StructureExposure;showSupports:boolean;rotation:number;tilt:number;project:(p:Position3)=>Point}){
  const parts=useMemo(()=>structureGeometry(plan,settings,exposure,showSupports),[plan,settings,exposure,showSupports])
  const visible=useMemo(()=>projectedStructure(parts,rotation,tilt),[parts,rotation,tilt])
  return <g className="structure-drawing">{visible.map(part=><g key={part.id} data-component={part.id} data-kind={part.kind}><title>{part.label}</title>{part.faces.map((face,i)=><polygon key={i} points={face.points.map(p=>{const q=project(p);return `${q.x},${q.y}`}).join(' ')} fill={face.fill} stroke={part.kind==='pedestal'?'#303c32':'#5e6971'} strokeWidth=".0015" strokeLinejoin="round"/>)}</g>)}</g>
})
const BatchedStructure=memo(function BatchedStructure({plan,settings,exposure,showSupports,rotation,tilt,project}:{plan:Plan;settings:Settings;exposure:StructureExposure;showSupports:boolean;rotation:number;tilt:number;project:(p:Position3)=>Point}){
  const drawing=useMemo(()=>structurePaths(plan,settings,exposure,showSupports,rotation,tilt,project),[plan,settings,exposure,showSupports,rotation,tilt,project])
  return <g className="structure-drawing overview-structure" data-pedestal-count={drawing.components.pedestals} data-member-count={drawing.components.members}>{drawing.paths.map((p,i)=><path key={i} d={p.path} fill={p.fill} data-kind={p.kind}/>)}</g>
})
const StructureDrawing=memo(function StructureDrawing(props:Parameters<typeof DetailedStructure>[0]){
  const hardware=useMemo(()=>hardwareGeometry(props.plan,props.settings,props.exposure),[props.plan,props.settings,props.exposure])
  const visible=useMemo(()=>projectedStructure(hardware,props.rotation,props.tilt),[hardware,props.rotation,props.tilt])
  const paths=new Map<string,string[]>()
  for(const part of visible)for(const face of part.faces){const segments=paths.get(face.fill)??[];segments.push(face.points.map((p,i)=>{const q=props.project(p);return `${i?'L':'M'}${q.x} ${q.y}`}).join('')+'Z');paths.set(face.fill,segments)}
  return <>{isLargePreview(props.plan)?<BatchedStructure {...props}/>:<DetailedStructure {...props}/>}<g className="hardware-drawing" data-connector-count={hardware.length}>{[...paths].map(([fill,segments])=><path key={fill} d={segments.join('')} fill={fill}/>)}<title>Continuous joiners, paired aluminium side joist joiners and perpendicular joist joiners</title></g></>
})
export default StructureDrawing
