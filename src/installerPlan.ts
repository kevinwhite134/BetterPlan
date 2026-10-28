import { pedestalHeights } from './pedestalSurvey.ts'
import { FRAME_NAMES } from './planner.ts'
import type { Plan, Point, Settings } from './planner.ts'
import { interiorAngle } from './editorGeometry.ts'
import { signedArea } from './deckGeometry.ts'
import { frameMemberName, pedestalAbbreviation, pedestalReference } from './productNames.ts'
import { perimeterEdgeEnabled } from './perimeterEdges.ts'

const mm=(p:Point)=>({x:p.x*1000,y:p.y*1000})
export const dimensionText=(n:number)=>String(Math.round(n*10)/10)
export const planId=(prefix:string,index:number)=>`${prefix}-${String(index+1).padStart(prefix==='C'?2:4,'0')}`
const unique=(ns:number[])=>[...new Set(ns.map(n=>Math.round(n*10000)/10000))].sort((a,b)=>a-b)

export function installerPlan(plan:Plan,s:Settings){
  const physical=(p:Point)=>mm(s.direction==='vertical'?{x:p.y,y:p.x}:p)
  const corners=plan.physical.map((p,i)=>({id:planId('C',i),...mm(p),angle:interiorAngle(plan.physical,i)}))
  const edges=corners.map((a,i)=>{const b=corners[(i+1)%corners.length];return {id:`E${String(i+1).padStart(2,'0')}`,a,b,length:Math.hypot(b.x-a.x,b.y-a.y),framingBoard:perimeterEdgeEnabled(s,i)}})
  const joistAxis=s.direction==='horizontal'?'X' as const:'Y' as const,bearerAxis=s.direction==='horizontal'?'Y' as const:'X' as const
  const centreLines=[
    ...unique(plan.frame.members.filter(m=>m.kind==='joist'&&Math.abs(m.a.x-m.b.x)<1e-7).map(m=>m.a.x*1000)).map((coordinate,i,a)=>({id:`JCL-${String(i+1).padStart(2,'0')}`,kind:'Joist centre line',axis:joistAxis,coordinate,spacing:i?coordinate-a[i-1]:null})),
    ...unique(plan.frame.members.filter(m=>m.kind==='bearer'&&Math.abs(m.a.y-m.b.y)<1e-7).map(m=>m.a.y*1000)).map((coordinate,i,a)=>({id:`BCL-${String(i+1).padStart(2,'0')}`,kind:'Bearer centre line',axis:bearerAxis,coordinate,spacing:i?coordinate-a[i-1]:null})),
    ...plan.boards.breakers.map((x,i,a)=>({id:`BR-${String(i+1).padStart(2,'0')}`,kind:'Breaker centre line',axis:joistAxis,coordinate:x*1000,spacing:i?(x-a[i-1])*1000:null})),
  ]
  const survey=pedestalHeights(plan.frame.pedestals,s,plan.frame.rule)
  let hash=2166136261
  for(const c of JSON.stringify({...s,quotation:undefined})){hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0}
  return {
    reference:`BD-${hash.toString(16).toUpperCase().padStart(8,'0')}`,corners,edges,pictureFrameRows:s.pictureFrameRows??1,cornerGaps:plan.boards.fit.cornerGaps.map(r=>r.map(physical)),
    cutouts:plan.cutouts.map((h,i)=>({id:`H-${String(i+1).padStart(2,'0')}`,name:h.name,points:h.polygon.map(mm)})),
    width:Math.max(...corners.map(p=>p.x)),depth:Math.max(...corners.map(p=>p.y)),
    members:plan.frame.members.map((m,i)=>({id:planId('M',i),a:physical(m.a),b:physical(m.b),kind:m.kind,size:m.size,role:m.role,openingIndex:m.openingIndex,name:frameMemberName(m.size,m.kind,m.role),length:Math.hypot(m.b.x-m.a.x,m.b.y-m.a.y)*1000})),
    pedestals:plan.frame.pedestals.map((p,i)=>({id:pedestalReference(s.pedestalName,i),...physical(p),heightMin:survey.rows[i].min,heightMax:survey.rows[i].max,groundLevel:survey.rows[i].level,heightFits:survey.rows[i].fits,diameter:s.pedestalDiameter??150,shared:plan.frame.junctions.some(j=>Math.hypot(j.x-p.x,j.y-p.y)<1e-6)})),
    pedestalCode:pedestalAbbreviation(s.pedestalName),centreLines,
    stockJoints:plan.frame.splices.map((p,i)=>({id:`FJ-${String(i+1).padStart(3,'0')}`,...physical(p)})),
    splices:plan.frame.splices.map(physical),frame:FRAME_NAMES[s.frame],area:plan.area,
    geometryPass:plan.frame.geometryPass,heightFits:plan.heightFits,height:{min:plan.range.min,max:plan.range.max},
    pedestal:s.pedestalName,joistCentres:s.joistSpacing,primarySpan:plan.frame.maxPrimarySpan*1000,secondarySpan:plan.frame.maxSecondarySpan*1000,
    primaryLimit:plan.frame.rule.support*1000,secondaryLimit:plan.frame.rule.bearerSpacing*1000,
    boardDirection:s.direction,boardWidth:s.board.width,boardThickness:s.board.thickness,boardStock:s.board.stock,
    frameStock:s.frameStock,finishedHeight:s.height,variation:s.variation,faceWidth:s.frameFaceWidth??35,bearing:s.boardEndBearing??10,
    source:`1513-1 R2 (15 June 2021), case ${plan.frame.rule.sheet}, PDF pages ${plan.frame.rule.pages}`,
    load:s.load,warnings:plan.warnings,checks:plan.frame.checks,
    construction:{layout:plan.frame.construction,manual:plan.frame.manual,supportArrangement:plan.frame.supportArrangement,fasciaClearance:plan.frame.fasciaClearance*1000,joistOverhang35:plan.frame.profileLimits[35]===null?null:plan.frame.profileLimits[35]*1000,joistOverhang80:plan.frame.profileLimits[80]===null?null:plan.frame.profileLimits[80]*1000,checks:plan.frame.checks.filter(c=>/overhang|cantilever|frame.end/i.test(c.name)),verification:plan.frame.verification,connections:plan.frame.connections.map((q,i)=>({id:`CN-${String(i+1).padStart(3,'0')}`,point:physical(q.point),members:q.members.map(i=>planId('M',i)),status:q.status})),projections:plan.frame.projections.map(q=>({...q,member:planId('M',q.member),point:physical(q.point),support:physical(q.support),distance:q.distance*1000,limit:q.limit===null?null:q.limit*1000})),boardProjections:plan.frame.boardProjections.map(q=>({...q,distance:q.distance*1000,point:physical(q.point)}))},
  }
}
export type InstallerPlan=ReturnType<typeof installerPlan>
export type Ink={colour:string;width?:number;dash?:boolean}
export type PlanMark=
  |{type:'line';a:Point;b:Point;ink:Ink}
  |{type:'circle';at:Point;radius:number;ink:Ink;fill?:string}
  |{type:'text';at:Point;text:string;size:number;colour:string;angle?:number;align?:'left'|'center';background?:boolean}
