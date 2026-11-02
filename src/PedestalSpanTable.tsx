import { useMemo, useState } from 'react'
import { dimensionText, installerPlan } from './installerPlan'
import type { Plan, Settings } from './planner'

export default function PedestalSpans({plan,settings}:{plan:Plan;settings:Settings}){
  const spans=useMemo(()=>installerPlan(plan,settings).pedestalSpans,[plan,settings]),[page,setPage]=useState(0)
  const pages=Math.max(1,Math.ceil(spans.length/100)),current=Math.min(page,pages-1),xy=(p:{x:number;y:number})=>`${dimensionText(p.x)}, ${dimensionText(p.y)}`
  return <details className="pedestal-spans"><summary>Pedestal centre-to-centre spans · {spans.length}</summary><p className="field-note">Consecutive supports on each actual primary member. Coordinates and spans in mm; IDs match the pedestal CSV.</p>
    <div className="table-scroll"><table><thead><tr><th>From pedestal</th><th>To pedestal</th><th>From X, Y</th><th>To X, Y</th><th>Span c/c</th></tr></thead><tbody>{spans.slice(current*100,(current+1)*100).map(row=><tr key={`${row.from}:${row.to}`}><td>{row.from}</td><td>{row.to}</td><td>{xy(row.a)}</td><td>{xy(row.b)}</td><td>{dimensionText(row.length)}</td></tr>)}</tbody></table></div>
    {!spans.length?<p>No consecutive pedestal pairs on a primary member.</p>:null}{pages>1?<div><button type="button" disabled={current===0} onClick={()=>setPage(current-1)}>Previous spans</button><span> {current+1} / {pages} </span><button type="button" disabled={current===pages-1} onClick={()=>setPage(current+1)}>Next spans</button></div>:null}
  </details>
}
