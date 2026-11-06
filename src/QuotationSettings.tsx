import { useState } from 'react'
import type { Settings } from './planner'
import type { SavedProject } from './projectLibrary'
import { QUOTATION_FIELDS } from './quotationDetails'
import type { QuotationDetails, QuotationExtra } from './quotationDetails'
import { resolvedPricing } from './pricing'
import { quotationDetailsError } from './quotationDetails'
import './Quotation.css'

export default function QuotationSettings({s,onChange,projects=[],currentId}:{s:Settings;onChange:(s:Settings)=>void;projects?:SavedProject[];currentId?:string}){
  const q=s.quotation??{},[selected,setSelected]=useState(''),[deckError,setDeckError]=useState('')
  const change=(patch:Partial<QuotationDetails>)=>onChange({...s,quotation:{...q,...patch}})
  const textFields=(keys:typeof QUOTATION_FIELDS[number]['key'][])=>keys.map(key=>{
    const field=QUOTATION_FIELDS.find(f=>f.key===key)!,multiline=['customerAddress','siteAddress','scope','inclusions','exclusions','terms','acceptance','notes'].includes(key)
    return <label key={key}><span>{field.label}</span>{multiline?<textarea aria-label={field.label} rows={key==='notes'?4:2} value={q[key]??''} maxLength={field.max} onChange={e=>change({[key]:e.target.value})}/>:<input aria-label={field.label} value={q[key]??''} maxLength={field.max} onChange={e=>change({[key]:e.target.value})}/>}</label>
  })
  const addDeck=()=>{
    const project=projects.find(p=>p.id===selected);if(!project)return
    const design={...project.settings};delete design.quotation
    const additionalDecks=[...(q.additionalDecks??[]),JSON.parse(JSON.stringify({id:project.id,name:project.name,settings:design,prices:resolvedPricing(project.settings,project.prices)}))]
    const error=quotationDetailsError({additionalDecks});if(error){setDeckError(error);return}
    change({additionalDecks});setSelected('');setDeckError('')
  }
  const editExtra=(id:string,patch:Partial<QuotationExtra>)=>change({extras:q.extras?.map(e=>e.id===id?{...e,...patch}:e)})
  return <section className="quotation-settings" aria-labelledby="quotation-details-title"><h3 id="quotation-details-title">Customer quotation</h3><p>Saved with this project. Preview your deck and download the proposal in Downloads &amp; reports.</p>
    {textFields(['customerName','customerAddress','customerEircode','siteAddress'])}
    <details><summary>Quotation references</summary>{textFields(['projectReference','quotationNumber','accountNumber','customerOrderNumber','revision'])}<label><span>Valid until</span><input aria-label="Valid until" type="date" value={q.validUntil??''} onChange={e=>change({validUntil:e.target.value})}/></label></details>
    <details><summary>Project scope &amp; deck sections</summary>{textFields(['deckName','scope'])}<p>This design is always included. Add saved decks to price several sections in one quotation. Each addition saves its design and material rates; it excludes that project's quotation extras and delivery. Remove and add again to refresh it.</p>
      {(q.additionalDecks??[]).map(deck=><div className="quote-snapshot" key={deck.id}><strong>{deck.name}</strong><span>Saved design &amp; rates</span><button type="button" className="text-button" aria-label={`Remove deck ${deck.name}`} onClick={()=>change({additionalDecks:q.additionalDecks?.filter(d=>d.id!==deck.id)})}>Remove</button></div>)}
      <label><span>Add another deck</span><select aria-label="Add another deck" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose a saved project</option>{projects.filter(p=>p.id!==currentId&&!q.additionalDecks?.some(d=>d.id===p.id)).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <button type="button" className="button secondary full" disabled={!selected||(q.additionalDecks?.length??0)>=8} onClick={addDeck}>Add deck section</button>
      {deckError?<p className="quote-warning" role="alert">{deckError}</p>:null}
    </details>
    <details><summary>Extras &amp; additional items {q.extras?.length?`(${q.extras.length})`:''}</summary><p>Itemise steps, installation or other agreed work here. These items are priced separately and are not added to the 3D model or cutting lists.</p>
      {(q.extras??[]).map((e,i)=><fieldset className="quote-extra" key={e.id}><legend>Extra {i+1}</legend><label><span>Description</span><input aria-label={`Extra ${i+1} description`} maxLength={300} value={e.description} onChange={event=>editExtra(e.id,{description:event.target.value})}/></label><div className="quote-extra-grid"><label><span>Quantity</span><input aria-label={`Extra ${i+1} quantity`} type="number" min="0.001" max="1000000" step="any" value={Number.isFinite(e.quantity)?e.quantity:''} onChange={event=>editExtra(e.id,{quantity:event.target.value===''?NaN:Number(event.target.value)})}/></label><label><span>Unit</span><input aria-label={`Extra ${i+1} unit`} value={e.unit} maxLength={40} onChange={event=>editExtra(e.id,{unit:event.target.value})}/></label></div><label><span>Unit rate (€ ex VAT)</span><input aria-label={`Extra ${i+1} unit rate`} type="number" min="0" max="10000000" step="0.01" placeholder="Enter rate" value={e.unitRate??''} onChange={event=>editExtra(e.id,{unitRate:event.target.value===''?undefined:Number(event.target.value)})}/></label><button type="button" className="text-button" aria-label={`Remove extra ${i+1}`} onClick={()=>change({extras:q.extras?.filter(item=>item.id!==e.id)})}>Remove item</button></fieldset>)}
      <button type="button" className="button secondary full" disabled={(q.extras?.length??0)>=100} onClick={()=>change({extras:[...(q.extras??[]),{id:crypto.randomUUID(),description:'',quantity:1,unit:'item'}]})}>Add extra item</button>
    </details>
    <label><span>Collection or delivery</span><select aria-label="Collection or delivery" value={q.fulfilment??'delivery'} onChange={e=>change({fulfilment:e.target.value as 'collection'|'delivery',...(e.target.value==='collection'?{deliveryNet:0}:{})})}><option value="delivery">Delivery</option><option value="collection">Collection</option></select></label>
    {q.fulfilment!=='collection'?<label><span>Delivery excluding VAT (€)</span><input aria-label="Delivery excluding VAT" type="number" min="0" max="10000000" step="0.01" value={q.deliveryNet??0} onChange={e=>change({deliveryNet:e.target.value===''?undefined:Number(e.target.value)})}/></label>:null}
    <label><span>VAT (%)</span><input aria-label="VAT percentage" type="number" min="0" max="100" step="0.01" placeholder="Enter applicable rate" value={q.vatRate??''} onChange={e=>change({vatRate:e.target.value===''?undefined:Number(e.target.value)})}/></label><p>VAT applies to all quoted items and delivery. Enter the applicable rate; 0% is valid.</p>
    <details><summary>Scope, terms &amp; next steps</summary>{textFields(['inclusions','exclusions','terms','acceptance','installationUrl','notes'])}<p>An installation link appears as a clickable link and QR code. Leave it blank to omit it.</p></details>
  </section>
}
