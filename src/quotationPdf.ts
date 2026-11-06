import { PDFDocument } from 'pdf-lib'
import type { Plan, Settings } from './planner.ts'
import { installerPlan } from './installerPlan.ts'
import { quotationEstimate, quotationSummary } from './quotationEstimate.ts'
import { quotationNotes } from './quotationNotes.ts'
import { QUOTE_COLOURS as c, quotationDocument, quoteDate, quoteMoney, quoteRate, quoteReference } from './quotationDocument.ts'

export type QuotationPdfOptions={now?:Date;logo?:Uint8Array;preview?:Uint8Array;omitFooter?:boolean;omitProjectNotes?:boolean}
export async function exportQuotationPdf(plan:Plan,s:Settings,prices:Record<string,string>,options:QuotationPdfOptions={}){
  const doc=await PDFDocument.create(),now=options.now??new Date(),q=s.quotation??{},reference=quoteReference(q,installerPlan(plan,s).reference),estimate=quotationEstimate(plan,s,prices)
  doc.setTitle(`BetterDeck® quotation ${reference}`);doc.setAuthor('BetterDeck');doc.setCreator('BetterPlan');doc.setCreationDate(now);doc.setModificationDate(now)
  const p=await quotationDocument(doc,reference,q,now,options.logo)
  p.next('The details, made clear.')
  if(q.customerName?.trim())p.paragraph(`Prepared for ${q.customerName}`,3.2,true)
  if(q.customerAddress?.trim())p.paragraph(q.customerAddress,2.7,false,c.muted)
  if(q.customerEircode?.trim())p.paragraph(q.customerEircode,2.7,false,c.muted)
  if(q.siteAddress?.trim()&&q.siteAddress!==q.customerAddress)p.paragraph(`Installation address: ${q.siteAddress}`,2.7,false,c.muted)
  for(const [label,value] of [['Project reference',q.projectReference],['Account number',q.accountNumber],['Customer order',q.customerOrderNumber],['Valid until',q.validUntil?quoteDate(new Date(`${q.validUntil}T12:00:00Z`)):undefined]] as const)if(value?.trim())p.paragraph(`${label}: ${value}`,2.8)
  if(options.preview)await p.image(options.preview,65)
  const header=()=>{p.rect(16,p.y,178,9,c.pale);['DESCRIPTION','QTY','UNIT','UNIT RATE','NET AMOUNT'].forEach((h,i)=>p.text(h,[18,111,126,163,192][i],p.y+6,2.1,true,c.muted,i>2));p.y+=9}
  p.ensure(30);header()
  let group=''
  for(const line of estimate.lines){
    const nextGroup=line.sectionId==='extras'?'Extras':`${line.sectionName} · ${line.group}`,description=p.wrap(line.name,86,2.8),unit=p.wrap(line.unit,19,2.5),pending=line.pending||line.rate===null
    const groupLines=p.wrap(nextGroup,172,2.7,true),groupHeight=Math.max(8,groupLines.length*4.5+3)
    const height=Math.max(9,Math.max(description.length*4.4,unit.length*4.1)+4)+(pending?5:0),newGroup=group!==nextGroup
    if(p.y+height+(newGroup?groupHeight:0)>269){p.next('Your quotation - continued');header();group=''}
    if(group!==nextGroup){groupLines.forEach((v,i)=>p.text(v,18,p.y+6+i*4.5,2.5,true,c.accent));p.y+=groupHeight;group=nextGroup}
    description.forEach((v,i)=>p.text(v,19,p.y+5.8+i*4.4,2.8))
    p.fittedText(line.pending?'Pending':String(line.qty),111,p.y+5.8,13,2.7)
    unit.forEach((v,i)=>p.text(v,126,p.y+5.8+i*4.1,2.5))
    p.fittedText(line.rate===null?'Missing':quoteRate(line.rate),163,p.y+5.8,17,2.7,false,c.ink,true)
    p.fittedText(line.cents===null?'Pending':quoteMoney(line.cents),191,p.y+5.8,25,2.8,true,c.ink,true)
    if(pending)p.text(line.pending?'Quantity / description needs confirmation':'Unit rate required',19,p.y+height-3,2.3,false,c.muted)
    p.y+=height;p.rule(p.y)
  }
  const summary=quotationSummary(estimate)
  p.ensure(9+summary.reduce((height,row,i)=>height+(i===4?14:Math.max(6,p.wrap(row.label,57,2.7).length*4.4+2)),0))
  p.y+=9
  p.text('FULFILMENT',16,p.y+2,2.1,true,c.muted)
  p.text(q.fulfilment==='collection'?'Customer collection':'Delivery to site',16,p.y+9,2.8,true,c.green)
  p.text(q.fulfilment==='collection'?'No delivery charge':`${quoteMoney(estimate.deliveryCents)} excluding VAT`,16,p.y+15,2.5,false,c.muted)
  for(const [i,row] of summary.entries()){
    const last=i===4;if(last)p.rule(p.y-3,105,89,c.accent,.5)
    const labels=p.wrap(row.label,57,2.7,last)
    labels.forEach((line,j)=>p.text(line,105,p.y+2+j*4.4,2.7,last,last?c.green:c.muted))
    p.fittedText(row.cents===null?'Pending':quoteMoney(row.cents),192,p.y+2,29,last?4.2:3,true,c.green,true);p.y+=last?14:Math.max(6,labels.length*4.4+2)
  }
  if(!estimate.complete)p.paragraph(`${estimate.priced} of ${estimate.lines.length} item rates entered.${estimate.pending?' Some quantities or descriptions still need confirmation.':''}`,2.5,false,c.muted)
  if(!options.omitProjectNotes)quotationNotes(p,q,estimate,reference)
  if(!options.omitFooter)p.footer()
  return doc.save()
}
