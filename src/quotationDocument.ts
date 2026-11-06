import { PDFDocument, PDFName, PDFString, StandardFonts, rgb } from 'pdf-lib'
import type { PDFPage } from 'pdf-lib'
import { pdfBrand } from './pdfBrand.ts'
import type { QuotationDetails } from './quotationDetails.ts'

export const MM=72/25.4
export const QUOTE_COLOURS={green:rgb(.16,.26,.21),ink:rgb(.20,.27,.21),muted:rgb(.46,.51,.42),pale:rgb(.965,.969,.945),line:rgb(.86,.89,.83),white:rgb(1,1,1),accent:rgb(.46,.53,.34)}
export const quoteMoney=(cents:number)=>new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR'}).format(cents/100)
export const quoteRate=(value:number)=>new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR',maximumFractionDigits:4}).format(value)
export const quoteSafe=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[–—]/g,'-').replace(/[‘’]/g,"'").replace(/[^\x20-\x7e\n€®²×°±·]/g,' ')
export const quoteDate=(date:Date)=>new Intl.DateTimeFormat('en-IE',{dateStyle:'medium',timeZone:'Europe/Dublin'}).format(date)
export function quoteReference(q:QuotationDetails,fallback:string){return q.quotationNumber?.trim()||q.projectReference?.trim()||fallback}

