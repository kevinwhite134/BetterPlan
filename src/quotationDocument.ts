import { PDFDocument, PDFName, PDFString, StandardFonts, rgb } from 'pdf-lib'
import type { PDFPage } from 'pdf-lib'
import { pdfBrand } from './pdfBrand.ts'
import type { QuotationDetails } from './quotationDetails.ts'

export const MM=72/25.4
export const QUOTE_COLOURS={green:rgb(.32,.39,.20),ink:rgb(.17,.22,.15),muted:rgb(.43,.48,.38),pale:rgb(.95,.97,.91),line:rgb(.83,.87,.77),white:rgb(1,1,1)}
export const quoteMoney=(cents:number)=>new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR'}).format(cents/100)
export const quoteRate=(value:number)=>new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR',maximumFractionDigits:4}).format(value)
export const quoteSafe=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[–—]/g,'-').replace(/[‘’]/g,"'").replace(/[^\x20-\x7e\n€®²×°±·]/g,' ')
export const quoteDate=(date:Date)=>new Intl.DateTimeFormat('en-IE',{dateStyle:'medium',timeZone:'Europe/Dublin'}).format(date)
export function quoteReference(q:QuotationDetails,fallback:string){return q.quotationNumber?.trim()||q.projectReference?.trim()||fallback}

export async function quotationDocument(doc:PDFDocument,reference:string,q:QuotationDetails,now:Date,logo?:Uint8Array){
  const font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold),brand=await pdfBrand(doc,logo),c=QUOTE_COLOURS
  let page:PDFPage,y=0,title=''
  const text=(value:string,x:number,top:number,size=3,strong=false,colour=c.ink,right=false)=>{
    const clean=quoteSafe(value).replaceAll('\n',' '),face=strong?bold:font,width=face.widthOfTextAtSize(clean,size*MM)/MM
    page.drawText(clean,{x:(right?x-width:x)*MM,y:page.getHeight()-top*MM,size:size*MM,font:face,color:colour})
  }
  const rect=(x:number,top:number,width:number,height:number,colour=c.pale)=>page.drawRectangle({x:x*MM,y:page.getHeight()-(top+height)*MM,width:width*MM,height:height*MM,color:colour})
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
    text('CUSTOMER QUOTATION',194,19,2.4,true,c.green,true)
    for(const [i,line] of wrap(reference,73,2.6).entries())text(line,194,25+i*4,2.6,false,c.muted,true)
    text(`${quoteDate(now)}${q.revision?.trim()?` · Rev ${q.revision.trim()}`:''}`,16,40,2.5,false,c.muted)
    for(const [i,line] of wrap(heading,178,6,true).entries())text(line,16,53+i*8,6,true,c.green)
    y=64+Math.max(0,wrap(heading,178,6,true).length-1)*8
  }
  const ensure=(height:number)=>{if(y+height>274)next(`${title.replace(/ - continued$/,'')} - continued`)}
  const paragraph=(value:string,size=3,strong=false,colour=c.ink)=>{
    for(const line of wrap(value,178,size,strong)){ensure(size*1.65);text(line,16,y,size,strong,colour);y+=size*1.65}y+=3
  }
  const heading=(value:string)=>{ensure(17);y+=3;paragraph(value,3.7,true,c.green)}
  const image=async(bytes:Uint8Array,height:number)=>{
    ensure(height+5);const img=await doc.embedPng(bytes),scale=Math.min(178/img.width,height/img.height),w=img.width*scale,h=img.height*scale
    rect(16,y-2,178,height+4);page.drawImage(img,{x:(16+(178-w)/2)*MM,y:page.getHeight()-(y+(height-h)/2+h)*MM,width:w*MM,height:h*MM});y+=height+8
  }
  const link=(label:string,url:string,x:number,top:number,width:number,height:number)=>{
    text(label,x,top,3,true,c.green)
    page.node.addAnnot(doc.context.register(doc.context.obj({Type:'Annot',Subtype:'Link',Rect:[x*MM,page.getHeight()-(top+height)*MM,(x+width)*MM,page.getHeight()-(top-4)*MM],Border:[0,0,0],A:{Type:'Action',S:PDFName.of('URI'),URI:PDFString.of(url)}})))
  }
  const footer=()=>{
    const count=doc.getPageCount()
    doc.getPages().forEach((p,i)=>{
      page=p;const width=p.getWidth()/MM,height=p.getHeight()/MM
      rect(0,height-19,width,19,c.white)
      text('BetterDeck® · +353 49 437-2667 · info@betterdeck.ie',16,height-13,2.3,false,c.muted)
      text('The Links Business Park, Golf Links Road, Cavan, Co. Cavan H12 CT98',16,height-7,2.1,false,c.muted)
      text(`${i+1} / ${count}`,width-16,height-7,2.3,false,c.muted,true)
    })
  }
  return {text,fittedText,rect,wrap,next,ensure,paragraph,heading,image,link,footer,get page(){return page},get y(){return y},set y(value:number){y=value}}
}
