import { PDFDocument } from 'pdf-lib'
import type { Plan, Settings } from './planner.ts'
import { bounds } from './planner.ts'
import { exportQuotationPdf } from './quotationPdf.ts'
import { exportInstallerPdf } from './installerPdf.ts'
import { installerPlan } from './installerPlan.ts'
import { quotationEstimate } from './quotationEstimate.ts'
import { sectionSpecification } from './quotationSections.ts'
import { MM, QUOTE_COLOURS as c, quotationDocument, quoteMoney, quoteReference } from './quotationDocument.ts'

export type CustomerQuotePackOptions={now?:Date;logo?:Uint8Array;preview?:Uint8Array;planPreview?:Uint8Array;includeInstaller?:boolean;sectionPreviews?:{id:string;preview?:Uint8Array;planPreview?:Uint8Array}[]}
export async function exportCustomerQuotePack(plan:Plan,s:Settings,prices:Record<string,string>,options:CustomerQuotePackOptions={}){
  const doc=await PDFDocument.create(),now=options.now??new Date(),q=s.quotation??{},reference=quoteReference(q,installerPlan(plan,s).reference),estimate=quotationEstimate(plan,s,prices)
  doc.setTitle(`BetterDeck® customer quotation · ${reference}`);doc.setAuthor('BetterDeck');doc.setCreator('BetterPlan');doc.setCreationDate(now);doc.setModificationDate(now)
  const p=await quotationDocument(doc,reference,q,now,options.logo)
  p.next('Your deck, beautifully planned')
  if(q.customerName?.trim())p.paragraph(`Prepared for ${q.customerName}`,3.5,true)
  if(q.customerAddress?.trim())p.paragraph(q.customerAddress,2.7)
  if(q.customerEircode?.trim())p.paragraph(q.customerEircode,2.7)
  if(q.siteAddress?.trim())p.paragraph(`Site: ${q.siteAddress}`,2.7)
  if(options.preview){await p.image(options.preview,86);p.paragraph('Design illustration · Colours indicative · Priced extras are not shown in this model.',2.3,false,c.muted)}
  else p.paragraph('See the dimensioned design on the layout pages.',2.8,false,c.muted)
  p.paragraph(`${estimate.sections[0].name}${estimate.sections.length>1?` · ${estimate.sections.length} deck sections included in this quotation`:''}`,3.5,true,c.green)
  for(const line of sectionSpecification(estimate.sections[0]))p.paragraph(line,2.7)
  p.ensure(33);p.rect(16,p.y,178,29,c.green)
  p.text(estimate.totalCents===null?'QUOTATION INCOMPLETE':'TOTAL INCLUDING VAT',21,p.y+8,2.7,true,c.white)
  p.text(estimate.totalCents===null?'Pending':quoteMoney(estimate.totalCents),21,p.y+22,7,true,c.white)
  p.y+=36
  p.paragraph(estimate.totalCents===null?'Complete item rates, quantities and VAT to confirm the total.':`${q.fulfilment==='collection'?'For collection':'Includes entered delivery'} · VAT ${estimate.vatRate}% · Provisional quotation`,2.5,false,c.muted)
  const quotation=await PDFDocument.load(await exportQuotationPdf(plan,s,prices,{logo:options.logo,now,omitFooter:true}))
  for(const page of await doc.copyPages(quotation,quotation.getPageIndices()))doc.addPage(page)
  for(const section of estimate.sections){
    const preview=options.sectionPreviews?.find(i=>i.id===section.id)
    p.next(`Deck layout · ${section.name}`)
    if(section.id!=='current'){
      if(preview?.preview)await p.image(preview.preview,55)
      for(const line of sectionSpecification(section))p.paragraph(line,2.7)
    }
    p.paragraph('Dimensions in mm. Use labelled dimensions and verify on site. This illustration is not a fixed-scale installation drawing.',2.7,false,c.muted)
    const layout=preview?.planPreview??(section.id==='current'?options.planPreview:undefined)
    if(layout)await p.image(layout,section.id==='current'?137:85)
    else{
      const b=bounds(section.plan.physical),minX=Math.min(...section.plan.physical.map(a=>a.x)),minY=Math.min(...section.plan.physical.map(a=>a.y)),height=100,scale=Math.min(150/b.width,75/b.depth)
      p.ensure(height+5)
      for(let i=0;i<section.plan.physical.length;i++){
        const a=section.plan.physical[i],b=section.plan.physical[(i+1)%section.plan.physical.length],x=(v:number)=>26+(v-minX)*scale,y=(v:number)=>p.y+10+(v-minY)*scale
        p.page.drawLine({start:{x:x(a.x)*MM,y:p.page.getHeight()-y(a.y)*MM},end:{x:x(b.x)*MM,y:p.page.getHeight()-y(b.y)*MM},color:c.green,thickness:.4*MM})
        p.text(`E${i+1}: ${Math.round(Math.hypot(b.x-a.x,b.y-a.y)*1000)} mm`,x((a.x+b.x)/2),y((a.y+b.y)/2)-2,2.3)
      }
      p.y+=height
    }
    if(section.id==='current')for(const line of sectionSpecification(section))p.paragraph(line,2.7)
    p.paragraph(section.plan.frame.geometryPass?'Support geometry checks pass. Confirm pedestal capacities, connections and site conditions.':'Support layout unresolved. Frame, pedestal and connector quantities remain pending.',2.7,false,c.muted)
  }
  if(options.includeInstaller){
    for(const section of estimate.sections){
      if(!section.plan.frame.geometryPass)throw new Error('Resolve support geometry before adding installer schedules.')
      const installer=await PDFDocument.load(await exportInstallerPdf(section.plan,section.settings,{logo:options.logo,now,includeReferences:false}))
      for(const page of await doc.copyPages(installer,installer.getPageIndices()))doc.addPage(page)
    }
  }
  p.footer();return doc.save()
}
