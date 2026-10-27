import { pedestalHeight, surveyReadings } from './pedestalSurvey.ts'
import { boardRings, ringPath } from './shapeGeometry.ts'
import { bounds } from './planner.ts'
import type { Plan, Point, Settings } from './planner.ts'
import { signedArea } from './deckGeometry.ts'
import { PEDESTAL_COLUMN_DIAMETER } from './frameHardware.ts'

// A fixed-camera finished view of the actual plan, shared by the report header
// and its Excel image. No controls or layer selection affect this snapshot.
export function deckPreviewSvg(plan:Plan,s:Settings):string{
  const box=bounds(plan.physical),angle=35*Math.PI/180,tilt=52*Math.PI/180
  const physical=(p:Point)=>s.direction==='vertical'?{x:p.y,y:p.x}:p
  const project=(p:Point,z=0)=>{const q=physical(p),x=q.x-box.width/2,y=q.y-box.depth/2;return {x:x*Math.cos(angle)-y*Math.sin(angle),y:(x*Math.sin(angle)+y*Math.cos(angle))*Math.cos(tilt)-z*Math.sin(tilt)}}
  const coordinates=(p:Point[],z=0)=>p.map(q=>project(q,z)).map(q=>`${q.x.toFixed(4)},${q.y.toFixed(4)}`).join(' ')
  const ground=-s.height/1000,boardBottom=-s.board.thickness/1000,head=-(s.board.thickness+plan.frame.rule.joist+plan.frame.rule.bearer)/1000
  const skirtBottom=boardBottom-(s.skirtingHeight??200)/1000,lowest=Math.min(ground-.03,s.skirting?skirtBottom:boardBottom)
  const projected=plan.p.flatMap(q=>[project(q),project(q,lowest)]),pad=Math.max(box.width,box.depth)*.045
  const minX=Math.min(...projected.map(q=>q.x))-pad,minY=Math.min(...projected.map(q=>q.y))-pad,maxX=Math.max(...projected.map(q=>q.x))+pad,maxY=Math.max(...projected.map(q=>q.y))+pad
  const shade=(factor:number)=>'#'+[1,3,5].map(i=>Math.round(parseInt(s.board.colour.slice(i,i+2),16)*factor).toString(16).padStart(2,'0')).join('')
  const polygon=(points:string,fill:string,stroke='#5a4937',width=.004,extra='')=>`<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round" ${extra}/>`
  const line=(a:Point,b:Point,z:number,colour:string,width:number)=>{const u=project(a,z),v=project(b,z);return `<line x1="${u.x}" y1="${u.y}" x2="${v.x}" y2="${v.y}" stroke="${colour}" stroke-width="${width}" stroke-linecap="round"/>`}
  const sign=signedArea(plan.physical)>0?1:-1
  const fronts=plan.p.map((a,i)=>({a,b:plan.p[(i+1)%plan.p.length]})).filter(({a,b})=>{const u=physical(a),v=physical(b);return ((v.y-u.y)*Math.sin(angle)-(v.x-u.x)*Math.cos(angle))*sign>1e-7}).sort((u,v)=>project(u.a).y+project(u.b).y-project(v.a).y-project(v.b).y)
  const face=(a:Point,b:Point,top:number,bottom:number)=>[project(a,top),project(b,top),project(b,bottom),project(a,bottom)].map(q=>`${q.x},${q.y}`).join(' ')
  const parts=[polygon(coordinates(plan.p,ground-.015),'#344b37','none',0,'opacity=".08"')]
  const readings=surveyReadings(s)
  for(const p of plan.frame.pedestals){const ground=pedestalHeight(p,s,plan.frame.rule,readings).ground,a=project(p,head),b=project(p,ground),r=(s.pedestalDiameter??150)/2000;parts.push(`<ellipse cx="${b.x}" cy="${b.y}" rx="${r}" ry="${r*Math.cos(tilt)}" fill="#4d5c47"/>`,`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#4d5c47" stroke-width="${Math.min(PEDESTAL_COLUMN_DIAMETER,r*1.6)}"/>`)}
  for(const m of plan.frame.members)parts.push(line(m.a,m.b,m.kind==='bearer'?head+m.size/2000:boardBottom-plan.frame.rule.joist/2000,m.kind==='bearer'?'#8b969f':'#b8c0c6',m.kind==='bearer'?.055:.035))
  for(const {a,b} of fronts)parts.push(polygon(face(a,b,0,boardBottom),shade(.8)))
  parts.push(`<path d="${ringPath([plan.p,...plan.holes].map(r=>r.map(p=>project(p))))}" fill-rule="evenodd" fill="#67553f"/>`)
  for(const piece of plan.boards.pieces)parts.push(`<path d="${ringPath(boardRings(piece).map(r=>r.map(p=>project(p))))}" fill-rule="evenodd" fill="${s.board.colour}" stroke="${shade(.65)}" stroke-width="${piece.kind==='perimeter'?.009:.004}" stroke-linejoin="round"/>`)
  if(s.skirting)for(const {a,b} of fronts)parts.push(polygon(face(a,b,boardBottom,skirtBottom),shade(.88)))
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="400" viewBox="${minX} ${minY} ${maxX-minX} ${maxY-minY}" preserveAspectRatio="xMidYMid meet">${parts.join('')}</svg>`
}

export function deckPreviewUrl(svg:string){return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}

export async function deckPreviewPng(svg:string,width=1440,height=800):Promise<string>{
  const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}))
  try{
    const image=new Image();image.src=url;await image.decode()
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height
    const context=canvas.getContext('2d');if(!context)throw new Error('Image rendering is unavailable.')
    context.drawImage(image,0,0,canvas.width,canvas.height)
    return canvas.toDataURL('image/png')
  }finally{URL.revokeObjectURL(url)}
}
