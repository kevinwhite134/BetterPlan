import { memo, useMemo } from 'react'
import { projectedStructure, structureGeometry, structurePaths } from './structureGeometry'
import { isLargePreview } from './renderOverview'
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
  return isLargePreview(props.plan)?<BatchedStructure {...props}/>:<DetailedStructure {...props}/>
})
export default StructureDrawing
