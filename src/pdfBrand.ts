import { StandardFonts, rgb } from 'pdf-lib'
import type { PDFDocument, PDFPage } from 'pdf-lib'
const MM=72/25.4
export async function pdfBrand(doc:PDFDocument,bytes?:Uint8Array,layout?:{height:number;left:number;top:number}){
  const logo=bytes?await (bytes[0]===0xff&&bytes[1]===0xd8?doc.embedJpg(bytes):doc.embedPng(bytes)):undefined
  const regular=await doc.embedFont(StandardFonts.TimesRoman),italic=await doc.embedFont(StandardFonts.TimesRomanItalic)
  return (page:PDFPage)=>{
    if(logo){const height=(layout?.height??26)*MM,width=height*logo.width/logo.height;page.drawImage(logo,{x:(layout?.left??14)*MM,y:page.getHeight()-((layout?.top??5)*MM+height),width,height});return}
    const size=(layout?5.7:6.5)*MM,y=page.getHeight()-(layout?layout.top+layout.height*.7:23)*MM,x=(layout?.left??14)*MM
    page.drawText('Better',{x,y,size,font:regular,color:rgb(.44,.40,.29)})
    const deckX=x+regular.widthOfTextAtSize('Better',size)
    page.drawText('Deck',{x:deckX,y,size,font:italic,color:rgb(.38,.65,.05)})
    page.drawText('®',{x:deckX+italic.widthOfTextAtSize('Deck',size)+MM,y:y+3*MM,size:2.5*MM,font:regular,color:rgb(.44,.40,.29)})
  }
}

export async function loadBetterDeckLogo(){
  const response=await fetch('/betterdeck-logo.jpg')
  if(!response.ok)throw new Error('The BetterDeck logo could not be loaded.')
  return new Uint8Array(await response.arrayBuffer())
}
