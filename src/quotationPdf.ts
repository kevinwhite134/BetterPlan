import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { PDFPage } from 'pdf-lib'
import type { Plan, Settings } from './planner.ts'
import { bounds } from './planner.ts'
import { installerPlan } from './installerPlan.ts'
import { quotationEstimate, quotationSummary, QUOTATION_EXCLUSIONS } from './quotationEstimate.ts'
import { appendCalculationReport, calculationReferenceSelection, loadSpanReport } from './installerReferences.ts'
import { pdfBrand } from './pdfBrand.ts'

const MM=72/25.4,green=rgb(.38,.42,.17),ink=rgb(.19,.23,.16),muted=rgb(.43,.47,.38)
const printable=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[–—]/g,'-').replace(/[’]/g,"'").replace(/[^\x20-\x7e\n€®²×°±·]/g,' ')
export type QuotationPdfOptions={now?:Date;logo?:Uint8Array;preview?:Uint8Array;spanReport?:Uint8Array;includeReferences?:boolean}
export async function exportQuotationPdf(plan:Plan,s:Settings,prices:Record<string,string>,options:QuotationPdfOptions={}){
  const report=options.includeReferences===false?undefined:options.spanReport??(typeof window!=='undefined'?await loadSpanReport():undefined)
  const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold),brand=await pdfBrand(doc,options.logo)
  const preview=options.preview?await doc.embedPng(options.preview):undefined,now=options.now??new Date(),estimate=quotationEstimate(plan,s,prices),q=s.quotation??{},reference=q.projectReference?.trim()||installerPlan(plan,s).reference
  const date=new Intl.DateTimeFormat('en-IE',{dateStyle:'medium',timeZone:'Europe/Dublin'}).format(now),money=(cents:number)=>`€${(cents/100).toFixed(2)}`
  doc.setTitle(`BetterDeck® materials quotation ${reference}`);doc.setAuthor('BetterDeck');doc.setCreator('BetterPlan');doc.setCreationDate(now);doc.setModificationDate(now)
  const text=(page:PDFPage,value:string,x:number,y:number,size=3,strong=false,color=ink)=>page.drawText(printable(value).replaceAll('\n',' '),{x:x*MM,y:page.getHeight()-y*MM,size:size*MM,font:strong?bold:font,color})
  const wrap=(value:string,width:number,size=3)=>{
    const lines:string[]=[]
    for(const raw of printable(value).split('\n')){
      let line=''
      for(const char of raw){if(line&&font.widthOfTextAtSize(line+char,size*MM)>width*MM){const space=line.lastIndexOf(' ');if(space>line.length*.5){lines.push(line.slice(0,space));line=line.slice(space+1)+char}else{lines.push(line);line=char}}else line+=char}
      lines.push(line)
    }
    return lines
  }
  const columns=[14,101,119,140,164],headers=['Component','Qty','Unit','Unit rate','Amount']
  let page:PDFPage,y=0
  const tableHeader=()=>{
    page.drawRectangle({x:14*MM,y:page.getHeight()-(y+9)*MM,width:182*MM,height:9*MM,color:green})
    headers.forEach((h,i)=>text(page,h,columns[i]+2,y+6,2.8,true,rgb(1,1,1)));y+=9
  }
  const next=(table=false)=>{
    page=doc.addPage([210*MM,297*MM]);brand(page);text(page,'Materials quotation',64,25,5,true,green)
    text(page,reference,14,40,2.8);text(page,date,154,40,2.8)
    page.drawLine({start:{x:14*MM,y:page.getHeight()-44*MM},end:{x:196*MM,y:page.getHeight()-44*MM},color:green,thickness:.5*MM})
    y=53;if(table)tableHeader()
  }
  const paragraph=(value:string,size=3,strong=false)=>{
    for(const line of wrap(value,180,size)){if(y>270)next();text(page!,line,14,y,size,strong);y+=size*1.6}y+=3
  }
  next()
  for(const [label,value] of ([['Prepared for',q.customerName],['Customer address',q.customerAddress],['Eircode',q.customerEircode],['Site address',q.siteAddress]] as const))if(value?.trim())paragraph(`${label}: ${value}`)
  const box=bounds(plan.physical)
  paragraph(`${Math.round(box.width*1000)} × ${Math.round(box.depth*1000)} mm overall · ${plan.area.toFixed(2)} m²`,3.2,true)
  paragraph(`${s.board.colourName} · ${s.board.stock} m decking stock · Provisional quotation`,2.8)
  if(preview){if(y+64>260)next();page!.drawImage(preview,{x:50*MM,y:page!.getHeight()-(y+61.1)*MM,width:110*MM,height:61.1*MM});y+=66}
  if(y+22>260)next()
  tableHeader()
  for(const [i,line] of estimate.lines.entries()){
    const lines=wrap(line.name,82),height=Math.max(12,lines.length*4.5+8)
    if(y+height>265)next(true)
    if(i%2)page!.drawRectangle({x:14*MM,y:page!.getHeight()-(y+height)*MM,width:182*MM,height:height*MM,color:rgb(.96,.97,.92)})
    lines.forEach((v,j)=>text(page!,v,16,y+5+j*4.5,3))
    text(page!,line.pending?'Pending':String(line.qty),103,y+5,2.8);text(page!,line.unit,121,y+5,2.7)
    text(page!,line.rate===null?'Missing':`€${line.rate.toFixed(2)}`,142,y+5,2.8);text(page!,line.cents===null?'Pending':money(line.cents),166,y+5,2.8,true)
    if(line.pending||line.rate===null)text(page!,line.pending?'Support quantity pending':'Unit rate missing',16,y+height-3,2.3,false,muted)
    y+=height
  }
  if(y+57>270)next()
  y+=8
  for(const row of quotationSummary(estimate)){text(page!,row.label,16,y,3.1,true,green);text(page!,row.cents===null?'Pending':money(row.cents),163,y,3.3,true,green);y+=8}
  y+=3
  for(const note of [`${estimate.priced} of ${estimate.lines.length} rates entered.${estimate.pending?' Support and connector quantities are pending.':''}`,QUOTATION_EXCLUSIONS,...(s.joistSpacing>400?[`Entered joist centres: ${s.joistSpacing} mm; exceeds the report's 400 mm limit. Board supplier approval required.`]:[])])paragraph(note,2.6)
  if(q.notes?.trim())paragraph(`Quotation notes: ${q.notes}`,2.8)
  if(report)paragraph(`Attached engineer extract: BetterDeck Aluminium Profiles Design, 1513-1 revision 2, case ${plan.frame.rule.sheet}, ${s.load} kN/m², K Series composite decking. Original PDF pages ${calculationReferenceSelection(s).join(', ')}. These calculations do not approve custom connections or site conditions.`,2.6)
  const pages=doc.getPages(),count=pages.length+(report?3:0)
  pages.forEach((p,i)=>{text(p,`BetterDeck® · ${reference}`,14,289,2.3,false,muted);text(p,`${i+1} / ${count}`,183,289,2.3,false,muted)})
  if(report)await appendCalculationReport(doc,s,report)
  return doc.save()
}
