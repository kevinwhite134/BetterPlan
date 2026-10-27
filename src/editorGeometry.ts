import { distance } from './planner.ts'
import type { Point } from './planner.ts'

export const tidy=(n:number)=>Math.round(n*1000)/1000
export function bearing(a:Point,b:Point){return (Math.atan2(a.y-b.y,b.x-a.x)*180/Math.PI+360)%360}
export function pointAt(a:Point,length:number,degrees:number):Point {
  const angle=degrees*Math.PI/180
  return {x:tidy(a.x+length*Math.cos(angle)),y:tidy(a.y-length*Math.sin(angle))}
}
export function snapPoint(p:Point,grid:number,origin?:Point,angleStep=0):Point {
  let q={x:grid?Math.round(p.x/grid)*grid:p.x,y:grid?Math.round(p.y/grid)*grid:p.y}
  if(origin&&angleStep)q=pointAt(origin,distance(origin,q),Math.round(bearing(origin,q)/angleStep)*angleStep)
  return {x:tidy(q.x),y:tidy(q.y)}
}
export function projectOnEdge(p:Point,a:Point,b:Point):Point {
  const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy
  const t=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l)):.5
  return {x:tidy(a.x+t*dx),y:tidy(a.y+t*dy)}
}
export function winding(p:Point[]){return p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a.x*b.y-b.x*a.y},0)>=0?1:-1}
export function interiorAngle(p:Point[],i:number) {
  const a=p[(i+p.length-1)%p.length],b=p[i],c=p[(i+1)%p.length]
  const turn=((bearing(b,c)-bearing(a,b)+540)%360)-180
  return (180+winding(p)*turn+360)%360
}
export function setInteriorAngle(p:Point[],i:number,degrees:number):Point[] {
  const prev=p[(i+p.length-1)%p.length],a=p[i],next=(i+1)%p.length
  const b=pointAt(a,distance(a,p[next]),bearing(prev,a)-winding(p)*(180-degrees))
  return p.map((q,j)=>j===next?b:q)
}
export function evenlySpacedBreakers(run:number,count:number,occupiedWidth=0){const bay=(run-count*occupiedWidth)/(count+1);return Array.from({length:count},(_,i)=>tidy((i+1)*bay+i*occupiedWidth+occupiedWidth/2))}
export function moveBreaker(positions:number[],index:number,x:number,run:number,mirror:boolean) {
  const next=[...positions],original=positions[index]
  if(mirror){
    if(Math.abs(original-run/2)<.002){next[index]=tidy(run/2);return next}
    const pair=positions.findIndex((p,i)=>i!==index&&Math.abs(p-(run-original))<.002)
    if(pair<0)next.push(tidy(run-x));else next[pair]=tidy(run-x)
  }
  next[index]=tidy(x)
  return next
}
