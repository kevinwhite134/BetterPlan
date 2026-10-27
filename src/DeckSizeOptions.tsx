import { SettingHeading } from './SettingControls'
import { useMemo, useState } from 'react'
import { planDeck } from './planner'
import { deckSizeOptions } from './deckSizing'
import type { Point, Settings } from './planner'

export default function DeckSizeOptions({settings:s,disabled,onChange}:{settings:Settings;disabled:boolean;onChange:(s:Settings)=>void}){
  const options=useMemo(()=>deckSizeOptions(s),[s]),[selection,setSelection]=useState<'smaller'|'bigger'|null>(null)
  const selected=options.find(q=>q.id===selection)
  const preview=useMemo(()=>{
    if(!selected?.settings)return null
    try{const plan=planDeck(selected.settings);return {plan,error:''}}catch(error){return {plan:null,error:error instanceof Error?error.message:'The layout needs review.'}}
  },[selected])
  const axis=options[0].axis==='y'?'depth':'width'
  const polygons=[s.polygon,...(selected?.settings?[selected.settings.polygon]:[])],points=polygons.flat(),minX=Math.min(...points.map(q=>q.x)),minY=Math.min(...points.map(q=>q.y)),width=Math.max(...points.map(q=>q.x))-minX,depth=Math.max(...points.map(q=>q.y))-minY,pad=Math.max(width,depth)*.08
  const coordinates=(p:Point[])=>p.map(q=>`${q.x},${q.y}`).join(' ')
  return <section id="deck-size-options" className="deck-size-options" aria-label="Whole-board deck size options">
    <SettingHeading label="Whole-board sizes" help={{description:'Preview a deck width or depth that fits one board row fewer or more. The outline changes only when you apply the preview.',affects:'Deck dimensions, board rows, cuts and support positions. Customer build-up height is kept unchanged.'}}/>
    <p>{options[0].rectangle?`Adjust ${axis} to fit full board rows.`:`Adjust ${axis} to fit full rows. Check shaped corners in the preview.`}</p>
    <div className="size-choice-grid segmented">{options.map(q=><button type="button" key={q.id} disabled={disabled||!!q.error} className={selection===q.id?'selected':''} aria-pressed={selection===q.id} onClick={()=>setSelection(q.id)} title={q.error||`Preview ${q.id} deck`}>
      <strong>{q.id==='smaller'?'− Board smaller':'+ Board bigger'}</strong>
      <span>{Number.isFinite(q.target)?`${q.target.toFixed(3)} m ${axis}`:'Enter dimensions'}</span>
      <small>{q.error||`${q.rows!==undefined?`${q.rows} full rows · `:''}${q.delta>0?'+':''}${Math.round(q.delta*1000)} mm`}</small>
    </button>)}</div>
    {disabled?<p>Apply or revert your current drawing changes to resize.</p>:null}
    {selected?.settings?<div className="size-preview">
      <svg viewBox={`${minX-pad} ${minY-pad} ${width+2*pad} ${depth+2*pad}`} role="img" aria-label={`${selected.id} outline preview; dashed outline is the current deck`}>
        <polygon points={coordinates(selected.settings.polygon)} fill="#c8dabb" stroke="#4b7040" strokeWidth={Math.max(width,depth)*.006}/>
        <polygon points={coordinates(s.polygon)} fill="none" stroke="#a37551" strokeDasharray={`${Math.max(width,depth)*.025} ${Math.max(width,depth)*.02}`} strokeWidth={Math.max(width,depth)*.005}/>
      </svg>
      <p>Current {selected.current.toFixed(3)} m → proposed {selected.target.toFixed(3)} m {axis}. Dashed = current outline.</p>
      <p role="status">{preview?.error||preview?.plan&&(preview.plan.frame.geometryPass?'Support geometry checks pass for this size.':`Support review remains: ${preview.plan.frame.issues[0]}`)}</p>
      {preview?.plan?.boards.fit.needsAdjustment?<p>Local board fit still needs review on this outline.</p>:null}
      {preview?.plan&&!preview.plan.heightFits?<p>The selected pedestal height range still needs correction.</p>:null}
      <button type="button" className="button primary full" disabled={disabled} onClick={()=>onChange(selected.settings!)}>Apply {selected.id} size</button>
    </div>:null}
  </section>
}
