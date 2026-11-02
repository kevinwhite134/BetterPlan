import { materialEstimate } from './materialEstimate.ts'
import type { Plan, Settings } from './planner.ts'

// Delivery is entered net; the entered percentage applies to materials + delivery.
// Keep partial net estimates visible, but never turn them into a complete gross quote.
export function quotationEstimate(plan:Plan,s:Settings,prices:Record<string,string>){
  const estimate=materialEstimate(plan,prices),deliveryCents=Math.round(((s.quotation?.deliveryNet??0)+Number.EPSILON)*100)
  const netCents=estimate.subtotalCents+deliveryCents,vatRate=s.quotation?.vatRate??null
  const vatCents=estimate.complete&&vatRate!==null?Math.round((netCents*vatRate/100)+Number.EPSILON):null
  return {...estimate,deliveryCents,netCents,vatRate,vatCents,totalCents:vatCents===null?null:netCents+vatCents}
}
export type QuotationEstimate=ReturnType<typeof quotationEstimate>
export function quotationSummary(estimate:QuotationEstimate):{label:string;cents:number|null}[]{
  return [
    {label:estimate.complete?'Entered materials total':'Known priced subtotal',cents:estimate.subtotalCents},
    {label:'Delivery excluding VAT',cents:estimate.deliveryCents},
    {label:estimate.complete?'Net total':'Known net subtotal (incomplete)',cents:estimate.netCents},
    {label:estimate.vatRate===null?'VAT (rate not entered)':`VAT (${estimate.vatRate}%)`,cents:estimate.vatCents},
    {label:!estimate.complete?'Quotation incomplete':estimate.vatRate===null?'Total including VAT (rate required)':'Total including VAT',cents:estimate.totalCents},
  ]
}
export const QUOTATION_EXCLUSIONS='Includes entered delivery and VAT where specified. Labour, unlisted hardware and spare allowances are excluded. Provisional estimate; verify site measurements and supplier details.'
