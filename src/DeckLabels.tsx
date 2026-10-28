import { useMemo } from 'react'
import type { Plan, Settings } from './planner'
import type { StructureExposure } from './structureGeometry'
import type { ExplosionLayout } from './explodedLayout'
import { deckLabelData } from './deckLabelData'

type LabelProps={plan:Plan;s:Settings;exposure:StructureExposure;showSupports:boolean;layout?:ExplosionLayout;selectedId?:string|null;onSelect?:(id:string)=>void}

export function DeckLabelKey({plan,s,exposure,showSupports,layout,selectedId,onSelect}:LabelProps){
  const labels=useMemo(()=>deckLabelData(plan,s,exposure,showSupports,layout),[plan,s,exposure,showSupports,layout])
  return <aside className="deck-label-key" aria-label="Labeled products"><strong>Products shown</strong>{onSelect?<p>Choose a product to highlight it in the model.</p>:null}<ul>{labels.map(label=><li key={label.id}>{onSelect?<button type="button" aria-pressed={selectedId===label.id} onClick={()=>onSelect(label.id)}>{label.name}</button>:label.name}</li>)}</ul></aside>
}
