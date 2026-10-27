import type { Settings } from './planner'
import { QUOTATION_FIELDS } from './quotationDetails'
export default function QuotationSettings({s,onChange}:{s:Settings;onChange:(s:Settings)=>void}){
  return <section className="quotation-settings" aria-labelledby="quotation-details-title"><h3 id="quotation-details-title">Customer quotation</h3><p>Saved with this project and included in the customer PDF pack.</p>{QUOTATION_FIELDS.map(field=><label key={field.key}><span>{field.label}</span>{field.key==='customerName'||field.key==='projectReference'?<input aria-label={field.label} value={s.quotation?.[field.key]??''} maxLength={field.max} onChange={e=>onChange({...s,quotation:{...s.quotation,[field.key]:e.target.value}})}/>:<textarea aria-label={field.label} rows={field.key==='notes'?4:2} value={s.quotation?.[field.key]??''} maxLength={field.max} onChange={e=>onChange({...s,quotation:{...s.quotation,[field.key]:e.target.value}})}/>}</label>)}</section>
}
