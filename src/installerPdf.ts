import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'
import type { PDFPage, PDFFont } from 'pdf-lib'
import { dimensionText, installerDrawing, installerPlan, PLAN_COLOURS } from './installerPlan.ts'
import type { InstallerDrawing } from './installerPlan.ts'
import type { Plan, Settings } from './planner.ts'
import { pdfBrand } from './pdfBrand.ts'

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

export async function exportInstallerPdf(plan:Plan,s:Settings,options:{now?:Date;logo?:Uint8Array}={}){
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
  const drawing=installerDrawing(model,W-28,H-108,3)
  drawScene(cover,font,drawing,14,41)
  const y=H-64
  text(cover,bold,`Scale 1:${drawing.scale} at A3 - print at 100%`,14,y,3)
  const bar=Math.min(1000,model.width),barWidth=bar/drawing.scale
  rule(cover,14,y+6,14+barWidth,y+6,PLAN_COLOURS.ink,.5);rule(cover,14,y+4.5,14,y+7.5);rule(cover,14+barWidth,y+4.5,14+barWidth,y+7.5)
  text(cover,font,dimensionText(bar)+' mm',14+barWidth+3,y+7,2.5)
  const legendX=W>300?145:105
  text(cover,font,'Green: Alu-Joists / rim   Ochre: bearers   Brown: noggins',legendX,y,2.5)
  text(cover,font,'Circles: actual pedestal bases   Crosses: stock splices',legendX,y+5,2.5)
  text(cover,font,`${model.pedestalCode} (n): ${model.pedestal} position n`,legendX,y+10,2.3)
  rule(cover,14,y+12,W-14,y+12,'#d8dfcb')
  const left=14,right=W>300?W*.54:W*.53
  for(const [i,line] of [`Board-driven frame / ${model.frame}`,`Area ${model.area.toFixed(2)} m² | Load ${model.load} kN/m² | Joist centres max ${model.joistCentres} mm`,`Finished deck ${model.finishedHeight} mm | Ground variation ±${model.variation} mm`].entries())text(cover,i===0?bold:font,line,left,y+19+i*5,W>300?2.8:2.4)
  text(cover,bold,model.pedestal,right,y+19,2.8)
  text(cover,font,`Required height ${dimensionText(model.height.min)}-${dimensionText(model.height.max)} mm | Bases ${model.pedestals.length}`,right,y+24,2.6)
  text(cover,font,`Reference: ${model.reference} | All dimensions in mm`,right,y+29,2.6)
  text(cover,bold,model.heightFits?'FOR SITE VERIFICATION':'PEDESTAL HEIGHT RANGE NEEDS REVIEW',14,H-17,2.6,model.heightFits?'#626c2c':'#9c4e31')
  text(cover,font,'Verify dimensions on site. Supplier design of connections, perimeter framing and product compatibility is still required.',14,H-12,2.25)

  // Automatic schedules include every coordinate, including dense layouts where
  // individual callouts would otherwise collide on the overview drawing.
  const table=(title:string,description:string,headers:string[],rows:string[][],ratios:number[])=>{
    let page:PDFPage,y=0
    const widths=ratios.map(r=>r*392)
    const next=()=>{page=doc.addPage([420*MM,297*MM]);header(page,title);text(page,font,description,14,43,2.8);y=51;let x=14;for(const [i,h]of headers.entries()){page.drawRectangle({x:x*MM,y:page.getHeight()-(y+8)*MM,width:widths[i]*MM,height:8*MM,color:colour('#626c2c')});text(page,bold,h,x+2,y+5.3,2.8,'#ffffff');x+=widths[i]}y+=8}
    next()
    for(const [index,row]of rows.entries()){
      const cells=row.map((v,i)=>wrap(font,v,2.8,widths[i]-4)),height=Math.max(7,...cells.map(c=>c.length*4+3))
      if(y+height>284)next()
      if(index%2)page!.drawRectangle({x:14*MM,y:page!.getHeight()-(y+height)*MM,width:392*MM,height:height*MM,color:colour('#f4f7e9')})
      let x=14
      for(const [i,lines]of cells.entries()){for(const [j,line]of lines.entries())text(page!,font,line,x+2,y+4.7+j*4,2.8);x+=widths[i]}
      rule(page!,14,y+height,406,y+height,'#d8dfcb',.12);y+=height
    }
  }
  table('Outline & corner setting-out','Origin 0,0 is the top-left of the bounding box. X increases right; Y increases down. Lengths and coordinates in mm.',
    ['Corner','X','Y','Internal angle','Next edge','Picture frame','Edge length','Distance to C-01'],
    model.corners.map((p,i)=>[p.id,dimensionText(p.x),dimensionText(p.y),dimensionText(p.angle)+'°',model.edges[i].id,model.edges[i].framingBoard?'Included':'Omitted',dimensionText(model.edges[i].length),dimensionText(Math.hypot(p.x-model.corners[0].x,p.y-model.corners[0].y))]),[.08,.12,.12,.13,.10,.13,.15,.17])
  if(model.cutouts.length)table('Cutout setting-out','Clear opening boundaries. Coordinates share the outside outline datum; perimeter boards and trim framing sit outside each opening.',
    ['Opening','Name','Point','X','Y','Next segment'],
    model.cutouts.flatMap(h=>h.points.map((p,i)=>{const b=h.points[(i+1)%h.points.length];return [h.id,h.name,String(i+1),dimensionText(p.x),dimensionText(p.y),dimensionText(Math.hypot(b.x-p.x,b.y-p.y))]})),[.10,.30,.10,.16,.16,.18])
  table('Pedestal setting-out schedule','IDs match the pedestal CSV. Set individual heights from surveyed ground levels; the range below is the global design range.',
    ['Pedestal ID','X','Y','Base diameter','Height min','Height max','Shared head'],
    model.pedestals.map(p=>[p.id,dimensionText(p.x),dimensionText(p.y),dimensionText(p.diameter),dimensionText(model.height.min),dimensionText(model.height.max),p.shared?'Yes':'No']),[.13,.16,.16,.16,.14,.14,.11])
  if(model.centreLines.length)table('Framing centre-line setting-out','Coordinates from datum in mm. Coordinate gaps describe adjacent parallel lines; they are not a substitute for individual member span checks.',
    ['Line ID','Function','Datum axis','Coordinate','Gap from previous line'],
    model.centreLines.map(c=>[c.id,c.kind,c.axis,dimensionText(c.coordinate),c.spacing===null?'First line':dimensionText(c.spacing)]),[.14,.29,.15,.20,.22])
  if(model.stockJoints.length)table('Frame stock-joint setting-out','Locate these joint centres from the same datum. Crosses on the overview indicate stock splices; connections require supplier detailing.',
    ['Joint ID','X','Y','Detail'],model.stockJoints.map(j=>[j.id,dimensionText(j.x),dimensionText(j.y),'Frame stock splice centre']),[.16,.22,.22,.40])
  table('Alu-Joist member setting-out','Member IDs match the aluminium cutting CSV. Coordinates locate member centre lines; face width and end bearing require product confirmation.',
    ['Member ID','Profile / member','Start X','Start Y','End X','End Y','Length'],
    model.members.map(m=>[m.id,m.name,dimensionText(m.a.x),dimensionText(m.a.y),dimensionText(m.b.x),dimensionText(m.b.y),dimensionText(m.length)]),[.08,.30,.124,.124,.124,.124,.124])
  if(model.construction.projections.length)table('Calculated profile end projections','Draft geometry: distances beyond actual supporting pedestals / bearers / upper rails. Unset supplier limits are not approved allowances.',
    ['Member','End / tier','Profile','End X','End Y','Support X','Support Y','Projection','Limit'],
    model.construction.projections.map(q=>[q.member,`${q.end} / ${q.tier}`,String(q.size),dimensionText(q.point.x),dimensionText(q.point.y),dimensionText(q.support.x),dimensionText(q.support.y),dimensionText(q.distance),q.limit===null?'Unverified':dimensionText(q.limit)]),[.09,.15,.07,.10,.10,.10,.10,.10,.09])
  if(model.construction.boardProjections.length)table('Decking end projections','Unverified board-supplier detail: distance from a cut end to the nearest finite bearing face, measured along the board axis.',
    ['Board piece','End X','End Y','Projection mm','Status'],
    model.construction.boardProjections.map(q=>[`B-${String(q.piece+1).padStart(4,'0')}`,dimensionText(q.point.x),dimensionText(q.point.y),dimensionText(q.distance),'Board supplier limit unverified']),[.16,.20,.20,.20,.24])
  if(model.construction.connections.length)table('Connection details to confirm','These are geometric junctions, not approved connections. Confirm each member end, head, load transfer and fixing detail with the supplier.',
    ['Connection','X','Y','Meeting members','Status'],model.construction.connections.map(q=>[q.id,dimensionText(q.point.x),dimensionText(q.point.y),q.members.join(', '),'Unverified connector/head']),[.12,.16,.16,.36,.20])
  const notes=doc.addPage([420*MM,297*MM]);header(notes,'Specification & installation notes')
  let noteY=45
  const paragraphs=[
    `Frame: ${model.frame}. Aluminium stock: ${model.frameStock} m. Entered bearing face: ${model.faceWidth} mm; minimum board-end bearing: ${model.bearing} mm.`,
    `Construction: Board-driven joists, blocking and collectors. Applied minimum frame-end recess for fascia: ${dimensionText(model.construction.fasciaClearance)} mm from the outside deck outline. Picture-frame boards are included on ${model.edges.filter(e=>e.framingBoard).map(e=>e.id).join(', ')||'no outside edges'}; omitted on ${model.edges.filter(e=>!e.framingBoard).map(e=>e.id).join(', ')||'no outside edges'}.`,
    `Support arrangement: ${model.construction.supportArrangement==='same-depth-headers'?'Same-depth support headers and connected joist sections. No added bearer tier.':'Pedestal grid with local opening trims.'}` ,
    `Entered end-overhang limits: 35 mm profile - ${model.construction.joistOverhang35===null?'pending supplier value':dimensionText(model.construction.joistOverhang35)+' mm'}; 80 mm profile - ${model.construction.joistOverhang80===null?'pending supplier value':dimensionText(model.construction.joistOverhang80)+' mm'}. Confirm the applicable connection, load and end-overhang limits with the supplier.`,
    ...model.construction.verification.notes,
    ...model.construction.checks.map(c=>`${c.ok?'PASS':'REVIEW'} - ${c.name}: ${c.detail}`),
    `Decking: ${model.boardWidth} × ${model.boardThickness} mm; ${model.boardStock} m stock; boards run across the ${model.boardDirection==='horizontal'?'physical X (width)':'physical Y (depth)'} axis.`,
    `Pedestal: ${model.pedestal}. Required adjustment range: ${dimensionText(model.height.min)}-${dimensionText(model.height.max)} mm. Average height and ground variation do not provide a surveyed height for each pedestal.`,
    `Actual maximum primary span ${dimensionText(model.primarySpan)} mm / limit ${model.primaryLimit} mm. ${model.secondaryLimit?`Actual maximum secondary span ${dimensionText(model.secondarySpan)} mm / limit ${model.secondaryLimit} mm.`:''}`,
    `Structural source: BetterDeck Aluminium Profiles Design, ${model.source}.`,
    'All dimensions and coordinates refer to the current model in millimetres. Dimensions are rounded to 0.1 mm; set out from the listed coordinates and verify against the site. Do not measure from a resized screen or print.',
    `${model.pedestalCode} (n) identifies position n of ${model.pedestal}; these IDs match the pedestal CSV. M-xxxx IDs match member IDs in the Alu-Joist cutting CSV. A shared head is one bearing node and requires a supplier-approved head/connection detail.`,
    'JCL and BCL identify actual joist and bearer centre-line coordinates. BR identifies breaker centres. FJ identifies frame stock-joint centres. X and Y coordinates share the outside-outline datum. Dense setting-out chains are listed completely in the schedules.',
    ...(drawing.labelled?[]:['This dense overview omits pedestal callouts. Use the complete pedestal coordinate schedule to set out every base.']),
    ...model.warnings,
  ]
  let page=notes
  for(const paragraph of new Set(paragraphs)){
    const lines=wrap(font,paragraph,3,390)
    if(noteY+lines.length*4.5+5>276){page=doc.addPage([420*MM,297*MM]);header(page,'Installation notes - continued');noteY=45}
    for(const line of lines){text(page,font,line,14,noteY,3);noteY+=4.5}noteY+=5
  }
  const pages=doc.getPages()
  for(const [i,page]of pages.entries()){const w=page.getWidth()/MM,h=page.getHeight()/MM;text(page,font,`${model.reference} | BetterDeck® | Site verification required`,14,h-5,2.2,PLAN_COLOURS.muted);text(page,font,`${i+1} / ${pages.length}`,w-29,h-5,2.2,PLAN_COLOURS.muted)}
  return doc.save()
}
