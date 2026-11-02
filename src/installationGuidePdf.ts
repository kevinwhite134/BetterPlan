import { FRAME_COLOURS } from './frameColours.ts'
import { rgb, PDFString } from 'pdf-lib'
import type { PDFDocument, PDFPage, PDFFont } from 'pdf-lib'
import { installationGuide } from './installationGuide.ts'
import type { Plan, Settings } from './planner.ts'
import { dimensionText } from './installerPlan.ts'

const MM=72/25.4
const safe=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[–—]/g,'-').replace(/[·•]/g,' / ').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/\s/g,' ').replace(/[^\x20-\x7e°²±×®€]/g,'?')
const ink=(hex:string)=>rgb(parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255)
export function appendInstallationGuide(doc:PDFDocument,font:PDFFont,bold:PDFFont,plan:Plan,s:Settings,header:(page:PDFPage,title:string)=>void){
  const guide=installationGuide(plan,s),m=guide.model
  const page=(title:string)=>{const p=doc.addPage([420*MM,297*MM]);header(p,title);return p}
  const text=(p:PDFPage,value:string,x:number,y:number,size=3.1,colour='#303728',heavy=false)=>p.drawText(safe(value),{x:x*MM,y:p.getHeight()-y*MM,size:size*MM,font:heavy?bold:font,color:ink(colour)})
  const rect=(p:PDFPage,x:number,y:number,w:number,h:number,fill:string)=>p.drawRectangle({x:x*MM,y:p.getHeight()-(y+h)*MM,width:w*MM,height:h*MM,color:ink(fill)})
  const line=(p:PDFPage,x:number,y:number,x2:number,y2:number,colour='#7c8473',width=.25)=>p.drawLine({start:{x:x*MM,y:p.getHeight()-y*MM},end:{x:x2*MM,y:p.getHeight()-y2*MM},thickness:width*MM,color:ink(colour)})
  const wrap=(value:string,width:number,size=3.1,heavy=false)=>{
    const f=heavy?bold:font,lines:string[]=[];let current=''
    for(const word of safe(value).split(' ')){
      const next=current?`${current} ${word}`:word
      if(current&&f.widthOfTextAtSize(next,size*MM)>width*MM){lines.push(current);current=word}else current=next
    }
    if(current)lines.push(current);return lines
  }
  const paragraph=(p:PDFPage,value:string,x:number,y:number,width:number,size=3.1,leading=4.5,colour='#303728')=>{
    const lines=wrap(value,width,size);for(const [i,l] of lines.entries())text(p,l,x,y+i*leading,size,colour);return y+lines.length*leading
  }
  const overview=page('Your deck: installation guide')
  paragraph(overview,`${s.quotation?.projectReference?`${s.quotation.projectReference} | `:''}${s.quotation?.customerName?`${s.quotation.customerName} | `:''}${dimensionText(m.width)} × ${dimensionText(m.depth)} mm | ${plan.area.toFixed(2)} m² | ${m.frame} | ${m.pedestals.length} supports`,14,45,392,3.3,4.8)
  text(overview,'A sequence built from this plan. Check the measured layout and verify all positions on site.',14,57,3.1,'#68764f')
  rect(overview,14,66,190,132,'#f4f7ed');rect(overview,216,66,190,132,'#f4f7ed')
  text(overview,'YOUR SUPPORT LAYOUT',21,76,3.2,'#526832',true)
  text(overview,'YOUR SELECTED BUILD-UP',223,76,3.2,'#526832',true)
  // Small physical-plan diagram; all positions come from the same exported model.
  const scale=Math.min(167/Math.max(1,m.width),93/Math.max(1,m.depth)),ox=109-m.width*scale/2,oy=85+(93-m.depth*scale)/2
  const project=(q:{x:number;y:number})=>({x:ox+q.x*scale,y:oy+q.y*scale})
  for(const p of m.pedestals){const q=project(p);overview.drawCircle({x:q.x*MM,y:overview.getHeight()-q.y*MM,size:Math.max(.45,p.diameter*scale/2)*MM,borderColor:ink('#788268'),borderWidth:.12*MM})}
  for(const member of m.members){const a=project(member.a),b=project(member.b);line(overview,a.x,a.y,b.x,b.y,FRAME_COLOURS[member.kind],member.kind==='bearer'?.5:.25)}
  for(const edge of m.edges){const a=project(edge.a),b=project(edge.b);line(overview,a.x,a.y,b.x,b.y,'#303728',.4)}
  for(const hole of m.cutouts)for(const [i,q] of hole.points.entries()){const a=project(q),b=project(hole.points[(i+1)%hole.points.length]);line(overview,a.x,a.y,b.x,b.y,'#303728',.5)}
  const datum=project({x:0,y:0});text(overview,'X / Y datum',Math.max(21,datum.x),Math.min(185,datum.y+5),2.7)
  text(overview,`Board run: ${s.direction==='horizontal'?'X / width':'Y / depth'} | Diagram only - use schedules to set out`,21,191,2.7,'#68764f')
  // Section is deliberately schematic: labels carry exact selected dimensions.
  const heightScale=Math.min(.23,68/Math.max(s.height,s.board.thickness+plan.frame.rule.joist+plan.frame.rule.bearer+20)),top=94
  let y=top
  for(const layer of guide.stack){const h=Math.max(4,layer.height*heightScale);rect(overview,233,y,62,h,layer.colour);line(overview,295,y+h/2,307,y+h/2);text(overview,`${layer.name}: ${layer.height} mm`,310,y+h/2+1,3);y+=h}
  const baseY=Math.max(y+18,top+s.height*heightScale)
  rect(overview,259,y,11,baseY-y-3,'#596253');rect(overview,246,baseY-3,38,3,'#596253');line(overview,227,baseY,300,baseY,'#89996b',.7)
  text(overview,'Pedestal adjustment',310,baseY-6,3)
  text(overview,`${dimensionText(m.height.min)}-${dimensionText(m.height.max)} mm required`,310,baseY,3)
  text(overview,`${s.height} mm finished deck height`,233,baseY+9,3,'#526832',true)
  paragraph(overview,`${s.pedestalName}. ${plan.frame.rule.bearer?'Bearer tier below joists.':'Single-layer frame; no separate bearer tier.'} Section is schematic, not to scale.`,223,181,176,2.8,4)
  const reviews=guide.review.length?guide.review:['Check site dimensions, actual ground levels and the selected product instructions before starting.']
  text(overview,'BEFORE INSTALLATION',14,211,3.5,'#526832',true)
  let ry=219
  for(const note of reviews){ry=paragraph(overview,`- ${note}`,14,ry,392,3,4.3)+2}
  paragraph(overview,'Steps use project settings; source tags refer to BetterDeck guidance listed at the end of this guide. Geometry checks are not approval of substrate capacity, fixings or structural connections.',14,Math.max(258,ry+2),392,2.8,4,'#68764f')

  let current=page('Personalised installation sequence'),cursor=54,sequencePage=1
  const intro=()=>text(current,'Work in this order. Source tags identify supplier guidance; dimensions and quantities come from this project.',14,45,2.9,'#68764f')
  intro()
  for(let index=0;index<guide.steps.length;index+=2){
    const row=guide.steps.slice(index,index+2)
    const cards=row.map(step=>({step,title:wrap(step.title,170,3.5,true),body:wrap(step.body,176),check:wrap(step.check,176,2.9)}))
    const height=Math.max(...cards.map(c=>18+c.title.length*5+c.body.length*4.5+c.check.length*4.2+10))
    if(cursor+height>278){sequencePage++;current=page(`Installation sequence - continued ${sequencePage}`);cursor=54;intro()}
    for(const [column,c] of cards.entries()){
      const x=14+column*202;rect(current,x,cursor,190,height,'#f4f7ed')
      let cy=cursor+9
      text(current,String(index+column+1).padStart(2,'0'),x+7,cy,3.5,'#526832',true)
      for(const l of c.title){text(current,l,x+18,cy,3.5,'#303728',true);cy+=5}
      cy+=3
      for(const l of c.body){text(current,l,x+7,cy);cy+=4.5}
      cy+=3
      for(const l of c.check){text(current,l,x+7,cy,2.9,'#526832');cy+=4.2}
      text(current,c.step.sources.length?`Guidance: ${c.step.sources.join(', ')}`:'Project setting-out sequence',x+7,cursor+height-5,2.4,'#68764f')
    }
    cursor+=height+7
  }
  // Keep references together, with actual PDF link annotations for print and screen.
  if(cursor+73>278){current=page('Installation sources & product checks');cursor=48}
  text(current,'BETTERDECK REFERENCES',14,cursor,3.5,'#526832',true);cursor+=8
  for(const source of guide.sources){
    text(current,`${source.id} - ${source.title}`,14,cursor,2.9,'#303728',true);cursor+=4.6
    text(current,source.url,14,cursor,2.5,'#426c52')
    const annotation=doc.context.obj({Type:'Annot',Subtype:'Link',Rect:[14*MM,current.getHeight()-(cursor+1)*MM,406*MM,current.getHeight()-(cursor-3)*MM],Border:[0,0,0],A:{Type:'Action',S:'URI',URI:PDFString.of(source.url)}})
    current.node.addAnnot(doc.context.register(annotation));cursor+=7
  }
  paragraph(current,'Sources checked 28 October 2026. S4 is a TimberTech product guide hosted by BetterDeck; its timber fasteners and product-specific details must not be applied automatically to a custom board or Alu-Joist. Ask BetterDeck to confirm the current instructions for the products supplied.',14,cursor+1,392,2.8,4,'#68764f')
}
