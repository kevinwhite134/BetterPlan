import { PDFDocument } from 'pdf-lib'
import type { Plan, Settings } from './planner.ts'
import { bounds } from './planner.ts'
import { exportQuotationPdf } from './quotationPdf.ts'
import { exportInstallerPdf } from './installerPdf.ts'
import { installerPlan } from './installerPlan.ts'
import { quotationEstimate } from './quotationEstimate.ts'
import { quotationNotes } from './quotationNotes.ts'
import { sectionSpecification } from './quotationSections.ts'
import { MM, QUOTE_COLOURS as c, quotationDocument, quoteMoney, quoteReference } from './quotationDocument.ts'

export type CustomerQuotePackOptions={now?:Date;logo?:Uint8Array;preview?:Uint8Array;planPreview?:Uint8Array;includeInstaller?:boolean;sectionPreviews?:{id:string;preview?:Uint8Array;planPreview?:Uint8Array}[]}
export async function exportCustomerQuotePack(plan:Plan,s:Settings,prices:Record<string,string>,options:CustomerQuotePackOptions={}){
  const doc=await PDFDocument.create(),now=options.now??new Date(),q=s.quotation??{},reference=quoteReference(q,installerPlan(plan,s).reference),estimate=quotationEstimate(plan,s,prices)
  doc.setTitle(`BetterDeck® customer quotation · ${reference}`);doc.setAuthor('BetterDeck');doc.setCreator('BetterPlan');doc.setCreationDate(now);doc.setModificationDate(now)
  const p=await quotationDocument(doc,reference,q,now,options.logo)
  p.next('')
  p.editorial('Your outdoor space,',16,56,10)
  p.editorial('beautifully planned.',16,68,10,true,c.accent)
  p.y=80
  if(q.customerName?.trim())p.paragraph(`Prepared for ${q.customerName}`,3.2,false,c.muted)
  if(options.preview){await p.image(options.preview,96);p.paragraph('Design illustration · Colours indicative · Extras itemised separately',2.1,false,c.muted)}
  else p.paragraph('See the dimensioned design on the layout pages.',2.8,false,c.muted)
  p.paragraph(`${estimate.sections[0].name}${estimate.sections.length>1?` · ${estimate.sections.length} deck sections in this proposal`:''}`,3.2,true,c.green)
  const b=bounds(plan.physical)
  p.facts([{label:'Deck area',value:`${estimate.sections.reduce((sum,s)=>sum+s.plan.area,0).toFixed(2)} m²`},{label:'Main deck',value:`${Math.round(b.width*1000)} × ${Math.round(b.depth*1000)} mm`},{label:'Finish',value:s.board.colourName}])
  p.ensure(28);p.rule(p.y,16,178,c.accent,.7)
  p.text(estimate.totalCents===null?'QUOTATION IN PROGRESS':'YOUR PROJECT TOTAL',16,p.y+9,2.5,true,c.green)
  p.text(estimate.totalCents===null?'Complete pricing to confirm your total':`Including VAT · ${q.fulfilment==='collection'?'For collection':'Entered delivery included'}`,16,p.y+16,2.3,false,c.muted)
  p.fittedText(estimate.totalCents===null?'Pending':quoteMoney(estimate.totalCents),194,p.y+15,82,7.5,false,c.green,true)
  p.y+=26
  const quotation=await PDFDocument.load(await exportQuotationPdf(plan,s,prices,{logo:options.logo,now,omitFooter:true,omitProjectNotes:true}))
  for(const page of await doc.copyPages(quotation,quotation.getPageIndices()))doc.addPage(page)
  for(const section of estimate.sections){
    const preview=options.sectionPreviews?.find(i=>i.id===section.id)
    p.next(section.name)
    p.paragraph('YOUR DECK / DIMENSIONED LAYOUT',2.2,true,c.muted)
    if(section.id!=='current'){
      if(preview?.preview)await p.image(preview.preview,55)
      for(const line of sectionSpecification(section))p.paragraph(line,2.7)
    }
    p.paragraph('Dimensions in mm. Use labelled dimensions and verify on site. This illustration is not a fixed-scale installation drawing.',2.7,false,c.muted)
    const layout=preview?.planPreview??(section.id==='current'?options.planPreview:undefined)
    if(layout)await p.image(layout,section.id==='current'?100:85,false)
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
    if(section.id==='current'){const specs=sectionSpecification(section);p.paragraph(specs[0],2.7,true);p.paragraph(specs.slice(1).join(' · '),2.6)}
    p.paragraph(section.plan.frame.geometryPass?'Support geometry checks pass. Confirm pedestal capacities, connections and site conditions.':'Support layout unresolved. Frame, pedestal and connector quantities remain pending.',2.7,false,c.muted)
  }
  quotationNotes(p,q,estimate,reference)
  if(options.includeInstaller){
    for(const section of estimate.sections){
      if(!section.plan.frame.geometryPass)throw new Error('Resolve support geometry before adding installer schedules.')
      const installer=await PDFDocument.load(await exportInstallerPdf(section.plan,section.settings,{logo:options.logo,now,includeReferences:false}))
      for(const page of await doc.copyPages(installer,installer.getPageIndices()))doc.addPage(page)
    }
  }
  p.footer();return doc.save()
}
