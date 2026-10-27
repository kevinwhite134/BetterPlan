import { useState } from 'react'
import type { Plan, Settings } from './planner'
import { pedestalHeights, setSurveyLevel } from './pedestalSurvey'
import { pedestalReference } from './productNames'

function LevelInput({value,label,onCommit}:{value:number|null;label:string;onCommit:(n:number|null)=>void}){
  const [draft,setDraft]=useState<string|null>(null)
  return <input aria-label={label} type="number" min={-2000} max={2000} step={1} placeholder="Not surveyed" value={draft??value??''} onChange={e=>setDraft(e.target.value)} onBlur={()=>{if(draft!==null){const n=draft.trim()===''?null:Number(draft);if(n===null||Number.isFinite(n)&&Math.abs(n)<=2000)onCommit(n);setDraft(null)}}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape')setDraft(null)}}/>
}
export default function PedestalSurvey({plan,s,onChange}:{plan:Plan;s:Settings;onChange:(s:Settings)=>void}){
  const survey=pedestalHeights(plan.frame.pedestals,s,plan.frame.rule),[page,setPage]=useState(0),pages=Math.max(1,Math.ceil(survey.rows.length/15)),current=Math.min(page,pages-1)
  return <details className="pedestal-survey"><summary>Surveyed pedestal heights <span>{survey.surveyed} / {survey.rows.length}</span></summary><p>Ground level relative to the project datum, in mm. Positive levels raise the ground and shorten the pedestal. Finished deck level is +{s.height} mm. Blank readings use the average height and ±{s.variation} mm variation.</p>
    {!plan.frame.geometryPass?<p role="status">Resolve the support layout to enter readings at actual pedestal positions.</p>:<><p className={survey.fits?'survey-pass':'survey-fail'} role="status">{survey.fits?'All required adjustments fit this pedestal.':'Some required adjustments are outside this pedestal’s range.'} Product: {s.pedestalMin}–{s.pedestalMax} mm.</p>
    <div className="survey-table-scroll"><table><thead><tr><th>Position / X, Y mm</th><th>Ground mm</th><th>Adjustment mm</th></tr></thead><tbody>{survey.rows.slice(current*15,current*15+15).map((row,j)=>{const index=current*15+j,id=pedestalReference(s.pedestalName,index);return <tr key={`${row.point.x},${row.point.y}`} className={row.fits?'':'survey-outside'}><td><strong>{id}</strong><small>{Math.round(row.point.x*1000)}, {Math.round(row.point.y*1000)}</small></td><td><LevelInput label={`Ground level for ${id}`} value={row.level} onCommit={level=>onChange(setSurveyLevel(s,row.point,level))}/></td><td>{row.surveyed?row.required.toFixed(1):`${row.min.toFixed(0)}–${row.max.toFixed(0)}`}<small>{row.surveyed?'Surveyed':'Estimated'}{row.fits?'':' · Out of range'}</small></td></tr>})}</tbody></table></div>
    {pages>1?<div className="survey-pagination"><button disabled={current===0} onClick={()=>setPage(current-1)}>Previous</button><span>{current+1} / {pages}</span><button disabled={current===pages-1} onClick={()=>setPage(current+1)}>Next</button></div>:null}</>}
    {survey.unmatched?<p role="status">{survey.unmatched} saved readings are at earlier support positions. They are retained in the project and will not be applied to other pedestals.</p>:null}
  </details>
}
