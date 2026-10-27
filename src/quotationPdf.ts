import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { PDFPage } from 'pdf-lib'
import type { Plan, Settings } from './planner.ts'
import { installerPlan } from './installerPlan.ts'
import { materialEstimate } from './materialEstimate.ts'
import { pdfBrand } from './pdfBrand.ts'

const MM=72/25.4,green=rgb(.38,.42,.17),ink=rgb(.19,.23,.16),muted=rgb(.43,.47,.38)
const printable=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[–—]/g,'-').replace(/[‘’]/g,"'").replace(/[^\x20-\x7e€®²×°±·]/g,' ')
export async function exportQuotationPdf(plan:Plan,s:Settings,prices:Record<string,string>,options:{now?:Date;logo?:Uint8Array;preview?:Uint8Array}={}){
  const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold),brand=await pdfBrand(doc,options.logo)
  const preview=options.preview?await doc.embedPng(options.preview):undefined,now=options.now??new Date(),estimate=materialEstimate(plan,prices),reference=s.quotation?.projectReference?.trim()||installerPlan(plan,s).reference
  const date=new Intl.DateTimeFormat('en-IE',{dateStyle:'medium',timeZone:'Europe/Dublin'}).format(now),money=(n:number)=>`€${n.toFixed(2)}`
  doc.setTitle(`BetterDeck® materials quotation ${reference}`);doc.setAuthor('BetterDeck');doc.setCreator('BetterPlan');doc.setCreationDate(now);doc.setModificationDate(now)
  const text=(page:PDFPage,value:string,x:number,y:number,size=3,strong=false,color=ink)=>page.drawText(printable(value),{x:x*MM,y:page.getHeight()-y*MM,size:size*MM,font:strong?bold:font,color})
  const wrap=(value:string,width:number,size=3)=>{const lines:string[]=[];let line='';for(const word of printable(value).split(/\s+/)){const next=line?`${line} ${word}`:word;if(line&&font.widthOfTextAtSize(next,size*MM)>width*MM){lines.push(line);line=word}else line=next}if(line)lines.push(line);return lines}
  const columns=[14,101,119,140,164,187],headers=['Component','Qty','Unit','Unit rate','Amount']
  let page:PDFPage,y=0
  const next=(first=false)=>{
    page=doc.addPage([210*MM,297*MM]);brand(page);text(page,'Materials quotation',64,25,5,true,green);text(page,reference,14,40,2.8);text(page,date,154,40,2.8)
    page.drawLine({start:{x:14*MM,y:page.getHeight()-44*MM},end:{x:196*MM,y:page.getHeight()-44*MM},color:green,thickness:.5*MM})
    y=53
    if(first){text(page,`${plan.area.toFixed(2)} m² · ${s.board.colourName} · ${s.board.stock} m decking stock`,14,y,3);y+=7;text(page,'Provisional materials estimate · EUR excluding VAT',14,y,2.7,false,muted);y+=7
      if(preview){page.drawImage(preview,{x:75*MM,y:page.getHeight()-(y+47)*MM,width:110*MM,height:61.1*MM});y+=51}
    }
    page.drawRectangle({x:14*MM,y:page.getHeight()-(y+9)*MM,width:182*MM,height:9*MM,color:green})
    headers.forEach((h,i)=>text(page,h,columns[i]+2,y+6,2.8,true,rgb(1,1,1)));y+=9
  }
  next(true)
  for(const [i,line] of estimate.lines.entries()){
    const lines=wrap(line.name,82),height=Math.max(12,lines.length*4.5+8)
    if(y+height>251)next()
    if(i%2)page!.drawRectangle({x:14*MM,y:page!.getHeight()-(y+height)*MM,width:182*MM,height:height*MM,color:rgb(.96,.97,.92)})
    lines.forEach((v,j)=>text(page!,v,16,y+5+j*4.5,3))
    text(page!,line.pending?'Pending':String(line.qty),103,y+5,2.8);text(page!,line.unit,121,y+5,2.7)
    text(page!,line.rate===null?'Missing':money(line.rate),142,y+5,2.8);text(page!,line.cents===null?'Pending':money(line.cents/100),166,y+5,2.8,true)
    if(line.pending||line.rate===null)text(page!,line.pending?'Support quantity pending':'Unit rate missing',16,y+height-3,2.3,false,muted)
    y+=height
  }
  if(y>229)next()
  y+=11;text(page!,estimate.complete?'Entered materials total':'Known priced subtotal',16,y,3.3,true,green);text(page!,money(estimate.subtotalCents/100),163,y,3.7,true,green);y+=10
  const notes=[`${estimate.priced} of ${estimate.lines.length} rates entered.${estimate.pending?' Support and connector quantities are pending.':''}`,'Includes the listed continuous joiners, paired joist joiners and perpendicular joist joiners. Labour, delivery, VAT and unlisted hardware are excluded.','Verify site measurements, board spans, pedestal capacity and connection details before ordering.',...(s.joistSpacing>400?[`Entered joist centres: ${s.joistSpacing} mm; exceeds the report’s 400 mm limit. Board supplier approval required.`]:[])]
  for(const note of notes)for(const line of wrap(note,180,2.6)){if(y>278){next();y+=5}text(page!,line,16,y,2.6,false,muted);y+=4}
  const pages=doc.getPages();pages.forEach((p,i)=>{text(p,`BetterDeck® · ${reference}`,14,289,2.3,false,muted);text(p,`${i+1} / ${pages.length}`,183,289,2.3,false,muted)})
  return doc.save()
}