export const PLAN_COLOURS={ink:'#303728',muted:'#7c8473',joist:'#426c52',bearer:'#aa7b32',noggin:'#a66850',dimension:'#505c42',paper:'#ffffff'}

// Paper coordinates in mm. A shared scene drives both the SVG and vector PDF.
export function installerDrawing(model:InstallerPlan,width=420,height=205,font=3,showIds=true){
  const margin=font>=4?25:20,scale=Math.max(model.width/(width-2*margin),model.depth/(height-2*margin))
  const printScale=[5,10,20,25,50,75,100,125,150,200,250,500].find(s=>s>=scale)??Math.ceil(scale/100)*100
  const x=(width-model.width/printScale)/2,y=(height-model.depth/printScale)/2
  const project=(p:Point)=>({x:x+p.x/printScale,y:y+p.y/printScale})
  const marks:PlanMark[]=[],occupied:{x:number;y:number;w:number;h:number}[]=[]
  const line=(a:Point,b:Point,colour=PLAN_COLOURS.dimension,thickness=.22,dash=false)=>marks.push({type:'line',a,b,ink:{colour,width:thickness,dash}})
  const label=(at:Point,text:string,size=font,angle=0)=>{
    marks.push({type:'text',at,text,size,colour:PLAN_COLOURS.ink,angle,align:'center',background:true})
    if(!angle)occupied.push({x:at.x-text.length*size*.28,y:at.y-size*.7,w:text.length*size*.56,h:size*1.5})
  }
  const dim=(a:Point,b:Point,offset:number,text:string,size=font)=>{
    const l=Math.hypot(b.x-a.x,b.y-a.y);if(l<1e-8)return
    const normal={x:(b.y-a.y)/l,y:-(b.x-a.x)/l},u={x:a.x+normal.x*offset,y:a.y+normal.y*offset},v={x:b.x+normal.x*offset,y:b.y+normal.y*offset}
    line(a,{x:u.x+normal.x*1.5,y:u.y+normal.y*1.5},PLAN_COLOURS.muted,.13)
    line(b,{x:v.x+normal.x*1.5,y:v.y+normal.y*1.5},PLAN_COLOURS.muted,.13)
    line(u,v)
    for(const p of [u,v])line({x:p.x-1,y:p.y-1},{x:p.x+1,y:p.y+1},PLAN_COLOURS.dimension,.25)
    let angle=Math.atan2(v.y-u.y,v.x-u.x)*180/Math.PI;if(angle>90)angle-=180;if(angle< -90)angle+=180
    label({x:(u.x+v.x)/2+normal.x*1.7,y:(u.y+v.y)/2+normal.y*1.7},text,size,angle)
  }
  const callout=(q:Point,text:string,size:number,firstRadius:number)=>{
    const w=text.length*size*.56,h=size*1.4
    for(const radius of [firstRadius,9,13,18])for(const [dx,dy] of [[1,-1],[1,1],[-1,-1],[-1,1],[0,-1],[0,1],[1,0],[-1,0]]){
      const c={x:q.x+dx*radius,y:q.y+dy*radius},box={x:c.x-w/2,y:c.y-h/2,w,h}
      if(box.x<2||box.y<2||box.x+w>width-2||box.y+h>height-2)continue
      if(occupied.some(r=>box.x<r.x+r.w+1&&box.x+w+1>r.x&&box.y<r.y+r.h+1&&box.y+h+1>r.y))continue
      line(q,c,PLAN_COLOURS.muted,.12);label(c,text,size);return true
    }
    return false
  }
  // Overall dimensions use a separate outer chain from individual outline edges.
  dim(project({x:0,y:0}),project({x:model.width,y:0}),16,dimensionText(model.width)+' overall')
  dim(project({x:0,y:model.depth}),project({x:0,y:0}),16,dimensionText(model.depth)+' overall')
  for(const m of model.members){line(project(m.a),project(m.b),m.kind==='bearer'?PLAN_COLOURS.bearer:m.kind==='noggin'?PLAN_COLOURS.noggin:PLAN_COLOURS.joist,m.kind==='bearer'?.55:.3)}
  const sign=signedArea(model.corners)>0?1:-1
  for(const e of model.edges){
    const a=project(e.a),b=project(e.b);line(a,b,PLAN_COLOURS.ink,.28)
    // Very short edges are identified in the schedule rather than unreadable chains.
    if(e.length/printScale>font*5)dim(a,b,8*sign,showIds?`${e.id}  ${dimensionText(e.length)}`:dimensionText(e.length))
  }
  for(const h of model.cutouts){
    for(let i=0;i<h.points.length;i++)line(project(h.points[i]),project(h.points[(i+1)%h.points.length]),PLAN_COLOURS.ink,.35)
    const minX=Math.min(...h.points.map(p=>p.x)),maxX=Math.max(...h.points.map(p=>p.x)),minY=Math.min(...h.points.map(p=>p.y)),maxY=Math.max(...h.points.map(p=>p.y))
    const centre=project({x:(minX+maxX)/2,y:(minY+maxY)/2})
    label({x:centre.x,y:centre.y-font},showIds?h.id:h.name,font)
    label({x:centre.x,y:centre.y+font*.7},`${dimensionText(maxX-minX)} x ${dimensionText(maxY-minY)}`,font*.8)
  }
  // Centre-line chains use a separate datum baseline from perimeter lengths.
  // Dense chains are complete in the coordinate schedule instead of becoming
  // unreadable dimension text on top of the framing.
  for(const kind of ['Joist centre line','Bearer centre line']){
    const guides=model.centreLines.filter(c=>c.kind===kind)
    if(guides.length<2||guides.length>24)continue
    for(let i=1;i<guides.length;i++){
      const a=guides[i-1],b=guides[i],gap=b.coordinate-a.coordinate
      if(gap/printScale<font*4.5)continue
      const first=a.axis==='X'?{x:a.coordinate,y:model.depth}:{x:model.width,y:a.coordinate}
      const second=a.axis==='X'?{x:b.coordinate,y:model.depth}:{x:model.width,y:b.coordinate}
      dim(project(first),project(second),a.axis==='X'?-14:14,`${dimensionText(gap)} ${kind==='Joist centre line'?'J':'B'} c/c`,font*.75)
    }
  }
  const breakers=model.centreLines.filter(c=>c.kind==='Breaker centre line')
  if(breakers.length<=8)for(const guide of breakers){
    const a=guide.axis==='X'?{x:guide.coordinate,y:0}:{x:0,y:guide.coordinate},b=guide.axis==='X'?{x:guide.coordinate,y:model.depth}:{x:model.width,y:guide.coordinate}
    line(project(a),project(b),'#75828a',.15,true)
  }
  if(model.pedestals.length){
    const top=Math.min(...model.pedestals.map(p=>p.y)),left=Math.min(...model.pedestals.map(p=>p.x))
    const row=model.pedestals.filter(p=>Math.abs(p.y-top)<.1).sort((a,b)=>a.x-b.x)
    const column=model.pedestals.filter(p=>Math.abs(p.x-left)<.1).sort((a,b)=>b.y-a.y)
    for(const points of [row,column])for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],length=Math.hypot(b.x-a.x,b.y-a.y)
      if(length/printScale>font*8)dim(project(a),project(b),4,`${dimensionText(length)} c/c`)
    }
  }
  if(showIds)for(const c of model.corners){
    const q=project(c),prev=project(model.corners[(model.corners.indexOf(c)+model.corners.length-1)%model.corners.length]),next=project(model.corners[(model.corners.indexOf(c)+1)%model.corners.length])
    const l1=Math.hypot(q.x-prev.x,q.y-prev.y),l2=Math.hypot(next.x-q.x,next.y-q.y)
    let nx=sign*((q.y-prev.y)/l1+(next.y-q.y)/l2),ny=-sign*((q.x-prev.x)/l1+(next.x-q.x)/l2),length=Math.hypot(nx,ny)
    if(length<1e-7){nx=1;ny=-1;length=Math.SQRT2}
    label({x:q.x+nx/length*4.5,y:q.y+ny/length*4.5},c.id,font*.9)
  }
  for(const p of model.pedestals){const q=project(p);marks.push({type:'circle',at:q,radius:p.diameter/printScale/2,ink:{colour:PLAN_COLOURS.joist,width:.24},fill:'#f2f5e7'});marks.push({type:'circle',at:q,radius:.45,ink:{colour:PLAN_COLOURS.joist},fill:PLAN_COLOURS.joist})}
  for(const p of model.pedestals){const q=project(p),radius=p.diameter/printScale/2;occupied.push({x:q.x-radius,y:q.y-radius,w:radius*2,h:radius*2})}
  for(const p of model.stockJoints){
    const q=project(p),r=.8,base=model.pedestals.find(b=>Math.hypot(b.x-p.x,b.y-p.y)<.1)
    line({x:q.x-r,y:q.y-r},{x:q.x+r,y:q.y+r},PLAN_COLOURS.ink,.2);line({x:q.x-r,y:q.y+r},{x:q.x+r,y:q.y-r},PLAN_COLOURS.ink,.2)
    if(showIds&&model.stockJoints.length<=36)callout(q,p.id,font*.75,(base?.diameter??0)/printScale/2+4)
  }
  if(breakers.length<=8)for(const guide of breakers){
    const at=guide.axis==='X'?{x:guide.coordinate,y:model.depth/2}:{x:model.width/2,y:guide.coordinate}
    callout(project(at),`${showIds?guide.id:'Breaker'} ${guide.axis}=${dimensionText(guide.coordinate)}`,font*.8,8)
  }
  // Short, numbered callouts with leaders, choosing an unoccupied position.
  // Dense layouts retain every exact coordinate in the downloadable schedules.
  const labelled=showIds&&model.pedestals.length<=160
  if(labelled)for(const p of model.pedestals){
    callout(project(p),p.id,font*.82,p.diameter/printScale/2+3)
  }
  // Explicit datum, not an assumed corner or a geographic north arrow.
  const origin=project({x:0,y:0})
  line(origin,{x:origin.x+7,y:origin.y},PLAN_COLOURS.ink,.4);line(origin,{x:origin.x,y:origin.y+7},PLAN_COLOURS.ink,.4)
  label({x:origin.x+4,y:origin.y+10},'0,0',font*.8)
  return {marks,width,height,scale:printScale,labelled}
}
export type InstallerDrawing=ReturnType<typeof installerDrawing>
const escape=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;')
export function installerSvg(model:InstallerPlan){
  const drawing=installerDrawing(model,420,235,4.5)
  const shapes=drawing.marks.map(m=>{
    if(m.type==='line')return `<line x1="${m.a.x}" y1="${m.a.y}" x2="${m.b.x}" y2="${m.b.y}" stroke="${m.ink.colour}" stroke-width="${m.ink.width??.2}"${m.ink.dash?' stroke-dasharray="1 1"':''}/>`
    if(m.type==='circle')return `<circle cx="${m.at.x}" cy="${m.at.y}" r="${m.radius}" stroke="${m.ink.colour}" stroke-width="${m.ink.width??.2}" fill="${m.fill??'none'}"/>`
    return `<text x="${m.at.x}" y="${m.at.y}" font-size="${m.size}" fill="${m.colour}" text-anchor="${m.align==='center'?'middle':'start'}" dominant-baseline="central"${m.angle?` transform="rotate(${m.angle} ${m.at.x} ${m.at.y})"`:''} paint-order="stroke" stroke="#f5f6ef" stroke-width="1.4" stroke-linejoin="round">${escape(m.text)}</text>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 235" role="img" aria-label="Dimensioned deck setting-out plan; dimensions in millimetres"><style>text{font-family:Arial,sans-serif}</style>${shapes}</svg>`
}
