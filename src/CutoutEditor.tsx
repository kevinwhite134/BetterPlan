import { useState } from 'react'
import { Field } from './SettingControls'
import type { Cutout, Settings } from './planner'
import type { CutoutTool } from './cutoutInteraction'
import { cutoutBounds, measureCutout } from './cutoutInteraction'

function ExactCutout({hole,onSave}:{hole:Cutout;onSave:(hole:Cutout)=>string}){
  const b=cutoutBounds(hole),[name,setName]=useState(hole.name),[x,setX]=useState(b.x),[y,setY]=useState(b.y),[width,setWidth]=useState(b.width),[depth,setDepth]=useState(b.depth),[error,setError]=useState('')
  const number=(label:string,value:number,change:(n:number)=>void)=><Field label={label} unit="m"><input type="number" step=".01" value={Number.isFinite(value)?Math.round(value*1000)/1000:''} onChange={e=>change(e.target.value===''?NaN:+e.target.value)}/></Field>
  return <details className="cutout-exact"><summary>Exact measurements & name</summary><Field label="Cutout name"><input value={name} maxLength={80} onChange={e=>setName(e.target.value)}/></Field><div className="field-grid">{number('Cutout X',x,setX)}{number('Cutout Y',y,setY)}</div><div className="field-grid">{number(hole.shape==='circle'?'Cutout diameter':'Cutout width',width,setWidth)}{hole.shape!=='circle'?number('Cutout depth',depth,setDepth):null}</div><button className="button secondary full" onClick={()=>{if(!Number.isFinite(x+y+width+depth)||width<.05||depth<.05){setError('Enter dimensions of at least 0.05 m.');return}setError(onSave({...measureCutout(hole,x,y,width,depth),name:name.trim()||hole.name}))}}>Apply measurements</button>{error?<p className="error" role="alert">{error}</p>:null}</details>
}

export default function CutoutEditor({settings:s,selected,placement,disabled,onSelect,onPlacement,onChange}:{settings:Settings;selected:string|null;placement:CutoutTool|null;disabled:boolean;onSelect:(id:string|null)=>void;onPlacement:(tool:CutoutTool|null)=>void;onChange:(s:Settings)=>string}){
  const holes=s.cutouts??[],hole=holes.find(h=>h.id===selected)
  const [error,setError]=useState('')
  const tools:{id:CutoutTool;label:string;icon:string}[]=[{id:'rectangle',label:'Rectangle',icon:'▭'},{id:'circle',label:'Circle',icon:'○'},{id:'oval',label:'Oval',icon:'⬭'},{id:'custom',label:'Draw shape',icon:'⬡'}]
  return <section className="cutout-settings"><div className="section-heading"><h2>Cutouts</h2><span>{holes.length} / 10</span></div>
    <div className="cutout-shape-tools" role="group" aria-label="Add a cutout">{tools.map(t=><button type="button" key={t.id} disabled={disabled||holes.length>=10} aria-pressed={placement===t.id} className={placement===t.id?'selected':''} onClick={()=>{setError('');onSelect(null);onPlacement(placement===t.id?null:t.id)}}><span aria-hidden="true">{t.icon}</span>{t.label}</button>)}</div>
    <p className="field-note">Pick a shape, then click the plan. Drag an opening to move it; pull its handles to resize.</p>
    {placement?<button type="button" className="button secondary full" onClick={()=>onPlacement(null)}>Cancel placement</button>:null}
    {holes.length?<div className="cutout-list" aria-label="Deck openings">{holes.map(h=>{const b=cutoutBounds(h);return <div className={h.id===selected?'selected':''} key={h.id}><button type="button" disabled={disabled} aria-pressed={h.id===selected} onClick={()=>{onPlacement(null);onSelect(h.id)}}><strong>{h.name}</strong><small>{b.width.toFixed(2)} × {b.depth.toFixed(2)} m</small></button><button type="button" disabled={disabled} aria-label={`Delete cutout ${h.name}`} className="cutout-delete" onClick={()=>{const issue=onChange({...s,cutouts:holes.filter(p=>p.id!==h.id),edgeDetailConfirmed:false,confirmed:false});setError(issue);if(!issue&&selected===h.id)onSelect(null)}}>×</button></div>})}</div>:null}
    {hole?<ExactCutout key={JSON.stringify(hole)} hole={hole} onSave={next=>onChange({...s,cutouts:holes.map(h=>h.id===hole.id?next:h),edgeDetailConfirmed:false,confirmed:false})}/>:null}
    {error?<p className="error" role="alert">{error}</p>:null}
  </section>
}
