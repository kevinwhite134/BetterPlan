import type { Settings } from './planner.ts'

// A small deterministic preview needs no support solve, so the library stays
// quick even for unresolved or large projects. It follows outline, holes and finish.
export function projectThumbnail(settings:Settings){
  const points=settings.polygon,minX=Math.min(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),width=Math.max(...points.map(p=>p.x))-minX,depth=Math.max(...points.map(p=>p.y))-minY
  const project=(p:{x:number;y:number},z=0)=>({x:+((p.x-minX)*.82-(p.y-minY)*.57).toFixed(5),y:+((p.x-minX)*.3+(p.y-minY)*.43-z).toFixed(5)})
  const path=(ring:{x:number;y:number}[],z=0)=>ring.map((p,i)=>{const q=project(p,z);return `${i?'L':'M'}${q.x.toFixed(3)} ${q.y.toFixed(3)}`}).join('')+'Z'
  const outline=[points,...(settings.cutouts??[]).map(h=>h.polygon)].map(r=>path(r)).join(' '),height=Math.max(.07,settings.board.thickness/1000),bounds=points.flatMap(p=>[project(p),project(p,-height)])
  const xs=bounds.map(p=>p.x),ys=bounds.map(p=>p.y),pad=Math.max(width,depth)*.12,left=Math.min(...xs)-pad,top=Math.min(...ys)-pad,w=Math.max(...xs)-left+pad,h=Math.max(...ys)-top+pad
  const colour=settings.board.colour,shade='#'+[1,3,5].map(i=>Math.round(parseInt(colour.slice(i,i+2),16)*.72).toString(16).padStart(2,'0')).join('')
  const rows=Math.min(90,Math.max(1,Math.round((settings.direction==='horizontal'?depth:width)/((settings.board.width+settings.board.gap)/1000))))
  const lines=Array.from({length:rows-1},(_,i)=>{const t=(i+1)/rows,a=project(settings.direction==='horizontal'?{x:minX,y:minY+depth*t}:{x:minX+width*t,y:minY}),b=project(settings.direction==='horizontal'?{x:minX+width,y:minY+depth*t}:{x:minX+width*t,y:minY+depth});return `<path d="M${a.x} ${a.y}L${b.x} ${b.y}"/>`}).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${left} ${top} ${w} ${h}"><defs><clipPath id="deck"><path d="${outline}" clip-rule="evenodd"/></clipPath></defs><path d="${[points,...(settings.cutouts??[]).map(h=>h.polygon)].map(r=>path(r,-height)).join(' ')}" fill="${shade}" fill-rule="evenodd"/><path d="${outline}" fill="${colour}" fill-rule="evenodd" stroke="${shade}" stroke-width="${Math.max(width,depth)*.004}"/><g clip-path="url(#deck)" fill="none" stroke="${shade}" opacity=".7" stroke-width="${Math.max(width,depth)*.002}">${lines}</g></svg>`
}
