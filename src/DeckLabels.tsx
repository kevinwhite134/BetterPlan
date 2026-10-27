import { visibleEditorView } from './supportViewport'
import { useMemo } from 'react'
import type { Plan, Settings } from './planner'
import type { Position3, StructureExposure } from './structureGeometry'
import type { SceneTier } from './sceneComponents'
import type { ExplosionLayout } from './explodedLayout'
import { deckLabelData } from './deckLabelData'
import { placeLabelBoxes } from './labelMarkers'

function labelLines(name:string){
  const lines:string[]=[]
  for(const word of name.split(/\s+/)){
    const last=lines.length-1
    if(last>=0&&lines[last].length+word.length<29)lines[last]+=` ${word}`
    else lines.push(word)
  }
  return lines
}

type LabelProps={plan:Plan;s:Settings;exposure:StructureExposure;showSupports:boolean;layout?:ExplosionLayout}
export default function DeckLabels({plan,s,exposure,showSupports,layout,project,view,pixelSize={width:700,height:480}}:LabelProps&{pixelSize?:{width:number;height:number};project:(p:Position3,tier?:SceneTier,component?:string)=>{x:number;y:number};view:{x:number;y:number;w:number;h:number}}){
  const labels=useMemo(()=>deckLabelData(plan,s,exposure,showSupports,layout),[plan,s,exposure,showSupports,layout]),visible=visibleEditorView(view,pixelSize.width,pixelSize.height),unit=1/visible.scale
  const anchors=labels.map(label=>project(label.point,label.tier,label.id)),lines=labels.map(label=>labelLines(label.name))
  const sizes=lines.map(rows=>({w:Math.min(visible.w,(Math.max(...rows.map(row=>row.length))*6.5+18)*unit),h:(rows.length*15+12)*unit}))
  const positions=placeLabelBoxes(anchors,visible,sizes,5*unit)
  return <g className="deck-part-labels" pointerEvents="none" aria-label="Product names">{labels.map((label,i)=>{
    const p=positions[i];if(!p)return null
    const anchor=anchors[i]
    return <g key={label.id} data-label={label.id}><title>{label.name}</title><path d={`M${anchor.x} ${anchor.y}L${p.x+p.w/2} ${p.y+p.h/2}`} stroke="#52713b" strokeWidth={unit}/><circle cx={anchor.x} cy={anchor.y} r={2.5*unit} fill="#304e26"/><rect x={p.x} y={p.y} width={p.w} height={p.h} rx={4*unit} fill="#fbfdf5" fillOpacity=".96" stroke="#52713b" strokeWidth={unit}/><text fontSize={11*unit} fontWeight="600" fill="#304e26">{lines[i].map((line,j)=><tspan key={j} x={p.x+9*unit} y={p.y+(17+j*15)*unit}>{line}</tspan>)}</text></g>
  })}</g>
}
export function DeckLabelKey({plan,s,exposure,showSupports,layout}:LabelProps){
  const labels=useMemo(()=>deckLabelData(plan,s,exposure,showSupports,layout),[plan,s,exposure,showSupports,layout])
  return <div className="deck-label-key" aria-label="Labeled products"><strong>Products shown</strong><ol>{labels.map(label=><li key={label.id}>{label.name}</li>)}</ol></div>
}