export async function quotationDocument(doc:PDFDocument,reference:string,q:QuotationDetails,now:Date,logo?:Uint8Array){
  const font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold),serif=await doc.embedFont(StandardFonts.TimesRoman),italic=await doc.embedFont(StandardFonts.TimesRomanItalic)
  const brand=await pdfBrand(doc,logo,{height:19,left:16,top:11}),c=QUOTE_COLOURS
  let page:PDFPage,y=0,title=''
  const text=(value:string,x:number,top:number,size=3,strong=false,colour=c.ink,right=false)=>{
    const clean=quoteSafe(value).replaceAll('\n',' '),face=strong?bold:font,width=face.widthOfTextAtSize(clean,size*MM)/MM
    page.drawText(clean,{x:(right?x-width:x)*MM,y:page.getHeight()-top*MM,size:size*MM,font:face,color:colour})
  }
  const editorial=(value:string,x:number,top:number,size=8,slanted=false,colour=c.green)=>page.drawText(quoteSafe(value),{x:x*MM,y:page.getHeight()-top*MM,size:size*MM,font:slanted?italic:serif,color:colour})
  const rect=(x:number,top:number,width:number,height:number,colour=c.pale)=>page.drawRectangle({x:x*MM,y:page.getHeight()-(top+height)*MM,width:width*MM,height:height*MM,color:colour})
  const rule=(top:number,x=16,width=178,colour=c.line,thickness=.2)=>page.drawLine({start:{x:x*MM,y:page.getHeight()-top*MM},end:{x:(x+width)*MM,y:page.getHeight()-top*MM},color:colour,thickness:thickness*MM})
  const fittedText=(value:string,x:number,top:number,width:number,size=3,strong=false,colour=c.ink,right=false)=>{
    const face=strong?bold:font,measured=face.widthOfTextAtSize(quoteSafe(value),size*MM)/MM
    text(value,x,top,Math.min(size,size*width/Math.max(measured,.01)),strong,colour,right)
  }
  const wrap=(value:string,width=178,size=3,strong=false)=>{
    const result:string[]=[],face=strong?bold:font
    for(const raw of quoteSafe(value).split('\n')){
      let line=''
      for(const char of raw){if(line&&face.widthOfTextAtSize(line+char,size*MM)>width*MM){const space=line.lastIndexOf(' ');if(space>line.length*.45){result.push(line.slice(0,space));line=line.slice(space+1)+char}else{result.push(line);line=char}}else line+=char}
      result.push(line)
    }
    return result
  }
  const next=(heading:string)=>{
    title=heading;page=doc.addPage([210*MM,297*MM]);brand(page)
    text('B E T T E R D E C K   /   Q U O T A T I O N',194,15,1.9,false,c.muted,true)
    for(const [i,line] of wrap(reference,77,2.8).entries())text(line,194,22+i*4,2.8,true,c.green,true)
    text(`${quoteDate(now)}${q.revision?.trim()?` · Revision ${q.revision.trim()}`:''}`,194,34,2.3,false,c.muted,true)
    rule(39)
    // Page titles wrap at the serif font's actual width, including long section names.
    const lines:string[]=[];let line=''
    for(const char of quoteSafe(heading)){if(line&&serif.widthOfTextAtSize(line+char,8*MM)>178*MM){const space=line.lastIndexOf(' ');lines.push(space>0?line.slice(0,space):line);line=(space>0?line.slice(space+1):'')+char}else line+=char}lines.push(line)
    lines.forEach((v,i)=>editorial(v,16,55+i*9,8));y=65+(lines.length-1)*9
  }
  const ensure=(height:number)=>{if(y+height>273)next(`${title.replace(/ - continued$/,'')} - continued`)}
  const paragraph=(value:string,size=3,strong=false,colour=c.ink)=>{
    for(const line of wrap(value,178,size,strong)){ensure(size*1.6);text(line,16,y,size,strong,colour);y+=size*1.6}y+=3
  }
  const heading=(value:string)=>{ensure(17);y+=4;paragraph(value,3.6,true,c.green)}
  const image=async(bytes:Uint8Array,height:number,background=true)=>{
    ensure(height+8);const img=await doc.embedPng(bytes),scale=Math.min(178/img.width,height/img.height),w=img.width*scale,h=img.height*scale
    if(background)rect(16,y-2,178,height+4)
    page.drawImage(img,{x:(16+(178-w)/2)*MM,y:page.getHeight()-(y+(height-h)/2+h)*MM,width:w*MM,height:h*MM});y+=height+8
  }
  const facts=(items:{label:string;value:string}[])=>{
    const gap=6,width=(178-gap*(items.length-1))/items.length
    const rows=items.map(item=>wrap(item.value,width-1,3,true)),height=Math.max(...rows.map(r=>r.length))*4.8+17
    ensure(height);rule(y);items.forEach((item,i)=>{const x=16+i*(width+gap);text(item.label.toUpperCase(),x,y+7,2,false,c.muted);rows[i].forEach((line,j)=>text(line,x,y+14+j*4.8,3,true,c.green))});y+=height;rule(y);y+=7
  }
  const link=(label:string,url:string,x:number,top:number,width:number,height:number)=>{
    text(label,x,top,3,true,c.green)
    page.node.addAnnot(doc.context.register(doc.context.obj({Type:'Annot',Subtype:'Link',Rect:[x*MM,page.getHeight()-(top+height)*MM,(x+width)*MM,page.getHeight()-(top-4)*MM],Border:[0,0,0],A:{Type:'Action',S:PDFName.of('URI'),URI:PDFString.of(url)}})))
  }
  const footer=()=>{
    const count=doc.getPageCount()
    doc.getPages().forEach((p,i)=>{
      page=p;const width=p.getWidth()/MM,height=p.getHeight()/MM
      rect(0,height-19,width,19,c.white);rule(height-18,16,width-32)
      text('BetterDeck®',16,height-12,2.4,true,c.green)
      text('+353 49 437-2667 · info@betterdeck.ie',width/2,height-12,2.2,false,c.muted)
      text('The Links Business Park, Golf Links Road, Cavan, Co. Cavan H12 CT98',16,height-6,1.9,false,c.muted)
      text(`${String(i+1).padStart(2,'0')} / ${String(count).padStart(2,'0')}`,width-16,height-6,2.2,false,c.muted,true)
    })
  }
  return {text,editorial,fittedText,rect,rule,facts,wrap,next,ensure,paragraph,heading,image,link,footer,get page(){return page},get y(){return y},set y(value:number){y=value}}
}
