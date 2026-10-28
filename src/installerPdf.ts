import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'
import type { PDFPage, PDFFont } from 'pdf-lib'
import { dimensionText, installerDrawing, installerPlan, PLAN_COLOURS } from './installerPlan.ts'
import type { InstallerDrawing } from './installerPlan.ts'
import type { Plan, Settings } from './planner.ts'
import { pdfBrand } from './pdfBrand.ts'
import { appendInstallationGuide } from './installationGuidePdf.ts'
import { installerReferenceSelection, loadInstallerReferenceAssets } from './installerReferences.ts'
import type { InstallerReferenceAssets } from './installerReferences.ts'

const MM=72/25.4
const colour=(hex:string)=>rgb(parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255)
// Built-in PDF fonts use WinAnsi; keep user text printable instead of failing on
// unsupported characters. Drawing coordinates and numerical precision are untouched.
const printable=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[–—]/g,'-').replace(/[·•]/g,' / ').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/\s/g,' ').replace(/[^\x20-\x7e°²±×®€]/g,'?')

function text(page:PDFPage,font:PDFFont,value:string,x:number,y:number,size=3,ink=PLAN_COLOURS.ink){
  page.drawText(printable(value),{x:x*MM,y:page.getHeight()-y*MM,size:size*MM,font,color:colour(ink)})
}
function rule(page:PDFPage,x1:number,y1:number,x2:number,y2:number,ink=PLAN_COLOURS.muted,width=.2){
  page.drawLine({start:{x:x1*MM,y:page.getHeight()-y1*MM},end:{x:x2*MM,y:page.getHeight()-y2*MM},thickness:width*MM,color:colour(ink)})
}
function wrap(font:PDFFont,value:string,size:number,width:number){
  const words=printable(value).split(' '),lines:string[]=[];let line=''
  for(const word of words){const candidate=line?line+' '+word:word;if(line&&font.widthOfTextAtSize(candidate,size*MM)>width*MM){lines.push(line);line=word}else line=candidate}
  if(line)lines.push(line);return lines
}
function drawScene(page:PDFPage,font:PDFFont,d:InstallerDrawing,offsetX:number,offsetY:number){
  const H=page.getHeight()
  for(const m of d.marks){
    if(m.type==='line'){page.drawLine({start:{x:(offsetX+m.a.x)*MM,y:H-(offsetY+m.a.y)*MM},end:{x:(offsetX+m.b.x)*MM,y:H-(offsetY+m.b.y)*MM},thickness:(m.ink.width??.2)*MM,color:colour(m.ink.colour),...(m.ink.dash?{dashArray:[MM,MM]}:{})});continue}
    if(m.type==='circle'){page.drawCircle({x:(offsetX+m.at.x)*MM,y:H-(offsetY+m.at.y)*MM,size:m.radius*MM,borderWidth:(m.ink.width??.2)*MM,borderColor:colour(m.ink.colour),...(m.fill?{color:colour(m.fill)}:{})});continue}
    const value=printable(m.text),size=m.size*MM,w=font.widthOfTextAtSize(value,size),theta=-(m.angle??0)*Math.PI/180
    const cx=(offsetX+m.at.x)*MM,cy=H-(offsetY+m.at.y)*MM,half=m.align==='center'?w/2:0
    if(m.background&&!m.angle)page.drawRectangle({x:cx-half-.5*MM,y:cy-size*.7,width:w+MM,height:size*1.4,color:rgb(1,1,1)})
    page.drawText(value,{x:cx-Math.cos(theta)*half+Math.sin(theta)*size*.35,y:cy-Math.sin(theta)*half-Math.cos(theta)*size*.35,font,size,color:colour(m.colour),rotate:degrees(-(m.angle??0))})
  }
}

