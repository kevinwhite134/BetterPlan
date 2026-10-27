import { visibleEditorView } from './supportViewport'
import { useMemo } from 'react'
import type { Plan, Settings } from './planner'
import type { Position3, StructureExposure } from './structureGeometry'
import type { SceneTier } from './sceneComponents'
import type { ExplosionLayout } from './explodedLayout'
import { deckLabelData } from './deckLabelData'
import { placeLabelMarkers } from './labelMarkers'

type LabelProps={plan:Plan;s:Settings;exposure:StructureExposure;showSupports:boolean;layout?:ExplosionLayout}
export default function DeckLabels({plan,s,exposure,showSupports,layout,project,view,pixelSize={width:700,height:480}}:LabelProps&{pixelSize?:{width:number;height:number};project:(p:Position3,tier?:SceneTier,component?:string)=>{x:number;y:number};view:{x:number;y:number;w:number;h:number}}){
  const labels=useMemo(()=>deckLabelData(plan,s,exposure,showSupports,layout),[plan,s,exposure,showSupports,layout]),visible=visibleEditorView(view,pixelSize.width,pixelSize.height),radius=9/visible.scale
  const anchors=labels.map(label=>project(label.point,label.tier,label.id)),positions=placeLabelMarkers(anchors,visible,radius)
  return <g className="deck-part-labels" pointerEvents="none" aria-label="Numbered component markers; names are in the component key below">{labels.map((label,i)=>{
    const p=positions[i];if(!p)return null
    return <g key={label.id} data-label={label.id}><title>{i+1}. {label.name}</title><circle cx={p.x} cy={p.y} r={radius} fill="#fbfdf5" fillOpacity=".96" stroke="#52713b" strokeWidth={radius*.13}/><text x={p.x} y={p.y+radius*.35} fontSize={radius*1.18} fontWeight="600" textAnchor="middle" fill="#304e26">{i+1}</text></g>
  })}</g>
}
export function DeckLabelKey({plan,s,exposure,showSupports,layout}:LabelProps){
  const labels=useMemo(()=>deckLabelData(plan,s,exposure,showSupports,layout),[plan,s,exposure,showSupports,layout])
  return <div className="deck-label-key" aria-label="Component label key"><strong>Component key</strong><ol>{labels.map((label,i)=><li key={label.id}><span aria-hidden="true">{i+1}</span>{label.name}</li>)}</ol></div>
}
