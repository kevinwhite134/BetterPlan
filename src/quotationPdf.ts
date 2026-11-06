import { PDFDocument, rgb } from 'pdf-lib'
import qrcode from 'qrcode-generator'
import type { Plan, Settings } from './planner.ts'
import { installerPlan } from './installerPlan.ts'
import { quotationEstimate, quotationSummary, QUOTATION_EXCLUSIONS } from './quotationEstimate.ts'
import { installationLink } from './quotationDetails.ts'
import { QUOTE_COLOURS as c, quotationDocument, quoteDate, quoteMoney, quoteRate, quoteReference } from './quotationDocument.ts'

export type QuotationPdfOptions={now?:Date;logo?:Uint8Array;preview?:Uint8Array;omitFooter?:boolean}
export async function exportQuotationPdf(plan:Plan,s:Settings,prices:Record<string,string>,options:QuotationPdfOptions={}){
  const doc=await PDFDocument.create(),now=options.now??new Date(),q=s.quotation??{},reference=quoteReference(q,installerPlan(plan,s).reference),estimate=quotationEstimate(plan,s,prices)
  doc.setTitle(`BetterDeck® quotation ${reference}`);doc.setAuthor('BetterDeck');doc.setCreator('BetterPlan');doc.setCreationDate(now);doc.setModificationDate(now)
  const p=await quotationDocument(doc,reference,q,now,options.logo)
  p.next('Your quotation')
  if(!options.omitFooter&&q.customerName?.trim())p.paragraph(`Prepared for: ${q.customerName}`,2.8)
  for(const [label,value] of [['Project reference',q.projectReference],['Account number',q.accountNumber],['Customer order',q.customerOrderNumber],['Valid until',q.validUntil?quoteDate(new Date(`${q.validUntil}T12:00:00Z`)):undefined]] as const)if(value?.trim())p.paragraph(`${label}: ${value}`,2.8)
  if(options.preview)await p.image(options.preview,65)
  const header=()=>{p.rect(16,p.y,178,9,c.green);['Description','Qty','Unit','Unit rate','Net amount'].forEach((h,i)=>p.text(h,[19,111,126,163,191][i],p.y+6,2.5,true,c.white,i>2));p.y+=9}
  p.ensure(30);header()
  let group='',rowIndex=0
  for(const line of estimate.lines){
    const nextGroup=line.sectionId==='extras'?'Extras':`${line.sectionName} · ${line.group}`,description=p.wrap(line.name,86,2.8),unit=p.wrap(line.unit,19,2.5),pending=line.pending||line.rate===null
    const groupLines=p.wrap(nextGroup,172,2.7,true),groupHeight=Math.max(8,groupLines.length*4.5+3)
    const height=Math.max(9,Math.max(description.length*4.4,unit.length*4.1)+4)+(pending?5:0),newGroup=group!==nextGroup
    if(p.y+height+(newGroup?groupHeight:0)>269){p.next('Your quotation - continued');header();group=''}
    if(group!==nextGroup){p.rect(16,p.y,178,groupHeight,c.pale);groupLines.forEach((v,i)=>p.text(v,19,p.y+5.5+i*4.5,2.7,true,c.green));p.y+=groupHeight;group=nextGroup}
    if(rowIndex++%2)p.rect(16,p.y,178,height,rgb(.98,.985,.97))
    description.forEach((v,i)=>p.text(v,19,p.y+5.8+i*4.4,2.8))
    p.fittedText(line.pending?'Pending':String(line.qty),111,p.y+5.8,13,2.7)
    unit.forEach((v,i)=>p.text(v,126,p.y+5.8+i*4.1,2.5))
    p.fittedText(line.rate===null?'Missing':quoteRate(line.rate),163,p.y+5.8,17,2.7,false,c.ink,true)
    p.fittedText(line.cents===null?'Pending':quoteMoney(line.cents),191,p.y+5.8,25,2.8,true,c.ink,true)
    if(pending)p.text(line.pending?'Quantity / description needs confirmation':'Unit rate required',19,p.y+height-3,2.3,false,c.muted)
    p.y+=height
  }
  p.ensure(45);p.y+=7
  for(const [i,row] of quotationSummary(estimate).entries()){
    const last=i===4;if(last)p.rect(16,p.y-3,178,10,c.green)
    p.text(row.label,19,p.y+2,2.9,last,last?c.white:c.ink)
    p.fittedText(row.cents===null?'Pending':quoteMoney(row.cents),191,p.y+2,43,3.1,true,last?c.white:c.green,true);p.y+=last?13:6
  }
  p.paragraph(`${estimate.priced} of ${estimate.lines.length} item rates entered.${estimate.pending?' Some quantities or item descriptions still require confirmation.':''}`,2.5,false,c.muted)
  if(q.scope?.trim()){p.heading('Project scope');p.paragraph(q.scope)}
  p.paragraph(q.fulfilment==='collection'?'Collection from BetterDeck. No delivery charge.':`Delivery: ${quoteMoney(estimate.deliveryCents)} excluding VAT. Confirm arrangements before ordering.`,2.8)
  if(q.inclusions?.trim()){p.heading('Included');p.paragraph(q.inclusions)}
  if(q.exclusions?.trim()){p.heading('Excluded');p.paragraph(q.exclusions)}
  p.paragraph(QUOTATION_EXCLUSIONS,2.4,false,c.muted)
  for(const section of estimate.sections)if(section.settings.joistSpacing>400)p.paragraph(`${section.name}: entered joist centres ${section.settings.joistSpacing} mm exceed the report's 400 mm limit. Board supplier approval required.`,2.6)
  if(q.terms?.trim()){p.heading('Payment & quotation terms');p.paragraph(q.terms)}
  if(q.notes?.trim()){p.heading('Quotation notes');p.paragraph(q.notes,2.8)}
  p.heading('Next steps')
  p.paragraph(q.acceptance?.trim()||`To accept or request changes, contact BetterDeck at info@betterdeck.ie or +353 49 437-2667, quoting ${reference}. Confirm quantities with your installer before placing an order.`,2.8)
  const url=installationLink(q.installationUrl)
  if(url){
    const qr=qrcode(0,'M');qr.addData(url);qr.make();const count=qr.getModuleCount(),quiet=4,size=30,module=size/(count+quiet*2)
    p.ensure(40);p.y+=3;p.rect(16,p.y,size,size,c.white)
    for(let row=0;row<count;row++)for(let col=0;col<count;col++)if(qr.isDark(row,col))p.rect(16+(col+quiet)*module,p.y+(row+quiet)*module,module,module,c.ink)
    p.link('Open installation guide',url,52,p.y+10,110,10)
    p.text('Scan the QR code or click the link.',52,p.y+17,2.6,false,c.muted);p.y+=36
  }
  if(!options.omitFooter)p.footer()
  return doc.save()
}