export async function exportInstallerPdf(plan:Plan,s:Settings,options:{now?:Date;logo?:Uint8Array;references?:InstallerReferenceAssets}={}){
  if(!plan.frame.geometryPass)throw new Error('Resolve the support geometry before downloading an installer plan.')
  const model=installerPlan(plan,s),doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold)
  const now=options.now??new Date(),date=new Intl.DateTimeFormat('en-IE',{dateStyle:'medium',timeZone:'Europe/Dublin'}).format(now)
  const brand=await pdfBrand(doc,options.logo)
  doc.setTitle(`BetterDeck installer plan ${model.reference}`);doc.setAuthor('BetterDeck');doc.setCreator('BetterPlan');doc.setCreationDate(now);doc.setModificationDate(now)
  const portrait=model.depth>model.width*1.2,W=portrait?297:420,H=portrait?420:297
  const header=(page:PDFPage,title:string)=>{
    const w=page.getWidth()/MM
    brand(page)
    text(page,bold,title,63,27,w>300?4.2:3.5)
    const ref=model.reference+'  |  '+date
    text(page,font,ref,w-14-font.widthOfTextAtSize(ref,2.7*MM)/MM,16,2.7)
    rule(page,14,36,w-14,36,'#d8dfcb')
  }
  const cover=doc.addPage([W*MM,H*MM]);header(cover,'Framing & pedestal setting-out plan')
  const drawing=installerDrawing(model,W-28,H-108,3,false)
  drawScene(cover,font,drawing,14,41)
  const y=H-64
  text(cover,bold,`Scale 1:${drawing.scale} at A3 - print at 100%`,14,y,3)
  const bar=Math.min(1000,model.width),barWidth=bar/drawing.scale
  rule(cover,14,y+6,14+barWidth,y+6,PLAN_COLOURS.ink,.5);rule(cover,14,y+4.5,14,y+7.5);rule(cover,14+barWidth,y+4.5,14+barWidth,y+7.5)
  text(cover,font,dimensionText(bar)+' mm',14+barWidth+3,y+7,2.5)
  const legendX=W>300?145:105
  text(cover,font,'Green: Alu-Joists / rim   Ochre: bearers   Brown: noggins',legendX,y,2.5)
  text(cover,font,'Circles: actual pedestal bases   Crosses: stock splices',legendX,y+5,2.5)
  text(cover,font,`${model.pedestals.length} actual pedestal positions shown`,legendX,y+10,2.3)
  rule(cover,14,y+12,W-14,y+12,'#d8dfcb')
  const left=14,right=W>300?W*.54:W*.53
  for(const [i,line] of [`Board-driven frame / ${model.frame}`,`Area ${model.area.toFixed(2)} m² | Load ${model.load} kN/m² | Joist centres max ${model.joistCentres} mm`,`Finished deck ${model.finishedHeight} mm | Ground variation ±${model.variation} mm`].entries())text(cover,i===0?bold:font,line,left,y+19+i*5,W>300?2.8:2.4)
  text(cover,bold,model.pedestal,right,y+19,2.8)
  text(cover,font,`Required height ${dimensionText(model.height.min)}-${dimensionText(model.height.max)} mm | Bases ${model.pedestals.length}`,right,y+24,2.6)
  text(cover,font,`Reference: ${model.reference} | All dimensions in mm`,right,y+29,2.6)
  text(cover,bold,model.heightFits?'FOR SITE VERIFICATION':'PEDESTAL HEIGHT RANGE NEEDS REVIEW',14,H-17,2.6,model.heightFits?'#626c2c':'#9c4e31')
  text(cover,font,'Verify dimensions on site. Supplier design of connections, perimeter framing and product compatibility is still required.',14,H-12,2.25)

  appendInstallationGuide(doc,font,bold,plan,s,header)

  const notes=doc.addPage([420*MM,297*MM]);header(notes,'Specification & installation notes')
  let noteY=45
  const paragraphs=[
    `Frame: ${model.frame}. Aluminium stock: ${model.frameStock} m. Entered bearing face: ${model.faceWidth} mm; minimum board-end bearing: ${model.bearing} mm.`,
    `Construction: Board-driven joists, blocking and collectors. Applied minimum frame-end recess for fascia: ${dimensionText(model.construction.fasciaClearance)} mm from the outside deck outline. Picture-frame boards are included on ${model.edges.filter(e=>e.framingBoard).length} outside edges; omitted on ${model.edges.filter(e=>!e.framingBoard).length} outside edges.`,
    `Support arrangement: ${model.construction.supportArrangement==='same-depth-headers'?'Same-depth support headers and connected joist sections. No added bearer tier.':'Pedestal grid with local opening trims.'}` ,
    `Entered end-overhang limits: 35 mm profile - ${model.construction.joistOverhang35===null?'pending supplier value':dimensionText(model.construction.joistOverhang35)+' mm'}; 80 mm profile - ${model.construction.joistOverhang80===null?'pending supplier value':dimensionText(model.construction.joistOverhang80)+' mm'}. Confirm the applicable connection, load and end-overhang limits with the supplier.`,
    ...model.construction.verification.notes,
    ...model.construction.checks.map(c=>`${c.ok?'PASS':'REVIEW'} - ${c.name}: ${c.detail}`),
    `Decking: ${model.boardWidth} × ${model.boardThickness} mm; ${model.boardStock} m stock; boards run across the ${model.boardDirection==='horizontal'?'physical X (width)':'physical Y (depth)'} axis.`,
    `Pedestal: ${model.pedestal}. Required adjustment range: ${dimensionText(model.height.min)}-${dimensionText(model.height.max)} mm. Average height and ground variation do not provide a surveyed height for each pedestal.`,
    `Actual maximum primary span ${dimensionText(model.primarySpan)} mm / limit ${model.primaryLimit} mm. ${model.secondaryLimit?`Actual maximum secondary span ${dimensionText(model.secondarySpan)} mm / limit ${model.secondaryLimit} mm.`:''}`,
    `Structural source: BetterDeck Aluminium Profiles Design, 1513-1 revision 2 (15 June 2021), case ${plan.frame.rule.sheet}; source PDF pages ${installerReferenceSelection(s).pages.join(', ')}.`,
    'Drawing dimensions refer to the current model in millimetres. Verify the marked lengths and actual support locations on site. Do not measure from a resized screen or print.',
    ...model.warnings,
  ]
  let page=notes
  for(const paragraph of new Set(paragraphs)){
    const lines=wrap(font,paragraph,3,390)
    if(noteY+lines.length*4.5+5>276){page=doc.addPage([420*MM,297*MM]);header(page,'Installation notes - continued');noteY=45}
    for(const line of lines){text(page,font,line,14,noteY,3);noteY+=4.5}noteY+=5
  }
  const references=options.references??(typeof window!=='undefined'?await loadInstallerReferenceAssets(s):undefined)
  const generatedPages=doc.getPages()
  if(references){
    const selection=installerReferenceSelection(s)
    const referencePage=doc.addPage([420*MM,297*MM]);header(referencePage,'Frame illustration & relevant span report')
    text(referencePage,bold,`${model.frame} | ${s.load} kN/m² live load | Composite decking / K Series`,14,46,3.8)
    text(referencePage,font,`Report 1513-1 revision 2, case ${plan.frame.rule.sheet}. Included source PDF pages: ${selection.pages.join(', ')}.`,14,54,3)
    if(selection.illustration){
      if(!references.illustration)throw new Error('The matching frame illustration is missing.')
      const image=await doc.embedPng(references.illustration),scale=Math.min(392*MM/image.width,194*MM/image.height),width=image.width*scale,height=image.height*scale
      referencePage.drawImage(image,{x:(referencePage.getWidth()-width)/2,y:referencePage.getHeight()-64*MM-height,width,height})
      text(referencePage,font,'Supplier illustration of the selected two-tier arrangement. Use the selected-load report pages for spans.',14,267,2.8)
    }else{
      text(referencePage,bold,'Single-layer Alu-Joist on pedestals',14,76,5)
      text(referencePage,font,'The supplied two-tier illustrations do not match this arrangement; the guide shows your actual build-up.',14,88,3)
      text(referencePage,font,`Maximum primary span in this plan: ${dimensionText(model.primarySpan)} mm. Selected report limit: ${model.primaryLimit} mm.`,14,102,3.4)
      text(referencePage,font,`Joist spacing: ${s.joistSpacing} mm. Selected profile: ${plan.frame.rule.joist} mm.`,14,113,3.4)
    }
    text(referencePage,font,'The following pages are unchanged extracts from the supplied report. PDF page numbers are one higher than printed Sheet No.',14,276,2.7)
    generatedPages.push(referencePage)
    const source=await PDFDocument.load(references.spanReport)
    if(source.getPageCount()!==67)throw new Error('The bundled span report does not match the reviewed 67-page revision.')
    for(const page of await doc.copyPages(source,selection.pages.map(n=>n-1)))doc.addPage(page)
  }
  const count=doc.getPageCount()
  for(const [i,page]of generatedPages.entries()){const w=page.getWidth()/MM,h=page.getHeight()/MM;text(page,font,`${model.reference} | BetterDeck® | Site verification required`,14,h-5,2.2,PLAN_COLOURS.muted);text(page,font,`${i+1} / ${count}`,w-29,h-5,2.2,PLAN_COLOURS.muted)}
  return doc.save()
}
