import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { PDFPage } from 'pdf-lib'
import type { Plan, Settings } from './planner.ts'
import { bounds } from './planner.ts'
import { pdfBrand } from './pdfBrand.ts'
import { exportQuotationPdf } from './quotationPdf.ts'
import { exportInstallerPdf } from './installerPdf.ts'
import { installerPlan } from './installerPlan.ts'
import { quotationEstimate, quotationSummary, QUOTATION_EXCLUSIONS } from './quotationEstimate.ts'

const MM=72/25.4,green=rgb(.38,.42,.17),muted=rgb(.43,.47,.38),ink=rgb(.19,.23,.16)
const safe=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[–—]/g,'-').replace(/[‘’]/g,"'").replace(/[^\x20-\x7e\n€®²×°±·]/g,' ')
export async function exportCustomerQuotePack(plan:Plan,s:Settings,prices:Record<string,string>,options:{now?:Date;logo?:Uint8Array;preview?:Uint8Array;planPreview?:Uint8Array;includeInstaller?:boolean}={}){
  const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold),brand=await pdfBrand(doc,options.logo),now=options.now??new Date(),q=s.quotation??{},reference=q.projectReference?.trim()||installerPlan(plan,s).reference
  const date=new Intl.DateTimeFormat('en-IE',{dateStyle:'medium',timeZone:'Europe/Dublin'}).format(now),estimate=quotationEstimate(plan,s,prices)
  doc.setTitle(`BetterDeck® customer quotation · ${reference}`);doc.setAuthor('BetterDeck');doc.setCreator('BetterPlan');doc.setCreationDate(now);doc.setModificationDate(now)
  const text=(p:PDFPage,value:string,x:number,y:number,size=3,strong=false,color=ink)=>p.drawText(safe(value),{x:x*MM,y:p.getHeight()-y*MM,size:size*MM,font:strong?bold:font,color})
  const wrap=(value:string,width=180,size=3)=>{const result:string[]=[];for(const raw of safe(value).split('\n')){let line='';for(const char of raw){if(line&&font.widthOfTextAtSize(line+char,size*MM)>width*MM){const space=line.lastIndexOf(' ');if(space>line.length*.5){result.push(line.slice(0,space));line=line.slice(space+1)+char}else{result.push(line);line=char}}else line+=char}result.push(line)}return result}
  let page:PDFPage,y=0
  const next=(title:string)=>{page=doc.addPage([210*MM,297*MM]);brand(page);text(page,title,64,25,4.5,true,green);text(page,reference,14,40,2.8);text(page,date,153,40,2.8);y=53}
  const paragraph=(value:string,size=3)=>{for(const line of wrap(value,180,size)){if(y>274)next('Project details - continued');text(page!,line,14,y,size);y+=size*1.6}y+=4}
  next('Customer quotation')
  for(const [label,value] of ([['Prepared for',q.customerName],['Customer address',q.customerAddress],['Eircode',q.customerEircode],['Site address',q.siteAddress]] as const))if(value?.trim()){if(y+15>274)next('Customer details - continued');text(page!,label,14,y,2.8,true,green);y+=6;paragraph(value)}
  paragraph(`${Math.round(bounds(plan.physical).width*1000)} × ${Math.round(bounds(plan.physical).depth*1000)} mm overall · ${plan.area.toFixed(2)} m² · ${s.board.colourName}`)
  for(const row of quotationSummary(estimate))paragraph(`${row.label}: ${row.cents===null?'Pending':`€${(row.cents/100).toFixed(2)}`}`,3.2)
  if(options.preview){if(y+105>276)next('Your deck design');const image=await doc.embedPng(options.preview);page!.drawImage(image,{x:14*MM,y:page!.getHeight()-(y+101)*MM,width:182*MM,height:101*MM});y+=107}
  if(q.notes?.trim()){if(y+15>276)next('Project notes');text(page!,'Quotation notes',14,y,3,true,green);y+=7;paragraph(q.notes)}
  paragraph(QUOTATION_EXCLUSIONS,2.6)
  const quotation=await PDFDocument.load(await exportQuotationPdf(plan,s,prices,{logo:options.logo,now}))
  for(const p of await doc.copyPages(quotation,quotation.getPageIndices()))doc.addPage(p)
  next('Deck layout plan')
  paragraph('All dimensions in mm. Layout illustration: use the labelled dimensions and verify on site; this page is not a fixed-scale installation drawing.',2.8)
  if(options.planPreview){const image=await doc.embedPng(options.planPreview);page!.drawImage(image,{x:14*MM,y:page!.getHeight()-224*MM,width:182*MM,height:126.4*MM})}
  else{const b=bounds(plan.physical),scale=Math.min(170/b.width,145/b.depth);for(let i=0;i<plan.physical.length;i++){const a=plan.physical[i],b=plan.physical[(i+1)%plan.physical.length];page!.drawLine({start:{x:(20+a.x*scale)*MM,y:page!.getHeight()-(85+a.y*scale)*MM},end:{x:(20+b.x*scale)*MM,y:page!.getHeight()-(85+b.y*scale)*MM},color:green,thickness:MM*.4});text(page!,`${Math.round(Math.hypot(b.x-a.x,b.y-a.y)*1000)} mm`,20+(a.x+b.x)/2*scale,83+(a.y+b.y)/2*scale,2.6)}}
  y=241;paragraph(`${Math.round(bounds(plan.physical).width*1000)} × ${Math.round(bounds(plan.physical).depth*1000)} mm overall · ${s.board.stock} m stock · ${s.board.width} × ${s.board.thickness} mm boards.`,2.8)
  paragraph(plan.frame.geometryPass?'Support geometry checks pass. Pedestal capacities, connections and site conditions still require confirmation.':'Support layout unresolved. Frame, pedestal and joiner quantities remain pending.',2.8)
  if(options.includeInstaller){if(!plan.frame.geometryPass)throw new Error('Resolve support geometry before adding installer schedules.');const installer=await PDFDocument.load(await exportInstallerPdf(plan,s,{logo:options.logo,now,includeReferences:false}));for(const p of await doc.copyPages(installer,installer.getPageIndices()))doc.addPage(p)}
  const pages=doc.getPages();pages.forEach((p,i)=>{const w=p.getWidth()/MM,h=p.getHeight()/MM;p.drawRectangle({x:0,y:0,width:p.getWidth(),height:10*MM,color:rgb(1,1,1)});text(p,`BetterDeck® · ${reference}`,14,h-5,2.3,false,muted);text(p,`${i+1} / ${pages.length}`,w-27,h-5,2.3,false,muted)})
  return doc.save()
}
