import { planDeck, validateSettings } from './planner.ts'
import type { Settings } from './planner.ts'

export const QUOTATION_VIEWS=[{value:'front-left',label:'Front left',angle:35},{value:'front-right',label:'Front right',angle:145},{value:'rear-right',label:'Rear right',angle:215},{value:'rear-left',label:'Rear left',angle:325}] as const
export type QuotationView=typeof QUOTATION_VIEWS[number]['value']
export type QuotationExtra={id:string;description:string;quantity:number;unit:string;unitRate?:number}
export type QuotationDeck={id:string;name:string;settings:Omit<Settings,'quotation'>;prices:Record<string,string>}
export type QuotationDetails={
  customerName?:string;customerAddress?:string;customerEircode?:string;siteAddress?:string;projectReference?:string;notes?:string;
  quotationNumber?:string;accountNumber?:string;customerOrderNumber?:string;revision?:string;validUntil?:string;
  deckName?:string;scope?:string;inclusions?:string;exclusions?:string;terms?:string;acceptance?:string;installationUrl?:string;
  fulfilment?:'delivery'|'collection';view?:QuotationView;additionalDecks?:QuotationDeck[];extras?:QuotationExtra[];
  deliveryNet?:number;vatRate?:number
}
export const QUOTATION_FIELDS=[
  {key:'customerName',label:'Customer name',max:160},{key:'customerAddress',label:'Customer address',max:1000},
  {key:'customerEircode',label:'Eircode',max:20},{key:'siteAddress',label:'Site address',max:1000},
  {key:'projectReference',label:'Project reference',max:100},{key:'quotationNumber',label:'Quotation number',max:100},
  {key:'accountNumber',label:'Account number',max:100},{key:'customerOrderNumber',label:'Customer order number',max:100},
  {key:'revision',label:'Revision',max:40},{key:'deckName',label:'Deck section name',max:120},
  {key:'scope',label:'Project scope',max:3000},{key:'inclusions',label:'Included',max:3000},
  {key:'exclusions',label:'Excluded',max:3000},{key:'terms',label:'Payment and quotation terms',max:3000},
  {key:'acceptance',label:'How to accept or request changes',max:2000},{key:'installationUrl',label:'Installation guide link',max:1000},
  {key:'notes',label:'Quotation notes',max:6000},
] as const
export function installationLink(value:string|undefined){
  if(!value?.trim())return null
  try{const url=new URL(value);return /^https?:$/.test(url.protocol)&&!url.username&&!url.password?url.href:null}catch{return null}
}
const checkedDesigns=new WeakSet<object>()
export function quotationDetailsError(details:unknown):string{
  if(details===undefined)return ''
  if(!details||typeof details!=='object'||Array.isArray(details))return 'Invalid quotation details.'
  const q=details as QuotationDetails
  for(const field of QUOTATION_FIELDS){const value=q[field.key];if(value!==undefined&&(typeof value!=='string'||value.length>field.max))return `${field.label} must be text of at most ${field.max} characters.`}
  for(const [key,label,max] of [['deliveryNet','Delivery cost',10000000],['vatRate','VAT percentage',100]] as const){const value=(details as Record<string,unknown>)[key];if(value!==undefined&&(typeof value!=='number'||!Number.isFinite(value)||value<0||value>max))return `${label} must be a number between 0 and ${max}.`}
  if(q.fulfilment!==undefined&&!['delivery','collection'].includes(q.fulfilment))return 'Choose delivery or collection.'
  if(q.fulfilment==='collection'&&(q.deliveryNet??0)!==0)return 'Collection quotations must have zero delivery cost.'
  if(q.view!==undefined&&!QUOTATION_VIEWS.some(v=>v.value===q.view))return 'Choose a quotation camera view.'
  if(q.validUntil!==undefined&&q.validUntil!==''&&(!/^\d{4}-\d{2}-\d{2}$/.test(q.validUntil)||!Number.isFinite(Date.parse(q.validUntil))||new Date(q.validUntil).toISOString().slice(0,10)!==q.validUntil))return 'Enter a valid quotation expiry date.'
  if(q.installationUrl?.trim()&&!installationLink(q.installationUrl))return 'Installation guide link must be an http or https URL.'
  if(q.extras!==undefined){
    if(!Array.isArray(q.extras)||q.extras.length>100)return 'Use at most 100 quotation extras.'
    const ids=new Set<string>()
    for(const e of q.extras){
      if(!e||typeof e.id!=='string'||!e.id||ids.has(e.id)||typeof e.description!=='string'||e.description.length>300||typeof e.unit!=='string'||!e.unit.trim()||e.unit.length>40)return 'Invalid quotation extra.'
      ids.add(e.id)
      if(!Number.isFinite(e.quantity)||e.quantity<=0||e.quantity>1000000)return 'Extra quantity must be greater than zero and at most 1,000,000.'
      if(e.unitRate!==undefined&&(!Number.isFinite(e.unitRate)||e.unitRate<0||e.unitRate>10000000))return 'Extra unit rate must be between 0 and 10,000,000.'
    }
  }
  if(q.additionalDecks!==undefined){
    if(!Array.isArray(q.additionalDecks)||q.additionalDecks.length>8)return 'Use at most eight additional deck sections.'
    const ids=new Set<string>()
    for(const deck of q.additionalDecks){
      if(!deck||typeof deck.id!=='string'||!deck.id||['current','extras'].includes(deck.id)||ids.has(deck.id)||typeof deck.name!=='string'||!deck.name.trim()||deck.name.length>120)return 'Invalid additional deck section.'
      ids.add(deck.id)
      if(!deck.settings||typeof deck.settings!=='object'||'quotation' in deck.settings)return 'Additional decks must contain design settings only.'
      try{
        if(!checkedDesigns.has(deck.settings)){
          const error=validateSettings(deck.settings);if(error)return `Additional deck ${deck.name}: ${error}`
          planDeck(deck.settings);checkedDesigns.add(deck.settings)
        }
      }catch{return `Additional deck ${deck.name} could not be planned. Open it in Review, correct its design and add it again.`}
      if(!deck.prices||typeof deck.prices!=='object'||Array.isArray(deck.prices)||Object.values(deck.prices).some(v=>typeof v!=='string'||(v!==''&&(!Number.isFinite(Number(v))||Number(v)<0||Number(v)>10000000))))return 'Invalid additional deck prices.'
    }
  }
  return ''
}
