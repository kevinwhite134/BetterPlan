import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { Plan, Point, Settings } from './planner.ts'
import { structureGeometry, projectedStructure } from './structureGeometry.ts'
import { installerPlan } from './installerPlan.ts'
import { pdfBrand } from './pdfBrand.ts'
import { FRAME_COLOURS } from './frameColours.ts'

const MM=72/25.4,colour=(hex:string)=>rgb(parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255)
export function supportPdfScene(plan:Plan,s:Settings){
  if(!plan.frame.geometryPass)throw new Error('Resolve support geometry before downloading the 3D support PDF.')
  const angle=35*Math.PI/180,tilt=52*Math.PI/180
  const project=(p:Point&{z:number})=>({x:p.x*Math.cos(angle)-p.y*Math.sin(angle),y:(p.x*Math.sin(angle)+p.y*Math.cos(angle))*Math.cos(tilt)-p.z*Math.sin(tilt)})
  const parts=projectedStructure(structureGeometry(plan,s,'joists',true),35,52)
  const faces=parts.flatMap(part=>part.faces.map(face=>({fill:face.fill,points:face.points.map(project)})))
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity
  for(const face of faces)for(const p of face.points){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y)}
  return {faces,minX,minY,width:Math.max(.01,maxX-minX),height:Math.max(.01,maxY-minY),members:plan.frame.members.length,pedestals:plan.frame.pedestals.length}
}
export async function exportSupportPdf(plan:Plan,s:Settings,options:{logo?:Uint8Array;now?:Date}={}){
  const scene=supportPdfScene(plan,s),model=installerPlan(plan,s),doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),brand=await pdfBrand(doc,options.logo)
  const now=options.now??new Date(),page=doc.addPage([420*MM,297*MM]),reference=model.reference
  const safe=(value:string)=>value.replace(/[^\x20-\x7e®²×·]/g,' ')
  const text=(value:string,x:number,y:number,size=3,ink='#303728')=>page.drawText(safe(value),{x:x*MM,y:(297-y)*MM,size:size*MM,font,color:colour(ink)})
  doc.setTitle(`BetterDeck 3D support frame ${reference}`);doc.setAuthor('BetterDeck');doc.setCreator('BetterPlan');doc.setCreationDate(now);doc.setModificationDate(now)
  brand(page);text('3D joist & pedestal support frame',64,27,5)
  text(`${reference} | ${new Intl.DateTimeFormat('en-IE',{dateStyle:'medium',timeZone:'Europe/Dublin'}).format(now)}`,14,42)
  const scale=Math.min(386/scene.width,182/scene.height),left=210-scene.width*scale/2,top=57+(182-scene.height*scale)/2
  for(const face of scene.faces){const path=face.points.map((p,i)=>`${i?'L':'M'}${(left+(p.x-scene.minX)*scale)*MM} ${(top+(p.y-scene.minY)*scale)*MM}`).join(' ')+' Z';page.drawSvgPath(path,{x:0,y:297*MM,color:colour(face.fill)})}
  text('Purple: bearers',14,251,3,FRAME_COLOURS.bearer);text('Green: joists, rim & blocking',76,251,3,FRAME_COLOURS.joist);text('Dark: pedestals',181,251)
  text(`${model.width} × ${model.depth} mm overall | ${model.area.toFixed(2)} m² | ${scene.members} frame members | ${scene.pedestals} pedestals`,14,261)
  text(`Case ${plan.frame.rule.sheet} | ${s.load} kN/m² | Assembled isometric illustration, not a scale setting-out drawing.`,14,271,2.8)
  text('Verify site dimensions, pedestal capacities and supplier connection details before installation.',14,282,2.8)
  return doc.save()
}
