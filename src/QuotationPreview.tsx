import { useMemo } from 'react'
import type { Plan, Settings } from './planner'
import { QUOTATION_VIEWS } from './quotationDetails'
import { quotationEstimate } from './quotationEstimate'
import { sectionSpecification } from './quotationSections'
import { deckPreviewSvg, deckPreviewUrl } from './deckPreview'
import QuotationTotals from './QuotationTotals'
import './Quotation.css'

export default function QuotationPreview({plan,settings:s,prices,onChange}:{plan:Plan;settings:Settings;prices:Record<string,string>;onChange:(s:Settings)=>void}){
  const quote=useMemo(()=>quotationEstimate(plan,s,prices),[plan,s,prices]),view=QUOTATION_VIEWS.find(v=>v.value===s.quotation?.view)??QUOTATION_VIEWS[0]
  const views=useMemo(()=>quote.sections.map(section=>({section,src:deckPreviewUrl(deckPreviewSvg(section.plan,section.settings,view.angle))})),[quote,view.angle])
  const money=(cents:number)=>new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR'}).format(cents/100)
  return <section className="quote-preview" aria-labelledby="quotation-preview-title"><div className="quote-preview-heading"><div><h3 id="quotation-preview-title">Your customer proposal</h3><p>{quote.sections.length} deck {quote.sections.length===1?'section':'sections'} · {(s.quotation?.extras??[]).length} extra {(s.quotation?.extras?.length??0)===1?'item':'items'} · {s.quotation?.fulfilment==='collection'?'For collection':'Delivery'}</p></div><label>3D camera angle<select aria-label="Quotation 3D camera angle" value={view.value} onChange={e=>onChange({...s,quotation:{...s.quotation,view:e.target.value as typeof view.value}})}>{QUOTATION_VIEWS.map(v=><option key={v.value} value={v.value}>{v.label}</option>)}</select></label></div>
    {views.map(({section,src})=><div key={section.id}><figure><img src={src} alt={`Quoted design for ${section.name} in ${section.settings.board.colourName}`}/><figcaption>{section.name} · Illustration of the quoted design. Extras are itemised separately and are not shown in this model. Colours are indicative.</figcaption></figure><div className="quote-section-spec"><h4>{section.name}</h4><ul>{sectionSpecification(section).map(line=><li key={line}>{line}</li>)}</ul>{!section.plan.frame.geometryPass?<p className="quote-warning">Support layout unresolved. Quantities and quotation total remain pending.</p>:null}</div></div>)}
    {s.quotation?.scope?.trim()?<div className="quote-section-spec"><h4>Project scope</h4><p>{s.quotation.scope}</p></div>:null}
    <details className="quote-pricing"><summary>Review all quoted items ({quote.lines.length})</summary><div className="table-scroll"><table><thead><tr><th>Item / deck section</th><th>Quantity</th><th>Unit rate</th><th>Net amount</th></tr></thead><tbody>{quote.lines.map(line=><tr key={line.key}><td>{line.name}<small>{line.sectionName} · {line.group}</small></td><td>{line.pending?'Pending':`${line.qty} ${line.unit}`}</td><td>{line.rate===null?'Missing':new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR',maximumFractionDigits:4}).format(line.rate)}</td><td>{line.cents===null?'Pending':money(line.cents)}</td></tr>)}</tbody></table></div><p>Edit this deck's material rates under Materials &amp; pricing. Additional deck rates are saved snapshots; remove and re-add a deck to refresh them.</p></details>
    <QuotationTotals estimate={quote}/>
  </section>
}
