import { quotationSummary } from './quotationEstimate'
import CurrencyAmount from './CurrencyAmount'
import type { QuotationEstimate } from './quotationEstimate'

export default function QuotationTotals({estimate}:{estimate:QuotationEstimate}){
  return <dl className="quotation-totals" aria-label="Quotation totals">{quotationSummary(estimate).map(row=><div key={row.label}><dt>{row.label}</dt><dd>{row.cents===null?'Pending':<CurrencyAmount value={(row.cents/100).toFixed(2)}/>}</dd></div>)}</dl>
}
