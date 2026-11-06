import type { Plan, Settings } from './planner.ts'
import { quotationMaterialLines, quotationSections } from './quotationSections.ts'

// Delivery is entered net; the entered percentage applies to materials + delivery.
// Keep partial net estimates visible, but never turn them into a complete gross quote.
export function quotationEstimate(plan:Plan,s:Settings,prices:Record<string,string>){
  const sections=quotationSections(plan,s,prices),materials=quotationMaterialLines(sections)
  const extras=(s.quotation?.extras??[]).map(e=>{
    const rate=e.unitRate!==undefined&&Number.isFinite(e.unitRate)&&e.unitRate>=0?e.unitRate:null,pending=!e.description.trim()||!Number.isFinite(e.quantity)||e.quantity<=0||!e.unit.trim()
    return {key:`extra:${e.id}`,name:e.description.trim()||'Extra description required',qty:e.quantity,unit:e.unit,note:'Additional quoted item',pending,rate,cents:pending||rate===null?null:Math.round((e.quantity*rate+Number.EPSILON)*100),sectionId:'extras',sectionName:'Extras',group:'Extras'}
  })
  const lines=[...materials,...extras],priced=lines.filter(l=>l.rate!==null).length,pending=lines.some(l=>l.pending),complete=!pending&&priced===lines.length
  const subtotalCents=lines.reduce((sum,l)=>sum+(l.cents??0),0),deliveryCents=s.quotation?.fulfilment==='collection'?0:Math.round(((s.quotation?.deliveryNet??0)+Number.EPSILON)*100)
  const netCents=subtotalCents+deliveryCents,vatRate=s.quotation?.vatRate??null
  const vatCents=complete&&vatRate!==null?Math.round((netCents*vatRate/100)+Number.EPSILON):null
  return {lines,sections,priced,pending,complete,provisional:true,orderReady:false,subtotalCents,deliveryCents,netCents,vatRate,vatCents,totalCents:vatCents===null?null:netCents+vatCents}
}
export type QuotationEstimate=ReturnType<typeof quotationEstimate>
export function quotationSummary(estimate:QuotationEstimate):{label:string;cents:number|null}[]{
  return [
    {label:estimate.complete?'Items subtotal':'Known priced subtotal',cents:estimate.subtotalCents},
    {label:'Delivery excluding VAT',cents:estimate.deliveryCents},
    {label:estimate.complete?'Net total':'Known net subtotal (incomplete)',cents:estimate.netCents},
    {label:estimate.vatRate===null?'VAT (rate not entered)':`VAT (${estimate.vatRate}%)`,cents:estimate.vatCents},
    {label:!estimate.complete?'Quotation incomplete':estimate.vatRate===null?'Total including VAT (rate required)':'Total including VAT',cents:estimate.totalCents},
  ]
}
export const QUOTATION_EXCLUSIONS='Only listed items are priced. Labour, ground preparation, unlisted hardware and spare allowances are excluded unless explicitly itemised. Provisional quotation: installer to confirm quantities and site measurements before ordering. Supplier connections, support capacities and site conditions require verification.'
