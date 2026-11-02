export type QuotationDetails={customerName?:string;customerAddress?:string;customerEircode?:string;siteAddress?:string;projectReference?:string;notes?:string;deliveryNet?:number;vatRate?:number}
export const QUOTATION_FIELDS=[{key:'customerName',label:'Customer name',max:160},{key:'customerAddress',label:'Customer address',max:1000},{key:'customerEircode',label:'Eircode',max:20},{key:'siteAddress',label:'Site address',max:1000},{key:'projectReference',label:'Project reference',max:100},{key:'notes',label:'Quotation notes',max:6000}] as const
export function quotationDetailsError(details:unknown){
  if(details===undefined)return ''
  if(!details||typeof details!=='object'||Array.isArray(details))return 'Invalid quotation details.'
  for(const field of QUOTATION_FIELDS){const value=(details as Record<string,unknown>)[field.key];if(value!==undefined&&(typeof value!=='string'||value.length>field.max))return `${field.label} must be text of at most ${field.max} characters.`}
  for(const [key,label,max] of [['deliveryNet','Delivery cost',10000000],['vatRate','VAT percentage',100]] as const){const value=(details as Record<string,unknown>)[key];if(value!==undefined&&(typeof value!=='number'||!Number.isFinite(value)||value<0||value>max))return `${label} must be a number between 0 and ${max}.`}
  return ''
}
